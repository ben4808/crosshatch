import seedwordCluePromptUrl from "../prompts/seedword_clue_prompt.txt";
import seedCluePromptUrl from "../prompts/seed_clue_prompt.txt";
import cluePromptUrl from "../prompts/clue_prompt.txt";
import { ContentType } from "../models/ContentType";
import { FillFilter } from "../models/FillFilter";
import { FillStatus } from "../models/FillStatus";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { chalFetch } from "./chalApi";
import { PackedWordIndex } from "./sharedWordIndex";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { forwardCheckSection } from "./entryCandidates";
import { ensureWordList, MAX_STORED_FILLS, startFill, stopFill } from "./fillWorkerPool";
import { clearFill, getLettersFromSquares, populateWords, updateGridConstraintInfo } from "./grid";
import { countCurrentPatternFills, insertSectionCandidateIntoGrid, stampCandidateLayout } from "./section";
import {
    cloneGridForFill, forAllGridSquares, getGrid, getSquaresForWord, initializeSessionGlobals, isBlackSquare, isWordFull,
    mapKeys, mapValues, shuffleArray, wordKey, wordLength,
} from "./util";
import {
    GETTABLE_LIKELY,
    GETTABLE_VERY,
    buildPackedWordIndex,
    crosswordeseAndAbbreviationWords,
    installFillFilter,
    isCrosswordeseOrAbbreviation,
    isMagicPuzzleBlocked,
    wordsWithGettable,
} from "./wordList";
import Globals from "./windowService";

const SEED_CANDIDATE_COUNT = 10;
/** Seed candidates are drawn from all of these buckets, mixed with no fixed proportion. */
const SEED_FAMILIARITY_BUCKETS = ["General Knowledge", "Inferred"];
const MIN_SLOT_LENGTH = 3;
const TOTAL_STEPS = 4;
const NORMAL_CLUE_BATCH_SIZE = 10;
const STRAIGHT_CLUE_TYPE = "Straight";
const ASSOCIATION_CLUE_TYPE = "Association";
/** Clue type names exactly as clue_prompt.txt asks the AI to write them. */
const OTHER_CLUE_TYPES = [
    "Alternate Sense", ASSOCIATION_CLUE_TYPE, "Antonym", "Categorize", "Example", "Context", "Fun Fact",
];
/** A failed clue prompt is retried this many times (so up to 1 + MAX_CLUE_RETRIES attempts). */
export const MAX_CLUE_RETRIES = 2;
const CLUE_RETRY_DELAY_MS = 1500;
/** Model id chal-api routes to Muse Ember at high reasoning effort. */
export const MUSE_MODEL = "muse-ember";

/** Show Suggestions draws this many entries from each familiarity bucket, in this order. */
const SUGGESTION_QUOTAS = [
    { familiarityBucket: "General Knowledge", count: 4 },
    { familiarityBucket: "Inferred", count: 3 },
    { familiarityBucket: "Active", count: 3 },
];
const SUGGESTION_MIN_LENGTH = 5;
const SUGGESTION_MAX_LENGTH = 7;

export const MAGIC_PUZZLE_AUTHOR = "Crosshatch";

export interface FillPass {
    label: string;
    maxLikely: number;
    maxExtra: number;
}

/** Three fill attempts per seed placement; never includes Maybe Gettable. */
export const FILL_PASSES: FillPass[] = [
    { label: "all Very Gettable", maxLikely: 0, maxExtra: 0 },
    { label: "one Likely Gettable", maxLikely: 1, maxExtra: 0 },
    { label: "one Likely Gettable + one Crosswordese/Abbreviation", maxLikely: 1, maxExtra: 1 },
];

export interface MagicPuzzleCallbacks {
    onStatus: (status: string) => void;
    /** Fill progress (new fills stored in the active section); may be throttled. */
    onProgress: () => void;
    /** The grid itself changed (seed placement, black squares); redraw immediately. */
    onGridChanged: () => void;
}

export type MagicPuzzleResult =
    | { success: true; title: string }
    | { success: false; cancelled: boolean; message: string };

export interface SeedEntry {
    entry: string;
    displayText: string;
}

interface ParsedClue {
    item: string;
    clue: string;
}

export interface TypedClue {
    clue: string;
    clueType: string;
    timesUsed?: number;
}

export type ClueGenResult =
    | { success: true; message?: string }
    | { success: false; message: string };

export interface EntryClueStatus {
    entry: string;
    displayText: string | null;
    cluesGenerated: boolean;
    clues: { clue: string; clueType: string | null; isSeedword: boolean; timesUsed?: number }[];
}

export interface FillDictionaries {
    very: PackedWordIndex;
    likely: PackedWordIndex;
    all: PackedWordIndex;
    likelyWords: string[];
    extraWords: string[];
}

export interface SeedPlacement {
    squares: GridSquare[];
    saved: { content?: string; contentType: ContentType }[];
}

class MagicPuzzleCancelled extends Error {}

let magicGeneration = 0;
let abortController: AbortController | undefined;
let cancelActiveAttempt: (() => void) | undefined;

export function cancelMagicPuzzle() {
    magicGeneration++;
    abortController?.abort();
    cancelActiveAttempt?.();
    stopFill();
}

export async function runMagicPuzzle(callbacks: MagicPuzzleCallbacks): Promise<MagicPuzzleResult> {
    const gen = ++magicGeneration;
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    const signal = controller.signal;

    const fullIndex = Globals.wordList;
    const knownWords = Globals.knownWords;
    let seedPlacement: SeedPlacement | undefined;
    let committed = false;

    const checkCancelled = () => {
        if (gen !== magicGeneration) throw new MagicPuzzleCancelled();
    };
    const status = (step: number, text: string) => {
        checkCancelled();
        callbacks.onStatus(`Step ${step}/${TOTAL_STEPS}: ${text}`);
    };
    const switchDictionary = (index: PackedWordIndex) => {
        Globals.wordList = index;
        ensureWordList(index, knownWords);
    };

    try {
        if (!fullIndex || !knownWords) throw new Error("Load a word list first.");
        clearSeedword();

        applyStartingBlackSquares(getGrid());
        resetGridForPlacementRound(getGrid());
        callbacks.onGridChanged();

        // Step 1: random General Knowledge / Inferred seed candidates for the longest open slot.
        const seedLength = longestOpenSlotLength(getGrid());
        if (seedLength < MIN_SLOT_LENGTH) throw new Error(`The grid has no open slots of ${MIN_SLOT_LENGTH}+ letters.`);
        status(1, `Selecting ${SEED_CANDIDATE_COUNT} random ${SEED_FAMILIARITY_BUCKETS.join(" / ")} entries of length ${seedLength}…`);
        const seedCandidates = await fetchSeedCandidates(seedLength, signal);
        checkCancelled();

        // Step 2: AI picks the seed entry.
        status(2, `Waiting on AI to choose the seed entry from ${seedCandidates.length} candidates…`);
        const seed = await chooseSeedword(seedCandidates, signal);
        checkCancelled();

        // Step 3: find a grid the seed fits in with a gettable fill.
        status(3, "Building fill dictionaries…");
        const dictionaries = buildFillDictionaries(knownWords);

        let blackPairsAdded = 0;
        let found: string | undefined;
        let foundSlot: GridWord | undefined;
        let commitPromise: Promise<void> = Promise.resolve();
        let seedClueError: string | undefined;
        // Last pattern that actually produced fills. Later patterns replace the grid,
        // and this is restored if tightening the grid ends with nowhere left to search.
        let savedPuzzle: PuzzleSnapshot | undefined;

        const commitFirstFill = (sectionString: string, slot: GridWord) => {
            if (committed) return;
            const section = Globals.sections!.get(0)!;
            const candidate = section.candidates.get(sectionString);
            if (!candidate) return;
            if (!insertSectionCandidateIntoGrid(getGrid(), candidate, ContentType.ChosenSection)) return;
            committed = true;
            // The grid is now the puzzle. Don't let finally restore the pre-seed squares.
            seedPlacement = undefined;
            Globals.selectedSectionCandidateKeys!.set(section.id, candidate.sectionString);
            section.selectedCandidate = candidate.sectionString;
            rememberSeedword(seed.entry, slot, seedCandidates.find(c => c.entry === seed.entry)?.displayText);
            Globals.puzzle!.title = `Generated Puzzle ${formatDateMMDDYYYY(new Date())}`;
            Globals.puzzle!.author = MAGIC_PUZZLE_AUTHOR;
            callbacks.onGridChanged();
            callbacks.onStatus(
                `Step 3/${TOTAL_STEPS}: Selected seed ${seed.entry}; still filling (up to ${MAX_STORED_FILLS})…`);
            commitPromise = applySeedwordClue(seed.entry, seed.clue).then(() => {
                callbacks.onGridChanged();
            }).catch((err: any) => {
                if (gen !== magicGeneration) return;
                seedClueError = err?.message ? String(err.message) : String(err);
            });
        };

        while (true) {
            if (seedPlacement) {
                restoreSeed(seedPlacement);
                seedPlacement = undefined;
                clearSeedword();
            }
            // Fresh placement round on the current black-square pattern. Fills already
            // stored for earlier patterns stay in the Fills list. Try every seed-length
            // slot until one produces a fill, then every remaining fill pass on that
            // slot. A pass runs until it stores 2000 fills for this pattern or its
            // search is exhausted. When the pattern is exhausted below 2000, add
            // another black-square pair and keep going. Stop at 2000 fills for the
            // current pattern, or when no more pairs can be added.
            const activeGrid = getGrid();
            // Keep fills from earlier black-square patterns in the Fills list.
            resetGridForPlacementRound(activeGrid, true);
            Globals.fillStatus = FillStatus.Running;
            callbacks.onGridChanged();

            const section = Globals.sections!.get(0)!;
            const slots = seedSlots(activeGrid, seedLength, seed.entry);
            shuffleArray(slots);
            const attemptLabel = blackPairsAdded === 0
                ? "starting grid"
                : `${blackPairsAdded} black-square pair${blackPairsAdded === 1 ? "" : "s"} added`;

            let stopPattern = false;
            for (let i = 0; i < slots.length && !found && !stopPattern; i++) {
                const slot = slots[i];
                const positionLabel = `seed ${seed.entry} in ${slotLabel(slot)} (position ${i + 1} of ${slots.length}, ${attemptLabel})`;

                seedPlacement = placeSeed(activeGrid, slot, seed.entry);
                showSeedPlacement(seed.entry, slot);
                callbacks.onGridChanged();

                status(3, `Checking ${positionLabel}…`);
                const widest = FILL_PASSES[FILL_PASSES.length - 1];
                switchDictionary(dictionaries.all);
                installFillFilter(undefined);
                updateGridConstraintInfo(activeGrid);
                installFillFilter(makeFillFilter(activeGrid, widest, dictionaries));
                const fits = !forwardCheckSection(activeGrid, section);

                for (let p = 0; fits && p < FILL_PASSES.length && !stopPattern; p++) {
                    const pass = FILL_PASSES[p];
                    status(3, `Filling with ${positionLabel} — pass ${p + 1} of ${FILL_PASSES.length}: ${pass.label}…`);
                    switchDictionary(pass.maxExtra > 0 ? dictionaries.all : pass.maxLikely > 0 ? dictionaries.likely : dictionaries.very);
                    installFillFilter(undefined);
                    // Later passes must search the seed placement, not the fill already
                    // committed on screen. Workers receive a copy, so the grid can keep
                    // showing the selected fill.
                    const searchGrid = found ? gridWithSeedOnly(activeGrid) : activeGrid;
                    updateGridConstraintInfo(searchGrid);
                    const fillFilter = makeFillFilter(searchGrid, pass, dictionaries);
                    const attempt = await runFillAttempt(
                        searchGrid, section, fillFilter, callbacks.onProgress,
                        sectionString => commitFirstFill(sectionString, slot));
                    checkCancelled();
                    if (attempt.found) {
                        found = attempt.found;
                        foundSlot = slot;
                    }
                    if (countCurrentPatternFills(section) >= MAX_STORED_FILLS) stopPattern = true;
                    else if (!attempt.exhausted) {
                        if (!found) {
                            throw new Error(`The fill search for ${positionLabel} stopped before trying every fill (see the console for worker errors).`);
                        }
                        stopPattern = true;
                    }
                }

                if (!found) {
                    restoreSeed(seedPlacement);
                    seedPlacement = undefined;
                    clearSeedword();
                    callbacks.onGridChanged();
                }
            }

            if (stopPattern || countCurrentPatternFills(section) >= MAX_STORED_FILLS) break;

            const stored = section.candidates.size;
            // Stamp while this section still matches the grid. The next pattern's
            // word list is built as soon as the black squares are added.
            stampCandidateLayout(section);
            status(3, found
                ? `Stored ${stored} fill${stored === 1 ? "" : "s"}; adding black-square pair #${blackPairsAdded + 1}…`
                : slots.length === 0
                    ? `No ${seedLength}-letter slots fit the seed; adding black-square pair #${blackPairsAdded + 1}…`
                    : `No fill found with the seed in any of ${slots.length} positions; adding black-square pair #${blackPairsAdded + 1}…`);
            installFillFilter(undefined);
            switchDictionary(fullIndex);
            if (found) savedPuzzle = capturePuzzle();
            // Filled letters block new black squares. The snapshot above still has them.
            clearPlacedLetters(getGrid());
            if (!addRandomBlackSquarePair(getGrid(), seedLength)) {
                if (savedPuzzle) {
                    restorePuzzle(savedPuzzle);
                    committed = true;
                    callbacks.onGridChanged();
                } else {
                    throw new Error("No viable grid found: there's nowhere left to add black squares.");
                }
                break;
            }
            blackPairsAdded++;
            found = undefined;
            foundSlot = undefined;
            committed = false;
            clearSeedword();
            callbacks.onGridChanged();
        }

        installFillFilter(undefined);
        switchDictionary(fullIndex);
        if (found && foundSlot && !committed) commitFirstFill(found, foundSlot);
        if (!committed) throw new Error("The found fill went missing from the Fills list.");
        await commitPromise;
        Globals.fillStatus = FillStatus.Complete;
        callbacks.onGridChanged();

        // Title and author were set when the first fill was selected. Remaining clues
        // are generated later from the Clue View.
        const title = Globals.puzzle!.title!;
        callbacks.onStatus(seedClueError
            ? `Done, but the seed clue failed: ${seedClueError}`
            : `Done: "${title}" with seed ${seed.entry}.`);
        return { success: true, title };
    } catch (err: any) {
        if (err instanceof MagicPuzzleCancelled || gen !== magicGeneration) {
            return { success: false, cancelled: true, message: "Cancelled." };
        }
        const message = err?.message ? String(err.message) : String(err);
        callbacks.onStatus(`Failed: ${message}`);
        return { success: false, cancelled: false, message };
    } finally {
        if (abortController === controller) abortController = undefined;
        stopFill();
        installFillFilter(undefined);
        if (fullIndex && knownWords && Globals.wordList !== fullIndex) switchDictionary(fullIndex);
        if (seedPlacement) {
            restoreSeed(seedPlacement);
            clearSeedword();
        }
        if (committed) {
            if (Globals.fillStatus === FillStatus.Running) Globals.fillStatus = FillStatus.Complete;
        } else if (Globals.fillStatus === FillStatus.Running) {
            clearFill(getGrid());
        }
    }
}

/** onClues runs each time clues are applied to the puzzle (once per returned batch). */
export async function generateNormalClues(
    onStatus: (status: string) => void,
    onClues?: () => void,
): Promise<ClueGenResult> {
    try {
        const grid = getGrid();
        const answers = gridAnswers(grid).filter(answer => answer !== Globals.seedEntry);
        if (answers.length === 0) throw new Error("There are no filled answers to clue.");

        const { entries: statuses } = await postJson<{ entries: EntryClueStatus[] }>("/magicPuzzle/entryClues", {
            entries: answers,
        });
        const statusByAnswer = new Map<string, EntryClueStatus>();
        (statuses || []).forEach(status => statusByAnswer.set(status.entry.toUpperCase(), status));

        const cluesByAnswer = new Map<string, TypedClue[]>();
        const toGenerate: string[] = [];
        answers.forEach(answer => {
            const status = statusByAnswer.get(answer);
            const existing = (status?.clues || []).filter(clue => !clue.isSeedword && clue.clue);
            if (status?.cluesGenerated && existing.length > 0) {
                cluesByAnswer.set(answer, existing.map(clue => ({
                    clue: clue.clue,
                    clueType: clue.clueType || "",
                })));
            } else {
                toGenerate.push(answer);
            }
        });

        const puzzleClues = Globals.puzzle!.clues;
        const skipKeys = new Set(seedWordKeys());
        let assigned = 0;
        // Puts a clue on every grid word whose answer is in `forAnswers`.
        const assignClues = (forAnswers: Iterable<string>) => {
            const targets = new Set(forAnswers);
            grid.words.forEach(word => {
                const key = wordKey(word);
                if (skipKeys.has(key)) return;
                const answer = getLettersFromSquares(getSquaresForWord(grid, word));
                if (answer === Globals.seedEntry || !targets.has(answer)) return;
                const chosen = pickGeneratedClue(cluesByAnswer.get(answer) || []);
                if (!chosen) return;
                puzzleClues.set(key, chosen);
                assigned++;
            });
        };

        // Entries that already have clues are filled in before any prompt is sent.
        assignClues(cluesByAnswer.keys());
        if (assigned > 0) onClues?.();

        const batches = chunk(toGenerate, NORMAL_CLUE_BATCH_SIZE);
        let failedBatches = 0;
        let lastError = "";
        if (batches.length > 0) {
            const cluePrompt = await loadPrompt(cluePromptUrl);
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const promptLabel = `prompt ${i + 1} of ${batches.length}`;
                onStatus(`Generating (${promptLabel})...`);
                const displayByAnswer = displayTextsFromStatuses(batch, statusByAnswer);
                const prompt = cluePrompt.replace("[[DATA]]", formatCluePromptData(
                    batch,
                    displayByAnswer,
                    existingClueTextsByAnswer(batch, statusByAnswer),
                ));
                let parsed: Map<string, TypedClue[]>;
                try {
                    parsed = await requestTypedClues(prompt, batch, displayByAnswer, {
                        onRetry: retry => onStatus(
                            `Generating (${promptLabel}, retry ${retry} of ${MAX_CLUE_RETRIES})...`),
                    });
                } catch (err: any) {
                    failedBatches++;
                    lastError = err?.message ? String(err.message) : String(err);
                    continue;
                }

                const newClues: { entry: string; clue: string; isSeedword: boolean; clueType: string }[] = [];
                parsed.forEach((typedClues, answer) => {
                    const existing = cluesByAnswer.get(answer) || [];
                    cluesByAnswer.set(answer, existing.concat(typedClues));
                    typedClues.forEach(typed => {
                        newClues.push({
                            entry: answer,
                            clue: typed.clue,
                            isSeedword: false,
                            clueType: typed.clueType,
                        });
                    });
                });
                // Apply this batch right away; later batches (and the save) don't hold it up.
                assignClues(parsed.keys());
                onClues?.();
                if (newClues.length > 0) {
                    try {
                        await postJson("/magicPuzzle/generatedClues", { clues: newClues });
                    } catch (err) {
                        console.error("Failed to save generated clues", err);
                    }
                }
            }
        }

        let missing = 0;
        grid.words.forEach(word => {
            if (skipKeys.has(wordKey(word))) return;
            const answer = getLettersFromSquares(getSquaresForWord(grid, word));
            if (answer === Globals.seedEntry) return;
            if (!puzzleClues.get(wordKey(word))) missing++;
        });

        if (failedBatches > 0 && failedBatches === batches.length && assigned === 0) {
            return { success: false, message: `Clue generation failed: ${lastError}` };
        }
        const notes: string[] = [];
        if (failedBatches > 0) {
            notes.push(`${failedBatches} of ${batches.length} prompts failed after ${MAX_CLUE_RETRIES} retries (${lastError})`);
        }
        if (missing > 0) notes.push(`${missing} still need clues`);
        return {
            success: true,
            message: notes.length > 0 ? `Assigned ${assigned} clues (${notes.join("; ")}).` : undefined,
        };
    } catch (err: any) {
        const message = err?.message ? String(err.message) : String(err);
        return { success: false, message };
    }
}

export function makeFillFilter(grid: GridState, pass: FillPass, dictionaries: FillDictionaries): FillFilter {
    return {
        maxLikelyGettable: pass.maxLikely,
        likelyWords: dictionaries.likelyWords,
        seedWords: [],
        exemptWords: mapKeys(grid.usedWords),
        maxExtra: pass.maxExtra,
        extraWords: dictionaries.extraWords,
    };
}

export function buildFillDictionaries(knownWords: Set<string>, excluded?: Set<string>): FillDictionaries {
    const isRegionalism = (word: string) => !!Globals.wordRegionalism?.has(word);
    const isExcluded = (word: string) => !!excluded?.has(word);
    const isPlain = (word: string) =>
        !isMagicPuzzleBlocked(word) && !isCrosswordeseOrAbbreviation(word) && !isExcluded(word);
    const veryWords = wordsWithGettable(GETTABLE_VERY).filter(isPlain);
    // Regionalism stays Likely Gettable for display, but it is not quota-limited.
    const regionalismWords = wordsWithGettable(GETTABLE_LIKELY).filter(word =>
        isRegionalism(word) && !isMagicPuzzleBlocked(word) && !isCrosswordeseOrAbbreviation(word)
        && !isExcluded(word));
    const likelyWords = wordsWithGettable(GETTABLE_LIKELY).filter(word => isPlain(word) && !isRegionalism(word));
    const extraWords = crosswordeseAndAbbreviationWords()
        .filter(word => knownWords.has(word) && !isMagicPuzzleBlocked(word) && !isExcluded(word)
            && Globals.wordGettable?.get(word) === GETTABLE_VERY);

    const baseWords = veryWords.concat(regionalismWords);
    return {
        very: buildPackedWordIndex(baseWords),
        likely: buildPackedWordIndex(baseWords.concat(likelyWords)),
        all: buildPackedWordIndex(baseWords.concat(likelyWords, extraWords)),
        likelyWords,
        extraWords,
    };
}

interface FillAttemptResult {
    found?: string;
    /** True only when every fill in the search space was tried without finding one. */
    exhausted: boolean;
}

/**
 * Runs until MAX_STORED_FILLS fills are stored or the search space is exhausted.
 * onFirstFill runs when the first fill is stored; the search keeps going after that.
 * Resolves with no fill when the search is exhausted, cut short, or cancelled.
 */
function runFillAttempt(
    grid: GridState,
    section: Section,
    fillFilter: FillFilter,
    onProgress: () => void,
    onFirstFill: (sectionString: string) => void,
): Promise<FillAttemptResult> {
    return new Promise(resolve => {
        let settled = false;
        let first: string | undefined;
        const settle = (exhausted: boolean) => {
            if (settled) return;
            settled = true;
            if (cancelActiveAttempt === cancel) cancelActiveAttempt = undefined;
            resolve({ found: first, exhausted });
        };
        const cancel = () => {
            stopFill();
            settle(false);
        };
        cancelActiveAttempt = cancel;

        startFill({
            grid,
            section,
            fillFilter,
            onFound: sectionString => {
                if (first) return;
                first = sectionString;
                try {
                    onFirstFill(sectionString);
                } catch (err) {
                    console.error("Failed to select the first fill", err);
                }
            },
            onProgress,
            onComplete: exhausted => settle(exhausted),
        });
    });
}

function longestOpenSlotLength(grid: GridState): number {
    let longest = 0;
    grid.words.forEach(word => {
        if (!isWordFull(getSquaresForWord(grid, word))) longest = Math.max(longest, wordLength(word));
    });
    return longest;
}

export function seedSlots(grid: GridState, length: number, seed: string): GridWord[] {
    return mapValues(grid.words).filter(word => wordLength(word) === length && seedMatchesSlot(grid, word, seed));
}

interface SquareSnap {
    type: SquareType;
    content?: string;
    contentType: ContentType;
}

interface PuzzleSnapshot {
    squares: SquareSnap[][];
    candidates: SectionCandidate[];
    selectedCandidate?: string;
    seedEntry?: string;
    seedWordKey?: string;
    seedDisplayText?: string;
    title?: string;
    author?: string;
}

function capturePuzzle(): PuzzleSnapshot {
    const grid = getGrid();
    const section = Globals.sections!.get(0)!;
    return {
        squares: grid.squares.map(row => row.map(sq => ({
            type: sq.type,
            content: sq.content,
            contentType: sq.contentType,
        }))),
        candidates: Array.from(section.candidates.values()).map(candidate => ({ ...candidate })),
        selectedCandidate: section.selectedCandidate,
        seedEntry: Globals.seedEntry,
        seedWordKey: Globals.seedWordKey,
        seedDisplayText: Globals.seedDisplayText,
        title: Globals.puzzle?.title,
        author: Globals.puzzle?.author,
    };
}

function restorePuzzle(snap: PuzzleSnapshot) {
    const grid = getGrid();
    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            const sq = grid.squares[r][c];
            const saved = snap.squares[r][c];
            sq.type = saved.type;
            sq.content = saved.content;
            sq.contentType = saved.contentType;
        }
    }
    grid.userFilledSectionCandidates.clear();
    populateWords(grid);
    initializeSessionGlobals();
    const section = Globals.sections!.get(0)!;
    snap.candidates.forEach(candidate => {
        section.candidates.set(candidate.sectionString, { ...candidate, sectionId: section.id });
    });
    section.selectedCandidate = snap.selectedCandidate;
    if (snap.selectedCandidate) {
        Globals.selectedSectionCandidateKeys!.set(section.id, snap.selectedCandidate);
        grid.userFilledSectionCandidates.set(snap.selectedCandidate, true);
    }
    Globals.seedEntry = snap.seedEntry;
    Globals.seedWordKey = snap.seedWordKey;
    Globals.seedDisplayText = snap.seedDisplayText;
    if (Globals.puzzle) {
        if (snap.title !== undefined) Globals.puzzle.title = snap.title;
        if (snap.author !== undefined) Globals.puzzle.author = snap.author;
    }
    updateGridConstraintInfo(grid);
}

/** Copy of the grid with only the seed (and typed letters) still filled. */
export function gridWithSeedOnly(grid: GridState): GridState {
    const copy = cloneGridForFill(grid);
    forAllGridSquares(copy, sq => {
        if (isBlackSquare(sq) || sq.contentType === ContentType.User || sq.contentType === ContentType.Seedword) return;
        sq.content = undefined;
        sq.contentType = ContentType.Autofill;
    });
    return copy;
}

export function clearPlacedLetters(grid: GridState) {
    forAllGridSquares(grid, sq => {
        if (isBlackSquare(sq) || sq.contentType === ContentType.User) return;
        sq.content = undefined;
        sq.contentType = ContentType.Autofill;
    });
    updateGridConstraintInfo(grid);
}

/**
 * Clear leftover fill/seed letters and rebuild sections for a new placement round.
 * When preserveFills is set, fills already stored (including other black-square
 * patterns) stay in the new section's candidate list.
 */
export function resetGridForPlacementRound(grid: GridState, preserveFills = false) {
    const previousSection = Globals.sections?.get(0);
    const preserved = preserveFills && previousSection
        ? Array.from(previousSection.candidates.values()).map(candidate => ({
            ...candidate,
            squareKeys: candidate.squareKeys?.slice(),
        }))
        : undefined;

    grid.userFilledSectionCandidates.clear();
    forAllGridSquares(grid, sq => {
        if (isBlackSquare(sq) || sq.contentType === ContentType.User) return;
        sq.content = undefined;
        sq.contentType = ContentType.Autofill;
    });
    populateWords(grid);
    initializeSessionGlobals();
    const section = Globals.sections!.get(0)!;
    section.candidates = new Map<string, SectionCandidate>();
    preserved?.forEach(candidate => {
        section.candidates.set(candidate.sectionString, {
            ...candidate,
            sectionId: section.id,
            isFilteredOut: false,
        });
    });
    section.selectedCandidate = undefined;
    section.fillState = undefined;
    updateGridConstraintInfo(grid);
}

function slotLabel(word: GridWord): string {
    return `${word.number}-${word.direction === WordDirection.Across ? "Across" : "Down"}`;
}

function seedMatchesSlot(grid: GridState, slot: GridWord, seed: string): boolean {
    const squares = getSquaresForWord(grid, slot);
    return squares.length === seed.length && squares.every((sq, i) => !sq.content || sq.content === seed[i]);
}

export function placeSeed(grid: GridState, slot: GridWord, seed: string): SeedPlacement {
    const squares = getSquaresForWord(grid, slot);
    const saved = squares.map(sq => ({ content: sq.content, contentType: sq.contentType }));
    squares.forEach((sq, i) => {
        sq.content = seed[i];
        sq.contentType = ContentType.Seedword;
    });
    return { squares, saved };
}

/** Mark the slot being tried as the seed so the grid draws it in seedword style. */
function showSeedPlacement(entry: string, slot: GridWord) {
    Globals.seedEntry = entry;
    Globals.seedWordKey = wordKey(slot);
    Globals.seedDisplayText = undefined;
}

function clearSeedword() {
    Globals.seedEntry = undefined;
    Globals.seedWordKey = undefined;
    Globals.seedDisplayText = undefined;
}

function rememberSeedword(entry: string, slot: GridWord | undefined, displayText?: string) {
    const oldKey = Globals.seedWordKey;
    const newKey = slot ? wordKey(slot) : undefined;
    // Drop the clue on the previous slot before the new slot receives it.
    if (oldKey && newKey && oldKey !== newKey) Globals.puzzle?.clues.delete(oldKey);
    Globals.seedEntry = entry;
    Globals.seedWordKey = newKey;
    Globals.seedDisplayText = displayText || entry;
    if (slot) {
        getSquaresForWord(getGrid(), slot).forEach(sq => { sq.contentType = ContentType.Seedword; });
    }
}

/** Move the seed clue onto the slot that now contains the seed entry. */
export function moveSeedClue(grid: GridState) {
    const entry = Globals.seedEntry;
    const clues = Globals.puzzle?.clues;
    if (!entry || !clues) return;

    const oldKey = Globals.seedWordKey;
    let slot: GridWord | undefined;
    if (oldKey) {
        const current = grid.words.get(oldKey);
        if (current && getLettersFromSquares(getSquaresForWord(grid, current)) === entry) slot = current;
    }
    if (!slot) {
        for (const word of grid.words.values()) {
            if (getLettersFromSquares(getSquaresForWord(grid, word)) === entry) {
                slot = word;
                break;
            }
        }
    }
    if (!slot) return;

    const newKey = wordKey(slot);
    const clue = oldKey ? clues.get(oldKey) : undefined;
    if (oldKey && oldKey !== newKey) clues.delete(oldKey);
    if (clue !== undefined) clues.set(newKey, clue);
    Globals.seedWordKey = newKey;
    getSquaresForWord(grid, slot).forEach(sq => { sq.contentType = ContentType.Seedword; });
}

async function applySeedwordClue(entry: string, clue: string) {
    const clues = Globals.puzzle!.clues;
    seedWordKeys().forEach(key => clues.set(key, clue));
    await postJson("/magicPuzzle/generatedClues", {
        clues: [{ entry, clue, isSeedword: true }],
    });
}

function seedWordKeys(): string[] {
    const keys: string[] = [];
    if (Globals.seedWordKey) keys.push(Globals.seedWordKey);
    const seedEntry = Globals.seedEntry;
    if (!seedEntry) return keys;
    getGrid().words.forEach(word => {
        const key = wordKey(word);
        if (keys.includes(key)) return;
        if (getLettersFromSquares(getSquaresForWord(getGrid(), word)) === seedEntry) keys.push(key);
    });
    return keys;
}

export function restoreSeed(placement: SeedPlacement) {
    placement.squares.forEach((sq, i) => {
        sq.content = placement.saved[i].content;
        sq.contentType = placement.saved[i].contentType;
    });
    updateGridConstraintInfo(getGrid());
}

function gridAnswers(grid: GridState): string[] {
    const answers = new Set<string>();
    grid.words.forEach(word => {
        const letters = getLettersFromSquares(getSquaresForWord(grid, word));
        if (/^[A-Z]+$/.test(letters)) answers.add(letters);
    });
    return Array.from(answers);
}

/**
 * Starting black squares for a Magic Puzzle grid.
 * A 3- or 4-letter seed changes the otherwise empty 5×5 start. Other sizes ignore seed length.
 */
export function startingBlackSquares(size: number, seedLength?: number): [number, number][] | undefined {
    const last = size - 1;
    if (size === 5 && seedLength === 3) {
        // (0,0), (0,1), (1,0) and their 180° reflections.
        return [
            [0, 0], [0, 1], [1, 0],
            [last, last], [last, last - 1], [last - 1, last],
        ];
    }
    if (size === 5 && seedLength === 4) {
        return [[0, 0], [last, last]];
    }
    switch (size) {
        case 5:
            return [];
        case 6:
            return [[0, 0], [last, last]];
        case 7:
            // (0,0), (0,1), (0,2), (1,0), (1,1), (2,0) and their 180° reflections.
            return [
                [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [2, 0],
                [last, last], [last, last - 1], [last, last - 2],
                [last - 1, last], [last - 1, last - 1], [last - 2, last],
            ];
        default:
            return undefined;
    }
}

/**
 * Reset the grid's black squares to the Magic Puzzle starting pattern for its size.
 * Returns true when the grid changed.
 */
export function applyStartingBlackSquares(grid: GridState, seedLength?: number): boolean {
    const blacks = grid.width === grid.height ? startingBlackSquares(grid.width, seedLength) : undefined;
    if (!blacks) throw new Error("Magic Puzzle supports 5x5, 6x6, and 7x7 grids only.");

    const blackKeys = new Set(blacks.map(([r, c]) => r * grid.width + c));
    const toChange: GridSquare[] = [];
    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            const sq = grid.squares[r][c];
            const shouldBeBlack = blackKeys.has(r * grid.width + c);
            if (isBlackSquare(sq) === shouldBeBlack) continue;
            if (shouldBeBlack && sq.content && sq.contentType === ContentType.User) {
                throw new Error("Clear the typed letters in the grid's corners before running Magic Puzzle.");
            }
            toChange.push(sq);
        }
    }
    if (toChange.length === 0) return false;

    toChange.forEach(sq => {
        sq.type = isBlackSquare(sq) ? SquareType.White : SquareType.Black;
        sq.content = undefined;
    });
    populateWords(grid);
    initializeSessionGlobals();
    clearFill(grid);
    return true;
}

function isAdjacentToBlack(grid: GridState, row: number, col: number): boolean {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && c >= 0 && r < grid.height && c < grid.width && isBlackSquare(grid.squares[r][c])) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Add a 180°-symmetric pair of black squares that leaves no white run shorter than
 * MIN_SLOT_LENGTH next to them, keeps the white squares connected, and keeps at least one
 * slot of seedLength. Prefers squares adjacent to existing blacks (growing from the corners).
 * Never blackens the center square of an odd-sized grid (it is its own partner, so it's skipped).
 * Never blackens the northeast or southwest corner squares.
 * Returns false if no such pair exists.
 */
export function addRandomBlackSquarePair(grid: GridState, seedLength: number): boolean {
    const h = grid.height;
    const w = grid.width;
    const adjacent: [number, number][] = [];
    const rest: [number, number][] = [];
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            const pr = h - 1 - r;
            const pc = w - 1 - c;
            if (r * w + c >= pr * w + pc) continue;
            if (isNortheastOrSouthwestCorner(r, c, h, w) || isNortheastOrSouthwestCorner(pr, pc, h, w)) continue;
            const sq = grid.squares[r][c];
            const partner = grid.squares[pr][pc];
            if (isBlackSquare(sq) || isBlackSquare(partner) || sq.content || partner.content) continue;
            if (isAdjacentToBlack(grid, r, c) || isAdjacentToBlack(grid, pr, pc)) adjacent.push([r, c]);
            else rest.push([r, c]);
        }
    }
    shuffleArray(adjacent);
    shuffleArray(rest);

    for (const [r, c] of adjacent.concat(rest)) {
        const pair: [number, number][] = [[r, c], [h - 1 - r, w - 1 - c]];
        pair.forEach(([row, col]) => { grid.squares[row][col].type = SquareType.Black; });
        if (isValidBlackSquarePlacement(grid, pair, seedLength)) {
            populateWords(grid);
            return true;
        }
        pair.forEach(([row, col]) => { grid.squares[row][col].type = SquareType.White; });
    }
    return false;
}

function isNortheastOrSouthwestCorner(row: number, col: number, height: number, width: number): boolean {
    return (row === 0 && col === width - 1) || (row === height - 1 && col === 0);
}

function isWhite(grid: GridState, row: number, col: number): boolean {
    return row >= 0 && col >= 0 && row < grid.height && col < grid.width && !isBlackSquare(grid.squares[row][col]);
}

function whiteRunLength(grid: GridState, row: number, col: number, across: boolean): number {
    const dr = across ? 0 : 1;
    const dc = across ? 1 : 0;
    let length = 1;
    for (let r = row - dr, c = col - dc; isWhite(grid, r, c); r -= dr, c -= dc) length++;
    for (let r = row + dr, c = col + dc; isWhite(grid, r, c); r += dr, c += dc) length++;
    return length;
}

function placementLeavesValidRuns(grid: GridState, blacks: [number, number][]): boolean {
    for (const [r, c] of blacks) {
        const neighbors: [number, number, boolean][] = [[r - 1, c, false], [r + 1, c, false], [r, c - 1, true], [r, c + 1, true]];
        for (const [nr, nc, across] of neighbors) {
            if (isWhite(grid, nr, nc) && whiteRunLength(grid, nr, nc, across) < MIN_SLOT_LENGTH) return false;
        }
    }
    return true;
}

function isValidBlackSquarePlacement(grid: GridState, blacks: [number, number][], seedLength: number): boolean {
    return placementLeavesValidRuns(grid, blacks)
        && areWhiteSquaresConnected(grid)
        && hasRunOfLength(grid, seedLength);
}

function areWhiteSquaresConnected(grid: GridState): boolean {
    let total = 0;
    let start: [number, number] | undefined;
    for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
            if (!isWhite(grid, r, c)) continue;
            total++;
            if (!start) start = [r, c];
        }
    }
    if (!start) return false;

    const seen = new Set<number>([start[0] * grid.width + start[1]]);
    const stack = [start];
    while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            const key = nr * grid.width + nc;
            if (!isWhite(grid, nr, nc) || seen.has(key)) continue;
            seen.add(key);
            stack.push([nr, nc]);
        }
    }
    return seen.size === total;
}

function hasRunOfLength(grid: GridState, length: number): boolean {
    for (let r = 0; r < grid.height; r++) {
        let run = 0;
        for (let c = 0; c <= grid.width; c++) {
            if (c < grid.width && isWhite(grid, r, c)) { run++; continue; }
            if (run === length) return true;
            run = 0;
        }
    }
    for (let c = 0; c < grid.width; c++) {
        let run = 0;
        for (let r = 0; r <= grid.height; r++) {
            if (r < grid.height && isWhite(grid, r, c)) { run++; continue; }
            if (run === length) return true;
            run = 0;
        }
    }
    return false;
}

function normalizeEntryKey(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
}

/** Parse "<item> : <clue>" lines from an AI response. */
function parseClueLines(response: string): ParsedClue[] {
    const parsed: ParsedClue[] = [];
    for (const raw of response.split(/\r?\n/)) {
        const line = raw.replace(/\*\*/g, "").replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "").trim();
        let sepIndex = line.indexOf(" : ");
        let sepLength = 3;
        if (sepIndex < 0) {
            sepIndex = line.indexOf(":");
            sepLength = 1;
        }
        if (sepIndex <= 0) continue;
        const item = line.slice(0, sepIndex).trim();
        const clue = line.slice(sepIndex + sepLength).trim();
        if (item && clue) parsed.push({ item, clue });
    }
    return parsed;
}

/** Random seed candidates of the given length from the General Knowledge and Inferred buckets. */
export async function fetchSeedCandidates(
    length: number,
    signal?: AbortSignal,
    options?: { excludeSeedwordClues?: boolean },
): Promise<SeedEntry[]> {
    const { entries } = await postJson<{ entries: SeedEntry[] }>("/magicPuzzle/seedEntries", {
        length,
        count: SEED_CANDIDATE_COUNT,
        familiarityBuckets: SEED_FAMILIARITY_BUCKETS,
        excludeSeedwordClues: options?.excludeSeedwordClues === true,
    }, signal);
    if (!entries || entries.length === 0) {
        throw new Error(`No ${SEED_FAMILIARITY_BUCKETS.join(" or ")} entries of length ${length} found in the database.`);
    }
    return entries;
}

/** Asks the AI (seedword_clue_prompt.txt) to pick the best seed from the candidates and clue it. */
export async function chooseSeedword(
    candidates: SeedEntry[],
    signal?: AbortSignal,
    model?: string,
): Promise<{ entry: string; clue: string; displayText: string }> {
    const seedPrompt = await loadPrompt(seedwordCluePromptUrl, signal);
    const response = await makeAICall(
        seedPrompt.replace("[[DATA]]", candidates.map(c => c.displayText || c.entry).join("\n")), signal, model);
    const seed = matchSeedResponse(response, candidates);
    if (!seed) throw new Error("Couldn't match the AI's seed response to any candidate entry.");
    const displayText = candidates.find(c => c.entry === seed.entry)?.displayText || seed.entry;
    return { ...seed, displayText };
}

function matchSeedResponse(response: string, candidates: SeedEntry[]): { entry: string; clue: string } | undefined {
    const byKey = new Map<string, string>();
    candidates.forEach(candidate => {
        byKey.set(candidate.entry, candidate.entry);
        if (candidate.displayText) byKey.set(normalizeEntryKey(candidate.displayText), candidate.entry);
    });
    for (const { item, clue } of parseClueLines(response)) {
        const entry = byKey.get(normalizeEntryKey(item));
        if (entry) return { entry, clue };
    }
    return undefined;
}

function canonicalClueType(raw: string): string | undefined {
    const normalized = raw.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
    return [STRAIGHT_CLUE_TYPE, ...OTHER_CLUE_TYPES].find(type => type.toLowerCase() === normalized);
}

export function parseTypedClueResponse(
    response: string,
    answers: string[],
    displayByAnswer: Map<string, string>,
): Map<string, TypedClue[]> {
    const itemToAnswer = new Map<string, string>();
    answers.forEach(answer => {
        itemToAnswer.set(normalizeEntryKey(answer), answer);
        const display = displayByAnswer.get(answer);
        if (display) itemToAnswer.set(normalizeEntryKey(display), answer);
    });

    const clues = new Map<string, TypedClue[]>();
    let currentAnswer: string | undefined;
    for (const raw of response.split(/\r?\n/)) {
        const line = raw.replace(/\*\*/g, "").replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "").trim();
        if (!line) {
            currentAnswer = undefined;
            continue;
        }
        const sepIndex = line.indexOf(":");
        if (sepIndex > 0) {
            const type = canonicalClueType(line.slice(0, sepIndex));
            const clue = line.slice(sepIndex + 1).trim();
            if (type && clue && currentAnswer) {
                const list = clues.get(currentAnswer) || [];
                list.push({ clueType: type, clue });
                clues.set(currentAnswer, list);
                continue;
            }
            const answerFromPrefix = itemToAnswer.get(normalizeEntryKey(line.slice(0, sepIndex)));
            if (answerFromPrefix) {
                currentAnswer = answerFromPrefix;
                continue;
            }
        }
        const answer = itemToAnswer.get(normalizeEntryKey(line));
        if (answer) currentAnswer = answer;
    }
    return clues;
}

export function pickGeneratedClue(clues: TypedClue[], excludeTypes?: ReadonlySet<string>): string | undefined {
    const pool = excludeTypes && excludeTypes.size > 0
        ? clues.filter(clue => !excludeTypes.has(clue.clueType))
        : clues;
    if (pool.length === 0) return undefined;
    const straight = pool.filter(clue => clue.clueType === STRAIGHT_CLUE_TYPE);
    const association = pool.filter(clue => clue.clueType === ASSOCIATION_CLUE_TYPE);
    const others = pool.filter(clue =>
        clue.clueType
        && clue.clueType !== STRAIGHT_CLUE_TYPE
        && clue.clueType !== ASSOCIATION_CLUE_TYPE
    );
    const roll = Math.random();
    const picked = roll < 1 / 3
        ? pickFromClues(straight) ?? pickRandomOtherType(others) ?? pickFromClues(association)
        : roll < 2 / 3
            ? pickFromClues(association) ?? pickRandomOtherType(others) ?? pickFromClues(straight)
            : pickRandomOtherType(others) ?? pickFromClues(association) ?? pickFromClues(straight);
    if (picked) return picked;
    return pool[Math.floor(Math.random() * pool.length)].clue;
}

function pickFromClues(pool: TypedClue[]): string | undefined {
    if (pool.length === 0) return undefined;
    return pool[Math.floor(Math.random() * pool.length)].clue;
}

/** One clue from a type chosen uniformly among the types present. */
function pickRandomOtherType(others: TypedClue[]): string | undefined {
    if (others.length === 0) return undefined;
    const types = Array.from(new Set(others.map(clue => clue.clueType)));
    const type = types[Math.floor(Math.random() * types.length)];
    return pickFromClues(others.filter(clue => clue.clueType === type));
}

export function displayTextsFromStatuses(
    answers: string[],
    statusByAnswer: Map<string, EntryClueStatus>,
): Map<string, string> {
    const displayByAnswer = new Map<string, string>();
    answers.forEach(answer => {
        const display = statusByAnswer.get(answer)?.displayText;
        if (display) displayByAnswer.set(answer, display);
    });
    return displayByAnswer;
}

function chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
    return batches;
}

const promptCache = new Map<string, string>();

export async function loadPrompt(url: string, signal?: AbortSignal): Promise<string> {
    const cached = promptCache.get(url);
    if (cached !== undefined) return cached;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Failed to load prompt file (${res.status})`);
    const text = await res.text();
    promptCache.set(url, text);
    return text;
}

/**
 * [[DATA]] block for clue_prompt.txt: each item, then its existing clues, with a blank line between items.
 */
export function formatCluePromptData(
    answers: string[],
    displayByAnswer: Map<string, string>,
    existingByAnswer: Map<string, string[]> = new Map(),
): string {
    return answers.map(answer => {
        const lines = [displayByAnswer.get(answer) || answer];
        const seen = new Set<string>();
        for (const clue of existingByAnswer.get(answer) || []) {
            const text = clue.replace(/\s+/g, " ").trim();
            if (!text || seen.has(text)) continue;
            seen.add(text);
            lines.push(text);
        }
        return lines.join("\n");
    }).join("\n\n");
}

/** Existing clue texts for a prompt, from generated clues plus any extra (community) clues. */
export function existingClueTextsByAnswer(
    answers: string[],
    statuses: Map<string, EntryClueStatus>,
    extra: { [entry: string]: { clue: string }[] } = {},
): Map<string, string[]> {
    const map = new Map<string, string[]>();
    answers.forEach(answer => {
        map.set(answer, [
            ...(statuses.get(answer)?.clues || []).map(clue => clue.clue),
            ...(extra[answer] || []).map(clue => clue.clue),
        ]);
    });
    return map;
}

/** Random 5-7 letter suggestions: 4 General Knowledge, then 3 Inferred, then 3 Active. */
export async function fetchSeedSuggestions(
    excludeEntries: string[] = [],
    signal?: AbortSignal,
): Promise<SeedEntry[]> {
    const { entries } = await postJson<{ entries: SeedEntry[] }>("/magicPuzzle/seedEntries", {
        minLength: SUGGESTION_MIN_LENGTH,
        maxLength: SUGGESTION_MAX_LENGTH,
        quotas: SUGGESTION_QUOTAS,
        excludeEntries,
    }, signal);
    return entries || [];
}

/** A generated_clue with is_seedword = true for this entry, if one is already stored. */
export async function fetchExistingSeedClue(entry: string, signal?: AbortSignal): Promise<string | undefined> {
    const result = await postJson<{ entries: EntryClueStatus[] }>(
        "/magicPuzzle/entryClues",
        { entries: [entry] },
        signal,
    );
    for (const status of result.entries || []) {
        const clue = (status.clues || []).find(item => item.isSeedword && item.clue.trim());
        if (clue) return clue.clue.trim();
    }
    return undefined;
}

/** The seed_clue_prompt.txt response is the clue itself. Drop an echoed "answer : clue" prefix. */
export function parseSeedClueResponse(response: string, displayText: string): string {
    let text = response.trim().replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) return "";
    text = lines.join(" ");
    const sep = text.indexOf(" : ");
    if (sep > 0) {
        const left = text.slice(0, sep).trim();
        const right = text.slice(sep + 3).trim();
        if (right && normalizeEntryKey(left) === normalizeEntryKey(displayText)) text = right;
    }
    return text.replace(/^(clue|crossword clue)\s*:\s*/i, "").trim();
}

/** Asks the AI (seed_clue_prompt.txt) for one lore clue for this seed. Uses Muse. */
export async function generateSeedClue(displayText: string, signal?: AbortSignal): Promise<string> {
    const template = await loadPrompt(seedCluePromptUrl, signal);
    const prompt = template.replace("[[DATA]]", displayText.trim());
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_CLUE_RETRIES; attempt++) {
        if (attempt > 0) await sleep(CLUE_RETRY_DELAY_MS, signal);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
            const response = await makeAICall(prompt, signal, MUSE_MODEL);
            const clue = parseSeedClueResponse(response, displayText);
            if (!clue) throw new Error("The AI returned an empty seed clue.");
            return clue;
        } catch (err) {
            if (signal?.aborted) throw err;
            lastError = err;
            console.warn(`Seed clue prompt failed (attempt ${attempt + 1} of ${MAX_CLUE_RETRIES + 1})`, err);
        }
    }
    throw lastError instanceof Error ? lastError : new Error("Couldn't generate a seed clue.");
}

/** Calls chal-api's /makeAICall. Gemini by default; pass a model such as MUSE_MODEL to use it instead. */
export async function makeAICall(prompt: string, signal?: AbortSignal, model?: string): Promise<string> {
    const body = await postJson<{ response?: string }>("/makeAICall", model ? { prompt, model } : { prompt }, signal);
    if (!body.response) throw new Error("The AI returned an empty response.");
    return body.response;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}

/**
 * Sends one clue prompt and parses the typed clues. A failed call, or a response that
 * contains no usable clues, is retried up to MAX_CLUE_RETRIES times before giving up.
 * onRetry runs before each retry with the retry number (1-based).
 */
export async function requestTypedClues(
    prompt: string,
    answers: string[],
    displayByAnswer: Map<string, string>,
    options: { signal?: AbortSignal; model?: string; onRetry?: (retry: number) => void } = {},
): Promise<Map<string, TypedClue[]>> {
    const { signal, model, onRetry } = options;
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_CLUE_RETRIES; attempt++) {
        if (attempt > 0) {
            onRetry?.(attempt);
            await sleep(CLUE_RETRY_DELAY_MS, signal);
        }
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
            const response = await makeAICall(prompt, signal, model);
            const parsed = parseTypedClueResponse(response, answers, displayByAnswer);
            if (!Array.from(parsed.values()).some(clues => clues.length > 0)) {
                throw new Error("The AI response didn't contain any clues.");
            }
            return parsed;
        } catch (err) {
            if (signal?.aborted) throw err;
            lastError = err;
            console.warn(`Clue prompt failed (attempt ${attempt + 1} of ${MAX_CLUE_RETRIES + 1})`, err);
        }
    }
    throw lastError;
}

export async function postJson<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await chalFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `Request to ${path} failed (${res.status})`);
    }
    return data as T;
}

function formatDateMMDDYYYY(date: Date): string {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${mm}${dd}${date.getFullYear()}`;
}
