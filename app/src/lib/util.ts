import { Entry } from "../models/Entry";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { getIndexedWordListBucket } from "./wordList";

export function average(arr: number[]): number {
    return arr.reduce((a,b) => a + b, 0) / arr.length;
}

export function sum(arr: number[]): number {
    return arr.reduce((a,b) => a + b, 0);
}

export function deepClone(obj: any): any {
    return JSON.parse(JSON.stringify(obj, replacer), reviver);
}

// https://stackoverflow.com/questions/29085197/how-do-you-json-stringify-an-es6-map
function replacer(this: any, key: any, value: any) {
    const originalObject = this[key];
    if(originalObject instanceof Map) {
        return {
        dataType: 'Map',
        value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
        };
    } else {
        return value;
    }
}
function reviver(key: any, value: any) {
    if(typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
        return new Map(value.value);
        }
    }
    return value;
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

export function indexedWordListLookup(wl: IndexedWordList, grid: GridState, word: GridWord): Entry[] {
    let squares = getWordSquares(grid, word);
    return indexedWordListLookupSquares(wl, grid, squares);
}

export function indexedWordListLookupSquares(wl: IndexedWordList, grid: GridState, squares: GridSquare[]): Entry[] {
    let length = squares.length;

    let letters: [number, string][] = [];
    for(let pos = 1; pos <= length; pos++) {
        let ltr = squares[pos-1].fillContent;
        if (ltr) {
            letters.push([pos, ltr]);
        }
    }

    if (letters.length === 1) {
        return getIndexedWordListBucket(wl, length, letters[0][0], letters[0][1]);
    }

    let possibles: Entry[] = [];
    for(let i = 0; i < letters.length; i+=2) {
        let entries = i === letters.length-1 ?
            getIndexedWordListBucket(wl, length, letters[i-1][0], letters[i-1][1], letters[i][0], letters[i][1]) :
            getIndexedWordListBucket(wl, length, letters[i][0], letters[i][1], letters[i+1][0], letters[i+1][1]);
        if (entries.length === 0) return [];
        possibles = i === 0 ? entries : intersectEntryLists(possibles, entries);
    }

    return possibles;
}

export function getWordSquares(grid: GridState, word: GridWord): GridSquare[] {
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

function intersectEntryLists(list1: Entry[], list2: Entry[]): Entry[] {
    var hash2 = new Map(list2.map(i => [i.word, true]));
    return list1.filter(entry => hash2.has(entry.word));
}

export function getWordAtSquare(grid: GridState, row: number, col: number, dir: WordDirection): GridWord {
    if (dir === WordDirection.Across) {
        return grid.words.find(x => x.direction === dir && x.start[0] === row && 
            x.start[1] <= col && x.end[1] >= col) || newWord();
    }
    else {
        return grid.words.find(x => x.direction === dir && x.start[1] === col && 
            x.start[0] <= row && x.end[0] >= row) || newWord();
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

export function isWordEmptyOrFull(squares: GridSquare[]): boolean {
    return !squares.find(x => x.fillContent) || !squares.find(x => !x.fillContent);
}

export function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}