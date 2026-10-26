import { FillFilter } from "../models/FillFilter";
import { FillStatus } from "../models/FillStatus";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { ensureWordList, MAX_STORED_FILLS, startFill, stopFill } from "./fillWorkerPool";
import { clearFill, updateGridConstraintInfo } from "./grid";
import { getSquaresForWord, isWordFull, mapKeys } from "./util";
import {
    GETTABLE_LIKELY,
    GETTABLE_MAYBE,
    GETTABLE_VERY,
    buildPackedWordIndex,
    installFillFilter,
    rebuildWordIndex,
    wordsWithGettable,
    wordsWithoutAvoid,
} from "./wordList";
import Globals from "./windowService";

export interface GettableFillCallbacks {
    onProgress: () => void;
    onComplete: () => void;
}

export type GettableFillMode = "fill" | "genKnowledge" | "allEntries";

export interface GettableFillOptions {
    /** Fill: Very, then add Likely. Gen. Knowledge: Very+Likely, then add Maybe. All Entries: entire dictionary. */
    mode?: GettableFillMode;
}

export type GettableFillStartResult = "started" | "nothingToFill";

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
 * Fill the active section, then raise a gettability quota until MAX_STORED_FILLS fills
 * are stored or the quota cap is reached (fills already found at lower levels are
 * deduplicated).
 *
 * Fill mode: Very Gettable only, then allow one Likely Gettable, then two, and so on.
 * Gen. Knowledge: Very + Likely Gettable, then progressively add Maybe Gettable answers.
 * All Entries: every dictionary word, with no gettability filter.
 * Entries already complete when the fill starts don't count toward the quota.
 */
export function startGettableFill(
    callbacks: GettableFillCallbacks,
    options?: GettableFillOptions,
): GettableFillStartResult {
    const gen = ++fillGeneration;
    stopFill();

    const mode: GettableFillMode = options?.mode === "genKnowledge" ? "genKnowledge"
        : options?.mode === "allEntries" ? "allEntries" : "fill";
    const grid = Globals.activeGrid!;
    const section = Globals.sections!.get(Globals.activeSectionId!)!;
    section.fillState = undefined;

    const openWords = getOpenWords(grid, section);
    if (openWords.length === 0) return "nothingToFill";

    updateGridConstraintInfo(grid);
    const exemptWords = mapKeys(grid.usedWords);
    const veryWords = wordsWithoutAvoid(wordsWithGettable(GETTABLE_VERY));
    const likelyWords = wordsWithoutAvoid(wordsWithGettable(GETTABLE_LIKELY));
    const maybeWords = wordsWithoutAvoid(wordsWithGettable(GETTABLE_MAYBE));
    const isAllEntries = mode === "allEntries";

    const baseWords = isAllEntries ? Array.from(Globals.knownWords || [])
        : mode === "genKnowledge" ? veryWords.concat(likelyWords) : veryWords;
    const quotaWords = isAllEntries ? [] : mode === "genKnowledge" ? maybeWords : likelyWords;
    const maxQuotaCap = quotaWords.length === 0 ? 0 : openWords.length;

    let maxQuota = 0;
    let started = false;

    const switchDictionary = (includeQuota: boolean) => {
        installFillFilter(undefined);
        applyFillDictionary(includeQuota ? baseWords.concat(quotaWords) : baseWords);
        updateGridConstraintInfo(grid);
    };

    const finish = () => {
        restoreFullWordIndex();
        clearFill(grid);
        Globals.fillStatus = FillStatus.Complete;
        callbacks.onComplete();
    };

    const startJob = (fillFilter: FillFilter) => {
        installFillFilter(fillFilter);
        if (gen === fillGeneration) callbacks.onProgress();
        startFill({
            grid,
            section,
            fillFilter,
            onProgress: () => {
                if (gen === fillGeneration) callbacks.onProgress();
            },
            onComplete: () => {
                if (gen !== fillGeneration) return;
                if (isAllEntries) {
                    finish();
                    return;
                }
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

        if (started) {
            if (maxQuota >= maxQuotaCap) {
                finish();
                return;
            }
            maxQuota++;
            if (maxQuota === 1) switchDictionary(true);
        }
        started = true;
        startJob({ maxLikelyGettable: maxQuota, likelyWords: quotaWords, seedWords: [], exemptWords });
    };

    switchDictionary(false);
    Globals.fillStatus = FillStatus.Running;
    runNext();
    return "started";
}
