import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { queryIndexedWordList } from "./wordList";
import Globals from './windowService';

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

export function indexedWordListLookup(wl: IndexedWordList, grid: GridState, word: GridWord): string[] {
    let squares = getSquaresForWord(grid, word);
    return indexedWordListLookupSquares(wl, grid, squares);
}

export function indexedWordListLookupSquares(wl: IndexedWordList, grid: GridState, squares: GridSquare[]): string[] {
    let length = squares.length;

    let letters: [number, string][] = [];
    for(let pos = 1; pos <= length; pos++) {
        let ltr = squares[pos-1].fillContent;
        if (ltr) {
            letters.push([pos, ltr]);
        }
    }

    if (letters.length === 1) {
        return queryIndexedWordList(wl, length, letters[0][0], letters[0][1]);
    }

    let possibles: string[] = [];
    for(let i = 0; i < letters.length; i+=2) {
        let entries = i === letters.length-1 ?
            queryIndexedWordList(wl, length, letters[i-1][0], letters[i-1][1], letters[i][0], letters[i][1]) :
            queryIndexedWordList(wl, length, letters[i][0], letters[i][1], letters[i+1][0], letters[i+1][1]);
        if (entries.length === 0) return [];
        possibles = i === 0 ? entries : intersectEntryLists(possibles, entries);
    }

    return possibles;
}

export function getRandomWordsOfLength(wl: IndexedWordList, length: number): string[] {
    let bucket = Globals.starterLengthBuckets!.get(length) || [];
    let map = new Map<string, boolean>();
    let ret = [];
    for (let i = 0; i < 50; i++) {
        let index = Math.floor(Math.random() * bucket.length);
        let word = bucket[index];
        if (!map.has(word)) {
            map.set(word, true);
            ret.push(word);
        }
    }

    return ret;
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

function intersectEntryLists(list1: string[], list2: string[]): string[] {
    var hash2 = new Map(list2.map(i => [i, true]));
    return list1.filter(word => hash2.has(word));
}

export function getWordAtSquare(grid: GridState, row: number, col: number, dir: WordDirection): GridWord | undefined {
    if (dir === WordDirection.Across) {
        return grid.words.find(x => x.direction === dir && x.start[0] === row && 
            x.start[1] <= col && x.end[1] >= col);
    }
    else {
        return grid.words.find(x => x.direction === dir && x.start[1] === col && 
            x.start[0] <= row && x.end[0] >= row);
    }
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
    return !squares.find(x => !isBlackSquare(x) && x.fillContent);
}

export function isWordFull(squares: GridSquare[]): boolean {
    return !squares.find(x => !isBlackSquare(x) && !x.fillContent);
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

export function getWordLength(word: GridWord): number {
    if (word.direction === WordDirection.Across)
        return word.end[1] - word.start[1];
    else
        return word.end[0] - word.start[0];
}