import { FillFilter } from "../models/FillFilter";
import { FillStatus } from "../models/FillStatus";
import { GridState } from "../models/GridState";
import { IndexedWordList } from "../models/IndexedWordList";
import { Section } from "../models/Section";
import { SymmetryType } from "../models/SymmetryType";
import { forwardCheckSection } from "../lib/entryCandidates";
import { ensureWordList, startFill, stopFill } from "../lib/fillWorkerPool";
import { createNewGrid, updateGridConstraintInfo } from "../lib/grid";
import {
    FILL_PASSES,
    SeedPlacement,
    addRandomBlackSquarePair,
    applyStartingBlackSquares,
    buildFillDictionaries,
    clearPlacedLetters,
    gridWithSeedOnly,
    makeFillFilter,
    placeSeed,
    resetGridForPlacementRound,
    restoreSeed,
    seedSlots,
    startingBlackSquares,
} from "../lib/magicPuzzle";
import { entriesFromSectionString, getSectionSquareCoords } from "../lib/section";
import { initializeSessionGlobals, isBlackSquare, newPuzzle, shuffleArray } from "../lib/util";
import { fillScore, installFillFilter } from "../lib/wordList";
import Globals from "../lib/windowService";
import { ensureMagicWordList, getFullWordIndex } from "./magicWordList";

/** Letter, '' for an empty white square, or null for a black square. */
export type Cell = string | null;
export type Cells = Cell[][];

export interface MagicFill {
    cells: Cells;
    score: number;
    /** Every answer in the fill, including the seed. Sorted alphabetically. */
    entries: string[];
}

export interface MagicSlot {
    key: string;
    number: number;
    direction: "across" | "down";
    entry: string;
    row: number;
    col: number;
}

export function isBlackCell(cells: Cells, row: number, col: number): boolean {
    return row < 0 || col < 0 || row >= cells.length || col >= cells.length || cells[row][col] === null;
}

/** Crossword number for the first square of each across or down answer. */
export function answerStartNumbers(cells: Cells): Array<number | undefined> {
    const size = cells.length;
    const numbers: Array<number | undefined> = new Array(size * size);
    let n = 1;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (cells[row][col] === null) continue;
            const startsAcross = isBlackCell(cells, row, col - 1) && !isBlackCell(cells, row, col + 1);
            const startsDown = isBlackCell(cells, row - 1, col) && !isBlackCell(cells, row + 1, col);
            if (startsAcross || startsDown) numbers[row * size + col] = n++;
        }
    }
    return numbers;
}

function readWord(cells: Cells, row: number, col: number, dRow: number, dCol: number): string {
    const size = cells.length;
    let word = "";
    for (let r = row, c = col; r < size && c < size && cells[r][c] !== null; r += dRow, c += dCol) {
        word += cells[r][c] || "";
    }
    return word;
}

/** Numbered across and down slots implied by a filled grid. */
export function slotsFromCells(cells: Cells): MagicSlot[] {
    const size = cells.length;
    const slots: MagicSlot[] = [];
    let n = 1;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (cells[row][col] === null) continue;
            const startsAcross = isBlackCell(cells, row, col - 1) && !isBlackCell(cells, row, col + 1);
            const startsDown = isBlackCell(cells, row - 1, col) && !isBlackCell(cells, row + 1, col);
            if (!startsAcross && !startsDown) continue;
            if (startsAcross) {
                slots.push({
                    key: `${n}A`,
                    number: n,
                    direction: "across",
                    entry: readWord(cells, row, col, 0, 1),
                    row,
                    col,
                });
            }
            if (startsDown) {
                slots.push({
                    key: `${n}D`,
                    number: n,
                    direction: "down",
                    entry: readWord(cells, row, col, 1, 0),
                    row,
                    col,
                });
            }
            n++;
        }
    }
    return slots;
}

export function fillKey(fill: MagicFill): string {
    return fill.cells.map(row => row.map(cell => (cell === null ? "#" : cell || ".")).join("")).join("/");
}

/** Inverse of fillKey. '#' is black, '.' is an empty white square, anything else is a letter. */
export function cellsFromFillKey(key: string): Cells {
    const rows = key.trim().split("/").filter(row => row.length > 0);
    if (rows.length === 0) throw new Error("Puzzle grid is empty");
    const width = rows[0].length;
    if (rows.some(row => row.length !== width)) throw new Error("Puzzle grid is uneven");
    return rows.map(row => row.split("").map(ch => {
        if (ch === "#") return null;
        if (ch === ".") return "";
        return ch.toUpperCase();
    }));
}

export type GenerateResult =
    | { success: true; fill: MagicFill }
    | { success: false; cancelled: boolean; message: string };

/** Fills to find before a round stops and the best of them is shown. */
export const FILLS_PER_ROUND = 10;

class RoundCancelled extends Error {}

let cancelActiveAttempt: (() => void) | undefined;

/** Uppercase A-Z only, accents folded. This is what gets placed in the grid. */
export function normalizeSeed(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
}

/** The empty grid (starting black squares only) for a size, before any generation. */
export function startingCells(size: number, seedLength?: number): Cells {
    const blacks = new Set((startingBlackSquares(size, seedLength) ?? []).map(([r, c]) => r * size + c));
    const cells: Cells = [];
    for (let r = 0; r < size; r++) {
        const row: Cell[] = [];
        for (let c = 0; c < size; c++) row.push(blacks.has(r * size + c) ? null : "");
        cells.push(row);
    }
    return cells;
}

interface FillAttemptResult {
    /** True only when every fill in the search space was tried. */
    exhausted: boolean;
}

/**
 * Runs the parallel fill search until it is exhausted or onFound returns true (enough fills).
 * onFound is called for every fill the workers report, including repeats.
 */
function runFillAttempt(
    grid: GridState,
    section: Section,
    fillFilter: FillFilter,
    onFound: (sectionString: string) => boolean,
): Promise<FillAttemptResult> {
    return new Promise(resolve => {
        let settled = false;
        const settle = (exhausted: boolean) => {
            if (settled) return;
            settled = true;
            if (cancelActiveAttempt === cancel) cancelActiveAttempt = undefined;
            resolve({ exhausted });
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
                if (settled) return;
                let enough = false;
                try {
                    enough = onFound(sectionString);
                } catch (err) {
                    console.error("Failed to record a fill", err);
                }
                if (enough) cancel();
            },
            onComplete: exhausted => settle(exhausted),
        });
    });
}

/**
 * Generates fills for one puzzle (one seed and grid size). Each call to generate() finds
 * FILLS_PER_ROUND new fills and returns the best-scoring one. Calling it again continues
 * from where the last round stopped and never repeats a fill already found.
 *
 * The fill search shares module-level globals, so only one session may run at a time.
 */
export class MagicFillSession {
    private readonly grid: GridState;
    private readonly seed: string;
    private readonly seen = new Set<string>();
    private run = 0;

    constructor(seed: string, size: number) {
        this.seed = seed;
        this.grid = createNewGrid(size, size);
        Globals.puzzle = newPuzzle();
        Globals.activeGrid = this.grid;
        Globals.hoverGrid = undefined;
        Globals.gridSymmetry = SymmetryType.Rotate180;
        initializeSessionGlobals();
        applyStartingBlackSquares(this.grid, this.seed.length);
    }

    currentCells(): Cells {
        return this.grid.squares.map(row => row.map(sq => (isBlackSquare(sq) ? null : sq.content ?? "")));
    }

    cancel() {
        this.run++;
        stopFill();
        cancelActiveAttempt?.();
    }

    async generate(
        fillCount: number,
        excluded: ReadonlySet<string>,
        onGrid: (cells: Cells) => void,
    ): Promise<GenerateResult> {
        const gen = ++this.run;
        const grid = this.grid;
        const checkCancelled = () => {
            if (gen !== this.run) throw new RoundCancelled();
        };
        const batch: MagicFill[] = [];
        let seedPlacement: SeedPlacement | undefined;

        try {
            await ensureMagicWordList();
            checkCancelled();
            const fullIndex = getFullWordIndex();
            const knownWords = Globals.knownWords;
            if (!fullIndex || !knownWords) throw new Error("The word list isn't loaded.");

            const switchDictionary = (index: IndexedWordList) => {
                Globals.wordList = index;
                ensureWordList(index, knownWords);
            };

            Globals.activeGrid = grid;
            installFillFilter(undefined);
            switchDictionary(fullIndex);
            const dictionaries = buildFillDictionaries(knownWords, new Set(excluded));
            const seedLength = this.seed.length;

            while (true) {
                checkCancelled();
                if (seedPlacement) {
                    restoreSeed(seedPlacement);
                    seedPlacement = undefined;
                }
                resetGridForPlacementRound(grid);
                Globals.fillStatus = FillStatus.Running;
                onGrid(this.currentCells());

                const section = Globals.sections!.get(0)!;
                const slots = seedSlots(grid, seedLength, this.seed);
                shuffleArray(slots);

                // A pattern is searched in one seed position; the first slot that yields a
                // fill is the one whose passes are all run.
                let found = false;
                let finished = false;
                for (let i = 0; i < slots.length && !found && !finished; i++) {
                    seedPlacement = placeSeed(grid, slots[i], this.seed);
                    onGrid(this.currentCells());

                    const widest = FILL_PASSES[FILL_PASSES.length - 1];
                    switchDictionary(dictionaries.all);
                    installFillFilter(undefined);
                    updateGridConstraintInfo(grid);
                    installFillFilter(makeFillFilter(grid, widest, dictionaries));
                    const fits = !forwardCheckSection(grid, section);

                    for (let p = 0; fits && p < FILL_PASSES.length && !finished; p++) {
                        const pass = FILL_PASSES[p];
                        switchDictionary(
                            pass.maxExtra > 0 ? dictionaries.all : pass.maxLikely > 0 ? dictionaries.likely : dictionaries.very);
                        installFillFilter(undefined);
                        const searchGrid = found ? gridWithSeedOnly(grid) : grid;
                        updateGridConstraintInfo(searchGrid);
                        const fillFilter = makeFillFilter(searchGrid, pass, dictionaries);

                        const attempt = await runFillAttempt(searchGrid, section, fillFilter, sectionString => {
                            found = true;
                            const fill = this.recordFill(grid, section, sectionString);
                            if (fill) batch.push(fill);
                            return batch.length >= fillCount;
                        });
                        checkCancelled();

                        if (batch.length >= fillCount) {
                            finished = true;
                        } else if (!attempt.exhausted) {
                            if (!found) {
                                throw new Error("The fill search stopped early (see the console for worker errors).");
                            }
                            // Part of the search space is unsearched; settle for what was found.
                            finished = true;
                        }
                    }

                    if (!found) {
                        restoreSeed(seedPlacement);
                        seedPlacement = undefined;
                        onGrid(this.currentCells());
                    }
                }

                if (finished) break;

                // This black-square pattern is used up. Move on to one more black-square pair.
                if (seedPlacement) {
                    restoreSeed(seedPlacement);
                    seedPlacement = undefined;
                }
                installFillFilter(undefined);
                switchDictionary(fullIndex);
                clearPlacedLetters(grid);
                if (!addRandomBlackSquarePair(grid, seedLength)) break;
                onGrid(this.currentCells());
            }

            checkCancelled();
            if (batch.length === 0) {
                return {
                    success: false,
                    cancelled: false,
                    message: this.seen.size > 0
                        ? "No more fills could be found."
                        : "No grid could be generated for this seed.",
                };
            }
            const best = batch.reduce((top, fill) => (fill.score > top.score ? fill : top));
            return { success: true, fill: best };
        } catch (err: any) {
            if (err instanceof RoundCancelled || gen !== this.run) {
                return { success: false, cancelled: true, message: "Cancelled." };
            }
            return { success: false, cancelled: false, message: err?.message ? String(err.message) : String(err) };
        } finally {
            // A cancelled round may belong to a session that has been replaced; leave the
            // shared globals alone in that case.
            if (gen === this.run && Globals.activeGrid === grid) {
                stopFill();
                installFillFilter(undefined);
                const fullIndex = getFullWordIndex();
                if (fullIndex && Globals.knownWords && Globals.wordList !== fullIndex) {
                    Globals.wordList = fullIndex;
                    ensureWordList(fullIndex, Globals.knownWords);
                }
                if (seedPlacement) restoreSeed(seedPlacement);
                Globals.fillStatus = FillStatus.Ready;
            }
        }
    }

    /** Turn a worker-reported fill into a displayable one; undefined if it was seen before. */
    private recordFill(grid: GridState, section: Section, sectionString: string): MagicFill | undefined {
        const cells: Cells = grid.squares.map(row => row.map(sq => (isBlackSquare(sq) ? null : "")));
        getSectionSquareCoords(section).forEach(([row, col], i) => {
            const letter = sectionString[i];
            cells[row][col] = letter && letter !== "-" ? letter : "";
        });

        const key = cells.map(row => row.map(cell => (cell === null ? "#" : cell || ".")).join("")).join("/");
        if (this.seen.has(key)) return undefined;
        this.seen.add(key);

        const entries = entriesFromSectionString(section, sectionString);
        return { cells, score: fillScore(entries), entries };
    }
}
