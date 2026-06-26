import { GridSquare } from "./GridSquare";
import { GridWord } from "./GridWord";

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
}
