import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { WordDirection } from "../models/WordDirection";
import {
    GETTABLE_LIKELY,
    GETTABLE_MAYBE,
    GETTABLE_NOT,
    GETTABLE_NOT_A_THING,
    GETTABLE_VERY,
} from "./crosswordListRatings";
import { getLettersFromSquares } from "./grid";
import { getSquaresForWord, getWordAtSquare, wordKey } from "./util";
import Globals from "./windowService";

/** Higher rank = less gettable. */
const GETTABLE_RANKS = new Map<string, number>([
    [GETTABLE_VERY, 0],
    [GETTABLE_LIKELY, 1],
    [GETTABLE_MAYBE, 2],
    [GETTABLE_NOT, 3],
    [GETTABLE_NOT_A_THING, 4],
]);
const RANK_VERY = 0;
const RANK_LIKELY = 1;
const RANK_MAYBE = 2;

const LETTER_CLASSES = [
    "grid-content-very-gettable",
    "grid-content-likely-gettable",
    "grid-content-maybe-gettable",
    "grid-content-not-gettable",
    "grid-content-not-a-thing",
];

export interface SquareGettableClasses {
    letterClass?: string;
    crossingClass?: string;
}

/** Display classes per square, based on the gettability of the complete entries through it. */
export function getGridGettableClasses(grid: GridState): SquareGettableClasses[][] {
    const rankCache = new Map<string, number | undefined>();

    function rankOf(word: GridWord | undefined): number | undefined {
        if (!word) return undefined;
        const key = wordKey(word);
        if (rankCache.has(key)) return rankCache.get(key);
        const letters = getLettersFromSquares(getSquaresForWord(grid, word));
        const gettable = letters.includes("-") ? undefined : Globals.wordGettable?.get(letters);
        const rank = gettable === undefined ? undefined : GETTABLE_RANKS.get(gettable);
        rankCache.set(key, rank);
        return rank;
    }

    const result: SquareGettableClasses[][] = [];
    for (let row = 0; row < grid.height; row++) {
        result.push([]);
        for (let col = 0; col < grid.width; col++) {
            const across = rankOf(getWordAtSquare(grid, row, col, WordDirection.Across));
            const down = rankOf(getWordAtSquare(grid, row, col, WordDirection.Down));
            const ranks = [across, down].filter(r => r !== undefined) as number[];
            result[row].push({
                letterClass: ranks.length > 0 ? LETTER_CLASSES[Math.max(...ranks)] : undefined,
                crossingClass: across !== undefined && down !== undefined ? crossingClass(across, down) : undefined,
            });
        }
    }
    return result;
}

function crossingClass(a: number, b: number): string | undefined {
    if (Math.min(a, b) === RANK_VERY) return undefined;
    const worst = Math.max(a, b);
    if (worst === RANK_LIKELY) return "grid-square-crossing-likely";
    if (worst === RANK_MAYBE) return "grid-square-crossing-maybe";
    return "grid-square-crossing-not";
}
