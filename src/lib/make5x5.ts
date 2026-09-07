import { ContentType } from "../models/ContentType";
import { FillStatus } from "../models/FillStatus";
import { GridState } from "../models/GridState";
import { SectionCandidate } from "../models/SectionCandidate";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { makeNewNode } from "./fill";
import { ensureWordList, MAX_STORED_FILLS, startFill, stopFill } from "./fillWorkerPool";
import { clearFill, createNewGrid, gridToString, populateWords, updateGridConstraintInfo } from "./grid";
import { processAndInsertChosenEntry } from "./insertEntry";
import { hydrateSectionCandidate } from "./section";
import { initializeSessionGlobals, wordLength } from "./util";
import {
    GETTABLE_LIKELY,
    GETTABLE_VERY,
    buildPackedWordIndex,
    installFillFilter,
    pickRandomMaybePrefer5,
    rebuildWordIndex,
    wordsWithGettable,
    wordsWithoutAvoid,
} from "./wordList";
import Globals from "./windowService";

const SIZE = 5;

export interface Make5x5Callbacks {
    onProgress: () => void;
    onComplete: () => void;
    onNoSeed: () => void;
}

interface Make5x5Job {
    isBlack: boolean[][];
    startRow: number;
    startCol: number;
}

let make5x5Generation = 0;

export function cancelMake5x5() {
    make5x5Generation++;
    stopFill();
    restoreFullWordIndex();
}

export function restoreFullWordIndex() {
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

/**
 * All 5x5 black-square layouts with 180° symmetry, no slot shorter than 3,
 * and at least one 5-letter across and down (12 layouts).
 */
export function generate5x5BlackConfigs(): boolean[][][] {
    const pairs: [number, number][][] = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const r2 = SIZE - 1 - r;
            const c2 = SIZE - 1 - c;
            const a = r * SIZE + c;
            const b = r2 * SIZE + c2;
            if (a < b) pairs.push([[r, c], [r2, c2]]);
            else if (a === b) pairs.push([[r, c]]);
        }
    }

    const configs: boolean[][][] = [];
    const n = pairs.length;
    for (let mask = 0; mask < (1 << n); mask++) {
        const isBlack = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) {
                for (const [r, c] of pairs[i]) isBlack[r][c] = true;
            }
        }
        if (isValid5x5BlackConfig(isBlack)) configs.push(isBlack);
    }
    return configs;
}

function isValid5x5BlackConfig(isBlack: boolean[][]): boolean {
    const across = slotRuns(isBlack, false);
    const down = slotRuns(isBlack, true);
    return across.ok && down.ok && across.hasFive && down.hasFive;
}

function slotRuns(isBlack: boolean[][], transpose: boolean): { ok: boolean; hasFive: boolean } {
    let hasFive = false;
    for (let i = 0; i < SIZE; i++) {
        let run = 0;
        for (let j = 0; j < SIZE; j++) {
            const black = transpose ? isBlack[j][i] : isBlack[i][j];
            if (!black) run++;
            else {
                if (run > 0 && run < 3) return { ok: false, hasFive };
                if (run === 5) hasFive = true;
                run = 0;
            }
        }
        if (run > 0 && run < 3) return { ok: false, hasFive };
        if (run === 5) hasFive = true;
    }
    return { ok: true, hasFive };
}

function createGridWithBlacks(isBlack: boolean[][]): GridState {
    const grid = createNewGrid(SIZE, SIZE);
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (isBlack[r][c]) {
                grid.squares[r][c].type = SquareType.Black;
            }
        }
    }
    populateWords(grid);
    return grid;
}

function buildJobs(seed: string): Make5x5Job[] {
    const jobs: Make5x5Job[] = [];
    for (const isBlack of generate5x5BlackConfigs()) {
        const grid = createGridWithBlacks(isBlack);
        grid.words.forEach(word => {
            if (word.direction !== WordDirection.Across) return;
            if (wordLength(word) !== seed.length) return;
            jobs.push({ isBlack, startRow: word.start[0], startCol: word.start[1] });
        });
    }
    return jobs;
}

function placeSeedAcross(entry: string, startRow: number, startCol: number) {
    const grid = Globals.activeGrid!;
    const key = `[${startRow},${startCol},A]`;
    const node = makeNewNode(grid, 0);
    node.fillWord = node.startGrid.words.get(key);
    if (!node.fillWord) {
        Globals.activeGrid = node.endGrid;
        return;
    }
    node.chosenEntry = { word: entry, score: 1 };
    processAndInsertChosenEntry(node, ContentType.ChosenWord, true);
    Globals.activeGrid = node.endGrid;
}

function absorbFoundFill(sectionString: string, candidate: SectionCandidate) {
    const section = Globals.sections!.get(Globals.activeSectionId!)!;
    section.candidates.delete(sectionString);
    const filled = hydrateSectionCandidate(Globals.activeGrid!, section, sectionString);
    const gs = gridToString(filled);
    if (section.candidates.has(gs)) return;
    section.candidates.set(gs, {
        sectionId: 0,
        sectionString: gs,
        gridString: gs,
        score: candidate.score,
        isFilteredOut: false,
    });
}

function setupJob(job: Make5x5Job, seed: string, collected: Map<string, SectionCandidate>) {
    Globals.selectedWordKey = undefined;
    Globals.selectedWordNode = undefined;
    Globals.activeGrid = createGridWithBlacks(job.isBlack);
    Globals.hoverGrid = undefined;
    initializeSessionGlobals();
    const section = Globals.sections!.get(0)!;
    section.candidates = collected;
    placeSeedAcross(seed, job.startRow, job.startCol);
}

function startFilteredFill(
    gen: number,
    fillFilter: { maxLikelyGettable: number; likelyWords: string[] } | undefined,
    callbacks: Make5x5Callbacks,
    onPassComplete: () => void,
) {
    const grid = Globals.activeGrid!;
    const section = Globals.sections!.get(Globals.activeSectionId!)!;
    section.selectedCandidate = undefined;
    section.fillState = undefined;

    updateGridConstraintInfo(grid);
    Globals.fillStatus = FillStatus.Running;

    startFill({
        grid,
        section,
        fillFilter,
        onFound: (sectionString, candidate) => {
            if (gen !== make5x5Generation) return;
            absorbFoundFill(sectionString, candidate);
        },
        onProgress: () => {
            if (gen !== make5x5Generation) return;
            callbacks.onProgress();
        },
        onComplete: () => {
            if (gen !== make5x5Generation) return;
            setTimeout(() => {
                if (gen !== make5x5Generation) return;
                onPassComplete();
            }, 0);
        },
    });
}

export function startMake5x5(callbacks: Make5x5Callbacks): boolean {
    const gen = ++make5x5Generation;
    stopFill();

    const seed = pickRandomMaybePrefer5();
    if (!seed) {
        restoreFullWordIndex();
        callbacks.onNoSeed();
        return false;
    }

    const jobs = buildJobs(seed);
    const collected = new Map<string, SectionCandidate>();
    Globals.selectedWordKey = undefined;
    Globals.selectedWordNode = undefined;
    Globals.activeGrid = createNewGrid(SIZE, SIZE);
    Globals.hoverGrid = undefined;
    initializeSessionGlobals();
    Globals.sections!.get(0)!.candidates = collected;

    const veryWords = wordsWithoutAvoid(wordsWithGettable(GETTABLE_VERY));
    const likelyWords = wordsWithoutAvoid(wordsWithGettable(GETTABLE_LIKELY));

    applyFillDictionary(veryWords);
    callbacks.onProgress();

    let jobIndex = 0;
    let allowLikely = false;

    const runNext = () => {
        if (gen !== make5x5Generation) return;

        if (collected.size >= MAX_STORED_FILLS || jobIndex >= jobs.length) {
            if (!allowLikely && collected.size === 0 && likelyWords.length > 0 && jobIndex >= jobs.length) {
                allowLikely = true;
                jobIndex = 0;
                applyFillDictionary(veryWords.concat(likelyWords));
            } else {
                finishMake5x5(gen, callbacks);
                return;
            }
        }

        const job = jobs[jobIndex++];
        setupJob(job, seed, collected);
        const fillFilter = allowLikely
            ? { maxLikelyGettable: 1, likelyWords }
            : { maxLikelyGettable: 0, likelyWords: [] as string[] };
        startFilteredFill(gen, fillFilter, callbacks, runNext);
    };

    runNext();
    return true;
}

function finishMake5x5(gen: number, callbacks: Make5x5Callbacks) {
    if (gen !== make5x5Generation) return;
    restoreFullWordIndex();
    if (Globals.activeGrid) clearFill(Globals.activeGrid);
    Globals.fillStatus = FillStatus.Complete;
    callbacks.onComplete();
}
