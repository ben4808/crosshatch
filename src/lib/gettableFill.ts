import { EntryCandidate } from "../models/EntryCandidate";
import { FillFilter } from "../models/FillFilter";
import { FillStatus } from "../models/FillStatus";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { buildEntryCandidates } from "./entryCandidates";
import { ensureWordList, MAX_STORED_FILLS, startFill, stopFill } from "./fillWorkerPool";
import { clearFill, updateGridConstraintInfo } from "./grid";
import { getSquaresForWord, isWordFull, mapKeys, shuffleArray, wordLength } from "./util";
import {
    GETTABLE_LIKELY,
    GETTABLE_VERY,
    buildPackedWordIndex,
    installFillFilter,
    isFillSeedWord,
    maybePreferWords,
    rebuildWordIndex,
    wordsWithGettable,
    wordsWithoutAvoid,
} from "./wordList";
import Globals from "./windowService";

export interface GettableFillCallbacks {
    onProgress: () => void;
    onComplete: () => void;
}

export interface GettableFillOptions {
    /** Place one Maybe Gettable / Prefer seed in a longest open slot. Default false. */
    useMaybeGettableSeed?: boolean;
}

export type GettableFillStartResult = "started" | "noSeedWords" | "nothingToFill";

let fillGeneration = 0;

export function cancelGettableFill() {
    fillGeneration++;
    stopFill();
    restoreFullWordIndex();
}

function restoreFullWordIndex() {
    installFillFilter(undefined);
    rebuildWordIndex();
    if (Globals.wordList && Globals.knownWords) {
        ensureWordList(Globals.wordList, Globals.knownWords);
    }
}

function applyFillDictionary(words: string[]) {
    Globals.wordList = buildPackedWordIndex(words);
    if (Globals.wordList && Globals.knownWords) {
        ensureWordList(Globals.wordList, Globals.knownWords);
    }
}

function getOpenWords(grid: GridState, section: Section): GridWord[] {
    return mapKeys(section.words)
        .map(key => grid.words.get(key)!)
        .filter(word => !isWordFull(getSquaresForWord(grid, word)));
}

/**
 * Fill the active section with Very Gettable entries, then allow one Likely Gettable,
 * then two, and so on, until MAX_STORED_FILLS fills are stored or the Likely cap is
 * reached (fills already found at lower levels are deduplicated). If `useMaybeGettableSeed` is on, also
 * place exactly one Maybe Gettable / Prefer entry in a random longest open slot.
 * Entries already complete when the fill starts don't count toward the Likely quota.
 */
export function startGettableFill(
    callbacks: GettableFillCallbacks,
    options?: GettableFillOptions,
): GettableFillStartResult {
    const gen = ++fillGeneration;
    stopFill();

    const useSeed = !!options?.useMaybeGettableSeed;
    const grid = Globals.activeGrid!;
    const section = Globals.sections!.get(Globals.activeSectionId!)!;
    section.fillState = undefined;

    const seedWords = useSeed ? maybePreferWords() : [];
    if (useSeed && seedWords.length === 0) return "noSeedWords";

    const openWords = getOpenWords(grid, section);
    if (openWords.length === 0) return "nothingToFill";
    const seedLength = useSeed ? Math.max(...openWords.map(wordLength)) : 0;
    const seedSlots = useSeed ? openWords.filter(word => wordLength(word) === seedLength) : [];
    if (useSeed) shuffleArray(seedSlots);

    updateGridConstraintInfo(grid);
    const exemptWords = mapKeys(grid.usedWords);
    const veryWords = wordsWithoutAvoid(wordsWithGettable(GETTABLE_VERY));
    const likelyWords = wordsWithoutAvoid(wordsWithGettable(GETTABLE_LIKELY));
    const maxLikelyCap = likelyWords.length === 0 ? 0 : openWords.length - (useSeed ? 1 : 0);

    let maxLikely = 0;
    let slotIndex = 0;
    let startedUnseeded = false;

    // Constraint masks come from the whole fill dictionary (seeds included) so the
    // seed slot isn't pruned to Very Gettable letters before its seed is placed.
    const switchDictionary = (includeLikely: boolean) => {
        installFillFilter(undefined);
        applyFillDictionary(veryWords.concat(useSeed ? seedWords : [], includeLikely ? likelyWords : []));
        updateGridConstraintInfo(grid);
    };

    const finish = () => {
        restoreFullWordIndex();
        clearFill(grid);
        Globals.fillStatus = FillStatus.Complete;
        callbacks.onComplete();
    };

    const startJob = (fillFilter: FillFilter, rootWord?: GridWord, rootCandidates?: EntryCandidate[]) => {
        installFillFilter(fillFilter);
        startFill({
            grid,
            section,
            fillFilter,
            rootWord,
            rootCandidates,
            onProgress: () => {
                if (gen === fillGeneration) callbacks.onProgress();
            },
            onComplete: () => {
                if (gen !== fillGeneration) return;
                setTimeout(runNext, 0);
            },
        });
    };

    const runNext = () => {
        if (gen !== fillGeneration) return;
        if (section.candidates.size >= MAX_STORED_FILLS) {
            finish();
            return;
        }

        if (useSeed) {
            if (slotIndex >= seedSlots.length) {
                if (maxLikely >= maxLikelyCap) {
                    finish();
                    return;
                }
                maxLikely++;
                slotIndex = 0;
                if (maxLikely === 1) switchDictionary(true);
            }

            const seedSlot = seedSlots[slotIndex++];
            const fillFilter: FillFilter = { maxLikelyGettable: maxLikely, likelyWords, seedWords, exemptWords };
            installFillFilter(fillFilter);
            const rootCandidates = buildEntryCandidates(
                grid, seedSlot, getSquaresForWord(grid, seedSlot), false, isFillSeedWord);
            shuffleArray(rootCandidates);
            startJob(fillFilter, seedSlot, rootCandidates);
            return;
        }

        if (startedUnseeded) {
            if (maxLikely >= maxLikelyCap) {
                finish();
                return;
            }
            maxLikely++;
            if (maxLikely === 1) switchDictionary(true);
        }
        startedUnseeded = true;
        startJob({ maxLikelyGettable: maxLikely, likelyWords, seedWords, exemptWords });
    };

    switchDictionary(false);
    Globals.fillStatus = FillStatus.Running;
    runNext();
    return "started";
}
