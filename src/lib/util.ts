import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import Globals from './windowService';
import { Puzzle } from "../models/Puzzle";
import { getLettersFromSquares } from "./grid";
import { ContentType } from "../models/ContentType";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { generateGridSections } from "./section";

export const fullAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
/** Bits 0–25 = A–Z. */
export const ALL_LETTERS_MASK = (1 << 26) - 1;

export function letterBit(ch: string): number {
    return 1 << (ch.charCodeAt(0) - 65);
}

export function maskContainsLetter(mask: number, ch: string): boolean {
    return (mask & letterBit(ch)) !== 0;
}

export function popcount(mask: number): number {
    let n = 0;
    let m = mask >>> 0;
    while (m) {
        m &= m - 1;
        n++;
    }
    return n;
}

export function maskToLetterList(mask: number): string[] {
    let out: string[] = [];
    for (let i = 0; i < 26; i++) {
        if (mask & (1 << i)) out.push(String.fromCharCode(65 + i));
    }
    return out;
}

export function letterListToMask(list: string[]): number {
    let mask = 0;
    for (let ltr of list) mask |= letterBit(ltr);
    return mask;
}

export function squareViableMask(sq: GridSquare): number {
    return sq.viableMask === undefined ? ALL_LETTERS_MASK : sq.viableMask;
}

export function squareAllowsLetter(sq: GridSquare, ch: string): boolean {
    return sq.viableMask === undefined || maskContainsLetter(sq.viableMask, ch);
}

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

/** Callers must not mutate the returned array (it may be cached on fill grids). */
export function getSquaresForWord(grid: GridState, word: GridWord): GridSquare[] {
    const cache = grid.squaresCache;
    if (cache) {
        const hit = cache.get(word);
        if (hit) return hit;
    }

    const across = word.direction === WordDirection.Across;
    const endRow = word.end[0];
    const endCol = word.end[1];
    let row = word.start[0];
    let col = word.start[1];
    let squares = [grid.squares[row][col]];
    while (row !== endRow || col !== endCol) {
        if (across) col++;
        else row++;
        squares.push(grid.squares[row][col]);
    }

    if (cache) cache.set(word, squares);
    return squares;
}

export function getWordAtSquare(grid: GridState, row: number, col: number, dir: WordDirection): GridWord | undefined {
    if (dir === WordDirection.Across && grid.acrossWordAt)
        return grid.acrossWordAt[row][col];
    if (dir === WordDirection.Down && grid.downWordAt)
        return grid.downWordAt[row][col];

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

/** Fast grid clone for fill search — copies mutable square state, shares immutable word structure. */
export function cloneGridForFill(grid: GridState): GridState {
    const squares = grid.squares.map(row =>
        row.map(sq => ({ ...sq }))
    );
    return {
        height: grid.height,
        width: grid.width,
        squares,
        words: grid.words,
        usedWords: new Map(grid.usedWords),
        userFilledSectionCandidates: new Map(grid.userFilledSectionCandidates),
        acrossWordAt: grid.acrossWordAt,
        downWordAt: grid.downWordAt,
    };
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
    for (let i = 0; i < squares.length; i++) {
        const sq = squares[i];
        if (!sq.content && !isBlackSquare(sq)) return false;
    }
    return true;
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
        return word.end[1] - word.start[1] + 1;
    else
        return word.end[0] - word.start[0] + 1;
}

export function newPuzzle(): Puzzle {
    return {
        title: "",
        author: "",
        copyright: "",
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

export function isUserOrWordFilled(sq: GridSquare): boolean {
    return sq.contentType === ContentType.User || sq.contentType === ContentType.ChosenWord;
}

export function isAcross(word: GridWord): boolean {
    return word.direction === WordDirection.Across;
}

export function getSquareAtKey(grid: GridState, squareKey: string): GridSquare {
    let tokens = squareKey.substring(1, squareKey.length - 1).split(",");
    return grid.squares[+tokens[0]][+tokens[1]];
}

export function getEntryAtWordKey(grid: GridState, wordKey: string): string {
    const word = grid.words.get(wordKey);
    if (!word) return "";
    return getLettersFromSquares(getSquaresForWord(grid, word));
}

export function getSectionCandidatesFromKeys(keys: string[]): SectionCandidate[] {
    return keys
        .map(sck => mapValues(Globals.sections!).find(sec => sec.candidates.has(sck))?.candidates.get(sck))
        .filter(sck => sck !== undefined)
        .map(sck => sck!);
}

export function constraintLetterCount(sq: GridSquare): number {
    if (sq.viableMask === undefined) return 26;
    return popcount(sq.viableMask);
}

export function isPatternFull(pattern: string): boolean {
    return !pattern.includes("-");
}

export function getUserFilledSections(grid: GridState): Section[] {
    let sectionCandidates = getSectionCandidatesFromKeys(mapKeys(grid.userFilledSectionCandidates));
    return sectionCandidates.map(sc => Globals.sections!.get(sc.sectionId)!);
}

export function getUserFilledSectionCandidates(grid: GridState): SectionCandidate[] {
    return getSectionCandidatesFromKeys(mapKeys(grid.userFilledSectionCandidates));
}

export function initializeSessionGlobals() {
    let grid = getGrid();
    Globals.sections = generateGridSections(grid);
    Globals.activeSectionId = 0;
    Globals.hoverSectionId = undefined;
    Globals.selectedSectionIds = new Map<number, boolean>();
    Globals.selectedSectionIds.set(0, true);
    Globals.selectedSectionCandidateKeys = new Map<number, string>();
    if (Globals.selectedWordKey && !grid.words.has(Globals.selectedWordKey)) {
        Globals.selectedWordKey = undefined;
        Globals.selectedWordNode = undefined;
    }
}

export function letterMatrixToLetterList(matrix: boolean[]): string[] {
    return matrix.map((x, i) => x ? String.fromCharCode(i + 65) : "").filter(x => x);
}

export function letterListToLetterMatrix(list: string[]): boolean[] {
    let matrix = Array<boolean>(26).fill(false);
    list.forEach(ltr => {
        matrix[ltr.charCodeAt(0) - 65] = true;
    });
    return matrix;
}

export function letterMatrixToMask(matrix: boolean[]): number {
    let mask = 0;
    for (let i = 0; i < 26; i++) {
        if (matrix[i]) mask |= (1 << i);
    }
    return mask;
}
