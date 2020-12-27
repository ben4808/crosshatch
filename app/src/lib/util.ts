import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { queryIndexedWordList } from "./wordList";
import Globals from './windowService';
import { Puzzle } from "../models/Puzzle";
import { createNewGrid, getLettersFromSquares } from "./grid";
import { ContentType } from "../models/ContentType";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";

export function average(arr: number[]): number {
    return arr.reduce((a,b) => a + b, 0) / arr.length;
}

export function sum(arr: number[]): number {
    return arr.reduce((a,b) => a + b, 0);
}

// https://stackoverflow.com/questions/38416020/deep-copy-in-es6-using-the-spread-syntax
export function deepClone(obj: any): any {
    if(typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if(obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if(obj instanceof Map) {
        return new Map(Array.from(obj.entries()));
    }

    if(obj instanceof Array) {
        return obj.reduce((arr, item, i) => {
            arr[i] = deepClone(item);
            return arr;
        }, []);
    }

    if(obj instanceof Object) {
        return Object.keys(obj).reduce((newObj: any, key) => {
            newObj[key] = deepClone(obj[key]);
            return newObj;
        }, {})
    }
}

export function compareTuples(first: [number, number], second: [number, number]): boolean {
    return first[0] === second[0] && first[1] === second[1];
}

export function isBlackSquare(sq: GridSquare): boolean {
    return sq.type === SquareType.Black;
}

export function otherDir(dir: WordDirection): WordDirection {
    return dir === WordDirection.Across ? WordDirection.Down : WordDirection.Across;
}

export function indexedWordListLookup(grid: GridState, word: GridWord): string[] {
    let squares = getSquaresForWord(grid, word);
    return indexedWordListLookupSquares(squares);
}

export function indexedWordListLookupSquares(squares: GridSquare[]): string[] {
    let pattern = getLettersFromSquares(squares);
    return queryIndexedWordList(pattern);
}

export function getSquaresForWord(grid: GridState, word: GridWord): GridSquare[] {
    let row = word.start[0];
    let col = word.start[1];
    let squares = [grid.squares[row][col]];
    while (!compareTuples([row, col], word.end)) {
        row = word.direction === WordDirection.Across ? row : row+1;
        col = word.direction === WordDirection.Across ? col+1 : col;
        squares.push(grid.squares[row][col]);
    }

    return squares;
}

export function getWordAtSquare(grid: GridState, row: number, col: number, dir: WordDirection): GridWord | undefined {
    let ret = undefined as GridWord | undefined;

    grid.words.forEach((word, _) => {
        if (dir === WordDirection.Across && word.direction === dir && word.start[0] === row &&
            word.start[1] <= col && word.end[1] >= col)
            ret = word;
        if (dir === WordDirection.Down && word.direction === dir && word.start[1] === col &&
            word.start[0] <= row && word.end[0] >= row)
            ret = word;
    });

    return ret;
}

export function newWord(): GridWord {
    return {
        number: undefined,
        direction: WordDirection.Across,
        start: [-1, -1],
        end: [-1, -1],
    }
}

export function doesWordContainSquare(word: GridWord, row: number, col: number): boolean {
    if (word.direction === WordDirection.Across) {
        return word.start[0] === row && word.start[1] <= col && word.end[1] >= col;
    }
    else {
        return word.start[1] === col && word.start[0] <= row && word.end[0] >= row;
    }
}

export function isWordEmpty(squares: GridSquare[]): boolean {
    return !squares.find(x => !isBlackSquare(x) && x.content);
}

export function isWordFull(squares: GridSquare[]): boolean {
    return !squares.find(x => !isBlackSquare(x) && !x.content);
}

export function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function forAllGridSquares(grid: GridState, func: (sq: GridSquare) => void) {
    grid.squares.forEach(row => {
        row.forEach(sq => {
            func(sq);
        });
    });
}

export function wordLength(word: GridWord): number {
    if (word.direction === WordDirection.Across)
        return word.end[1] - word.start[1];
    else
        return word.end[0] - word.start[0];
}

export function newPuzzle(gridWidth: number, gridHeight: number): Puzzle {
    return {
        title: "",
        author: "",
        copyright: "",
        grid: createNewGrid(gridWidth, gridHeight),
        clues: new Map<string, string>(),
        notes: "",
    } as Puzzle;
}

export function wordKey(word: GridWord): string {
    return `[${word.start[0]},${word.start[1]},${word.direction === WordDirection.Across ? "A" : "D"}]`;
}

export function squareKey(sq: GridSquare | undefined): string {
    return sq ? `[${sq.row},${sq.col}]` : "";
}

export function getGrid(): GridState {
    return Globals.activeGrid!;
}

export function getSection(): Section {
    return Globals.sections!.get(Globals.activeSectionId!)!;
}

export function getSelectedWord(): GridWord | undefined {
    let grid = getGrid();
    if (!Globals.selectedWordKey) return undefined;
    return grid.words.get(Globals.selectedWordKey);
}

export function mapKeys<TKey, TVal>(map: Map<TKey, TVal>): TKey[] {
    return Array.from(map.keys()) || [];
}

export function mapValues<TKey, TVal>(map: Map<TKey, TVal>): TVal[] {
    return Array.from(map.values()) || [];
}

export function isUserFilled(sq: GridSquare): boolean {
    return sq.contentType === ContentType.User || sq.contentType === ContentType.ChosenWord 
        || sq.contentType === ContentType.ChosenSection;
}

export function isAcross(word: GridWord): boolean {
    return word.direction === WordDirection.Across;
}

export function gridSquareAtKey(grid: GridState, sqKey: string): GridSquare {
    let rowCol = sqKey.split(",").map(x => +x);
    return grid.squares[rowCol[0]][rowCol[1]];
}

export function isPartOfMadeUpWord(sq: GridSquare): boolean {
    if (!sq.constraintInfo) return false;
    return sq.constraintInfo!.isCalculated && sq.constraintInfo!.sumTotal === 0;
}

// https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
export function shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function getEntryAtWordKey(grid: GridState, wordKey: string): string {
    return getLettersFromSquares(getSquaresForWord(grid, grid.words.get(wordKey)!));
}

export function getSectionCandidatesFromKeys(keys: string[]): SectionCandidate[] {
    return keys
        .map(sck => mapValues(Globals.sections!).find(sec => sec.candidates.has(sck))?.candidates.get(sck))
        .filter(sck => sck !== undefined)
        .map(sck => sck!);
}
