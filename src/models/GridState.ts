import { GridSquare } from "./GridSquare";
import { GridWord } from "./GridWord";
import { PackedWordIndex } from "../lib/sharedWordIndex";

export interface GridState {
    height: number;
    width: number;
    squares: GridSquare[][];
    words: Map<string, GridWord>;
    usedWords: Map<string, boolean>;
    userFilledSectionCandidates: Map<string, boolean>;
    /** O(1) lookup: across word covering each white square */
    acrossWordAt?: (GridWord | undefined)[][];
    /** O(1) lookup: down word covering each white square */
    downWordAt?: (GridWord | undefined)[][];

    // Fill-search working grids only (square objects are mutated in place, never replaced).
    squaresCache?: Map<GridWord, GridSquare[]>;
    crossesCache?: Map<GridWord, GridWord[]>;
    /** usedWords as a bitset over word ids of usedWordIdsIndex. */
    usedWordIds?: Uint8Array;
    usedWordIdsIndex?: PackedWordIndex;
    /** Running countLikelyGettableUsed(usedWords). */
    likelyUsedCount?: number;
    /** Running countExtraUsed(usedWords). */
    extraUsedCount?: number;
}
