import seedwordCluePromptUrl from "../prompts/seedword_clue_prompt.txt";
import cluePromptUrl from "../prompts/clue_prompt.txt";
import { ContentType } from "../models/ContentType";
import { FillFilter } from "../models/FillFilter";
import { FillStatus } from "../models/FillStatus";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { PackedWordIndex } from "./sharedWordIndex";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { forwardCheckSection } from "./entryCandidates";
import { ensureWordList, startFill, stopFill } from "./fillWorkerPool";
import { clearFill, getLettersFromSquares, populateWords, updateGridConstraintInfo } from "./grid";
import { insertSectionCandidateIntoGrid, updateSectionFilters } from "./section";
import {
    forAllGridSquares, getGrid, getSquaresForWord, initializeSessionGlobals, isBlackSquare, isWordFull,
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

/** Dev-server path forwarded to chal-api's /api routes (see setupProxy.js). */
const CHAL_API = "/chal-api";
const SEED_CANDIDATE_COUNT = 10;
const SEED_FAMILIARITY_BUCKET = "General Knowledge";
const MIN_SLOT_LENGTH = 3;
const TOTAL_STEPS = 4;
const NORMAL_CLUE_BATCH_SIZE = 10;
const STRAIGHT_CLUE_TYPE = "Straight";
const OTHER_CLUE_TYPES = ["Saying", "Reference", "Fill in the Blank"];

export const MAGIC_PUZZLE_AUTHOR = "Crosshatch";

interface FillPass {
    label: string;
    maxLikely: number;
    maxExtra: number;
}

/** Three fill attempts per seed placement; never includes Maybe Gettable. */
const FILL_PASSES: FillPass[] = [
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

interface SeedEntry {
    entry: string;
    displayText: string;
}

interface ParsedClue {
    item: string;
    clue: string;
}

interface TypedClue {
    clue: string;
    clueType: string;
}

export type ClueGenResult =
    | { success: true; message?: string }
    | { success: false; message: string };

interface EntryClueStatus {
    entry: string;
    displayText: string | null;
    cluesGenerated: boolean;
    clues: { clue: string; clueType: string | null; isSeedword: boolean }[];
}

interface FillDictionaries {
    very: PackedWordIndex;
    likely: PackedWordIndex;
    all: PackedWordIndex;
    likelyWords: string[];
    extraWords: string[];
}

interface SeedPlacement {
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

        // Step 1: random General Knowledge seed candidates for the longest open slot.
        const seedLength = longestOpenSlotLength(getGrid());
        if (seedLength < MIN_SLOT_LENGTH) throw new Error(`The grid has no open slots of ${MIN_SLOT_LENGTH}+ letters.`);
        status(1, `Selecting ${SEED_CANDIDATE_COUNT} random ${SEED_FAMILIARITY_BUCKET} entries of length ${seedLength}…`);
        const { entries: seedCandidates } = await postJson<{ entries: SeedEntry[] }>("/magicPuzzle/seedEntries", {
            length: seedLength,
            count: SEED_CANDIDATE_COUNT,
            familiarityBucket: SEED_FAMILIARITY_BUCKET,
        }, signal);
        checkCancelled();
        if (!seedCandidates || seedCandidates.length === 0) {
            throw new Error(`No ${SEED_FAMILIARITY_BUCKET} entries of length ${seedLength} found in the database.`);
        }

        // Step 2: AI picks the seed entry.
        status(2, `Waiting on AI to choose the seed entry from ${seedCandidates.length} candidates…`);
        const seedPrompt = await loadPrompt(seedwordCluePromptUrl, signal);
        const seedResponse = await makeAICall(
            seedPrompt.replace("[[DATA]]", seedCandidates.map(c => c.displayText || c.entry).join("\n")), signal);
        checkCancelled();
        const seed = matchSeedResponse(seedResponse, seedCandidates);
        if (!seed) throw new Error("Couldn't match the AI's seed response to any candidate entry.");

        // Step 3: find a grid the seed fits in with a gettable fill.
        status(3, "Building fill dictionaries…");
        const dictionaries = buildFillDictionaries(knownWords);

        let blackPairsAdded = 0;
        let found: string | undefined;
        let foundSlot: GridWord | undefined;
        while (!found) {
            if (seedPlacement) {
                restoreSeed(seedPlacement);
                seedPlacement = undefined;
                clearSeedword();
            }
            // Fresh placement round on the current black-square pattern: every
            // seed-length slot, and all 3 fill passes in each one, each searched to
            // exhaustion before the pattern is allowed to change.
            const activeGrid = getGrid();
            resetGridForPlacementRound(activeGrid);
            Globals.fillStatus = FillStatus.Running;
            callbacks.onGridChanged();

            const section = Globals.sections!.get(0)!;
            const slots = seedSlots(activeGrid, seedLength, seed.entry);
            shuffleArray(slots);
            const attemptLabel = blackPairsAdded === 0
                ? "starting grid"
                : `${blackPairsAdded} black-square pair${blackPairsAdded === 1 ? "" : "s"} added`;

            for (let i = 0; i < slots.length && !found; i++) {
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

                for (let p = 0; fits && p < FILL_PASSES.length && !found; p++) {
                    const pass = FILL_PASSES[p];
                    status(3, `Filling with ${positionLabel} — pass ${p + 1} of ${FILL_PASSES.length}: ${pass.label}…`);
                    switchDictionary(pass.maxExtra > 0 ? dictionaries.all : pass.maxLikely > 0 ? dictionaries.likely : dictionaries.very);
                    installFillFilter(undefined);
                    updateGridConstraintInfo(activeGrid);
                    const fillFilter = makeFillFilter(activeGrid, pass, dictionaries);
                    const attempt = await runFillAttempt(activeGrid, section, fillFilter, callbacks.onProgress);
                    checkCancelled();
                    found = attempt.found;
                    if (found) foundSlot = slot;
                    else if (!attempt.exhausted) {
                        throw new Error(`The fill search for ${positionLabel} stopped before trying every fill (see the console for worker errors).`);
                    }
                }

                if (!found) {
                    restoreSeed(seedPlacement);
                    seedPlacement = undefined;
                    clearSeedword();
                    callbacks.onGridChanged();
                }
            }

            if (found) break;

            status(3, slots.length === 0
                ? `No ${seedLength}-letter slots fit the seed; adding black-square pair #${blackPairsAdded + 1}…`
                : `No fill found with the seed in any of ${slots.length} positions; adding black-square pair #${blackPairsAdded + 1}…`);
            installFillFilter(undefined);
            switchDictionary(fullIndex);
            if (!addRandomBlackSquarePair(getGrid(), seedLength)) {
                throw new Error("No viable grid found: there's nowhere left to add black squares.");
            }
            blackPairsAdded++;
            callbacks.onGridChanged();
        }

        installFillFilter(undefined);
        switchDictionary(fullIndex);
        const grid = getGrid();
        const section = Globals.sections!.get(0)!;
        const candidate = section.candidates.get(found);
        if (!candidate) throw new Error("The found fill went missing from the Fills list.");
        insertSectionCandidateIntoGrid(grid, candidate, ContentType.ChosenSection);
        Globals.selectedSectionCandidateKeys!.set(section.id, candidate.sectionString);
        section.selectedCandidate = candidate.sectionString;
        seedPlacement = undefined;
        rememberSeedword(seed.entry, foundSlot, seedCandidates.find(c => c.entry === seed.entry)?.displayText);
        await applySeedwordClue(seed.entry, seed.clue);
        updateSectionFilters();
        Globals.fillStatus = FillStatus.Complete;
        callbacks.onGridChanged();

        // Step 4: title and author. Remaining clues are generated later from the Clue View.
        status(4, "Naming the puzzle…");
        const title = `Generated Puzzle ${formatDateMMDDYYYY(new Date())}`;
        Globals.puzzle!.title = title;
        Globals.puzzle!.author = MAGIC_PUZZLE_AUTHOR;

        callbacks.onStatus(`Done: "${title}" with seed ${seed.entry}.`);
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
        if (Globals.fillStatus === FillStatus.Running) clearFill(getGrid());
    }
}

export async function generateNormalClues(onStatus: (status: string) => void): Promise<ClueGenResult> {
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

        const batches = chunk(toGenerate, NORMAL_CLUE_BATCH_SIZE);
        if (batches.length > 0) {
            const cluePrompt = await loadPrompt(cluePromptUrl);
            for (let i = 0; i < batches.length; i++) {
                onStatus(`Generating (prompt ${i + 1} of ${batches.length})...`);
                const batch = batches[i];
                const displayByAnswer = displayTextsFromStatuses(batch, statusByAnswer);
                const prompt = cluePrompt.replace("[[DATA]]",
                    batch.map(answer => displayByAnswer.get(answer) || answer).join("\n"));
                const response = await makeAICall(prompt);
                const parsed = parseTypedClueResponse(response, batch, displayByAnswer);
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
                if (newClues.length > 0) {
                    await postJson("/magicPuzzle/generatedClues", { clues: newClues });
                }
            }
        }

        const puzzleClues = Globals.puzzle!.clues;
        const skipKeys = new Set(seedWordKeys());
        let assigned = 0;
        let missing = 0;
        grid.words.forEach(word => {
            const key = wordKey(word);
            if (skipKeys.has(key)) return;
            const answer = getLettersFromSquares(getSquaresForWord(grid, word));
            if (answer === Globals.seedEntry) return;
            const chosen = pickGeneratedClue(cluesByAnswer.get(answer) || []);
            if (!chosen) {
                missing++;
                return;
            }
            puzzleClues.set(key, chosen);
            assigned++;
        });

        return {
            success: true,
            message: missing > 0
                ? `Assigned ${assigned} clues (${missing} still need clues).`
                : undefined,
        };
    } catch (err: any) {
        const message = err?.message ? String(err.message) : String(err);
        return { success: false, message };
    }
}

function makeFillFilter(grid: GridState, pass: FillPass, dictionaries: FillDictionaries): FillFilter {
    return {
        maxLikelyGettable: pass.maxLikely,
        likelyWords: dictionaries.likelyWords,
        seedWords: [],
        exemptWords: mapKeys(grid.usedWords),
        maxExtra: pass.maxExtra,
        extraWords: dictionaries.extraWords,
    };
}

function buildFillDictionaries(knownWords: Set<string>): FillDictionaries {
    const isPlain = (word: string) => !isMagicPuzzleBlocked(word) && !isCrosswordeseOrAbbreviation(word);
    const veryWords = wordsWithGettable(GETTABLE_VERY).filter(isPlain);
    const likelyWords = wordsWithGettable(GETTABLE_LIKELY).filter(isPlain);
    const extraWords = crosswordeseAndAbbreviationWords()
        .filter(word => knownWords.has(word) && !isMagicPuzzleBlocked(word)
            && Globals.wordGettable?.get(word) === GETTABLE_VERY);

    return {
        very: buildPackedWordIndex(veryWords),
        likely: buildPackedWordIndex(veryWords.concat(likelyWords)),
        all: buildPackedWordIndex(veryWords.concat(likelyWords, extraWords)),
        likelyWords,
        extraWords,
    };
}

interface FillAttemptResult {
    found?: string;
    /** True only when every fill in the search space was tried without finding one. */
    exhausted: boolean;
}

/** Resolves with the first fill found, or with no fill once the search is exhausted, cut short, or cancelled. */
function runFillAttempt(grid: GridState, section: Section, fillFilter: FillFilter, onProgress: () => void): Promise<FillAttemptResult> {
    return new Promise(resolve => {
        let settled = false;
        const settle = (result: FillAttemptResult) => {
            if (settled) return;
            settled = true;
            if (cancelActiveAttempt === cancel) cancelActiveAttempt = undefined;
            stopFill();
            resolve(result);
        };
        const cancel = () => settle({ exhausted: false });
        cancelActiveAttempt = cancel;

        startFill({
            grid,
            section,
            fillFilter,
            onFound: sectionString => settle({ found: sectionString, exhausted: false }),
            onProgress,
            onComplete: exhausted => settle({ exhausted }),
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

function seedSlots(grid: GridState, length: number, seed: string): GridWord[] {
    return mapValues(grid.words).filter(word => wordLength(word) === length && seedMatchesSlot(grid, word, seed));
}

/** Clear leftover fill/seed letters and rebuild sections for a new placement round. */
function resetGridForPlacementRound(grid: GridState) {
    forAllGridSquares(grid, sq => {
        if (isBlackSquare(sq) || sq.contentType === ContentType.User) return;
        sq.content = undefined;
        sq.contentType = ContentType.Autofill;
    });
    populateWords(grid);
    initializeSessionGlobals();
    const section = Globals.sections!.get(0)!;
    section.candidates = new Map<string, SectionCandidate>();
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

function placeSeed(grid: GridState, slot: GridWord, seed: string): SeedPlacement {
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
    Globals.seedEntry = entry;
    Globals.seedWordKey = slot ? wordKey(slot) : undefined;
    Globals.seedDisplayText = displayText || entry;
    if (slot) {
        getSquaresForWord(getGrid(), slot).forEach(sq => { sq.contentType = ContentType.Seedword; });
    }
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

function restoreSeed(placement: SeedPlacement) {
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

/** Starting black squares for each supported Magic Puzzle grid size. */
function startingBlackSquares(size: number): [number, number][] | undefined {
    const last = size - 1;
    switch (size) {
        case 5:
            return [];
        case 6:
            return [[0, 0], [last, last]];
        case 7:
            return [
                [0, 0], [0, 1], [1, 0],
                [last - 1, last], [last, last - 1], [last, last],
            ];
        default:
            return undefined;
    }
}

/**
 * Reset the grid's black squares to the Magic Puzzle starting pattern for its size.
 * Returns true when the grid changed.
 */
function applyStartingBlackSquares(grid: GridState): boolean {
    const blacks = grid.width === grid.height ? startingBlackSquares(grid.width) : undefined;
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
 * Returns false if no such pair exists.
 */
function addRandomBlackSquarePair(grid: GridState, seedLength: number): boolean {
    const h = grid.height;
    const w = grid.width;
    const adjacent: [number, number][] = [];
    const rest: [number, number][] = [];
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            const pr = h - 1 - r;
            const pc = w - 1 - c;
            if (r * w + c >= pr * w + pc) continue;
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
    if (normalized === "straight") return STRAIGHT_CLUE_TYPE;
    if (OTHER_CLUE_TYPES.map(type => type.toLowerCase()).includes(normalized)) {
        return OTHER_CLUE_TYPES.find(type => type.toLowerCase() === normalized);
    }
    if (normalized === "fill in the blanks" || normalized === "fitb") return "Fill in the Blank";
    return undefined;
}

function parseTypedClueResponse(
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

function pickGeneratedClue(clues: TypedClue[]): string | undefined {
    if (clues.length === 0) return undefined;
    const straight = clues.filter(clue => clue.clueType === STRAIGHT_CLUE_TYPE);
    const others = clues.filter(clue => clue.clueType && clue.clueType !== STRAIGHT_CLUE_TYPE);
    const preferStraight = Math.random() < 0.5;
    const pool = preferStraight
        ? (straight.length > 0 ? straight : others)
        : (others.length > 0 ? others : straight);
    const chosen = pool.length > 0 ? pool : clues;
    return chosen[Math.floor(Math.random() * chosen.length)].clue;
}

function displayTextsFromStatuses(
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

async function loadPrompt(url: string, signal?: AbortSignal): Promise<string> {
    const cached = promptCache.get(url);
    if (cached !== undefined) return cached;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Failed to load prompt file (${res.status})`);
    const text = await res.text();
    promptCache.set(url, text);
    return text;
}

async function makeAICall(prompt: string, signal?: AbortSignal): Promise<string> {
    const body = await postJson<{ response?: string }>("/makeAICall", { prompt }, signal);
    if (!body.response) throw new Error("The AI returned an empty response.");
    return body.response;
}

async function postJson<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${CHAL_API}${path}`, {
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
