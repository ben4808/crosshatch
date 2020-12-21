import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import Globals from './windowService';
import { getSquaresForWord, isBlackSquare, newWord, forAllGridSquares, 
    indexedWordListLookupSquares, isWordFull, isWordEmpty, getGrid, isUserFilled, deepClone, wordKey } from "./util";
import { SymmetryType } from "../models/SymmetryType";
import { processAndInsertChosenEntry } from "./fill";
import { ContentType } from "../models/ContentType";

export function populateWords(grid: GridState) {
    function processSquare(grid: GridState, row: number, col: number, dir: WordDirection) {
        let sq = grid.squares[row][col];

        if (isBlackSquare(sq)) return;
        if (!currentWord.number && !sq.number) return; // unchecked square

        if (!currentWord.number) {
            currentWord.number = sq.number;
            currentWord.direction = dir;
            currentWord.start = [row, col]; 
        }

        currentWord.end = [row, col];

        let nextSq = dir === WordDirection.Across ? [row, col+1] : [row+1, col];
        if (nextSq[0] === grid.height || nextSq[1] === grid.width || isBlackSquare(grid.squares[nextSq[0]][nextSq[1]])) {
            if ((dir === WordDirection.Across && currentWord.end[1] - currentWord.start[1] > 0) ||
                (dir === WordDirection.Down && currentWord.end[0] - currentWord.start[0] > 0))
                grid.words.set(wordKey(currentWord), currentWord);
            currentWord = newWord();
        }
    }

    grid.words = new Map<string, GridWord>();

    numberizeGrid(grid);

    let currentWord: GridWord = newWord();
    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            processSquare(grid, row, col, WordDirection.Across);
        }
    }

    for (let col = 0; col < grid.width; col++) {
        for (let row = 0; row < grid.height; row++) {
            processSquare(grid, row, col, WordDirection.Down);
        }
    }
}

export function updateGridConstraintInfo(grid: GridState) {
    grid.usedWords = new Map<string, boolean>();
    forAllGridSquares(grid, sq => { sq.constraintInfo = undefined; });

    grid.words.forEach(word => {
        let newSquares = deepClone(getSquaresForWord(grid, word)) as GridSquare[];
        let letters = getLettersFromSquares(newSquares);
        if (!letters.includes(".")) grid.usedWords.set(letters, true);
        generateConstraintInfoForSquares(grid, newSquares);
        if (newSquares !== undefined && newSquares.length > 0) {
            newSquares.forEach(ns => {
                grid.squares[ns.row][ns.col] = ns;
            });
        }
    });
}

function numberizeGrid(grid: GridState) {
    var currentNumber = 1;

    for(var row = 0; row < grid.height; row++) {
        for (var col = 0; col < grid.width; col++) {
            var sq = grid.squares[row][col];  
            sq.number = undefined;

            if (!isBlackSquare(sq)) {
                let isAboveBlocked = (row === 0 || isBlackSquare(grid.squares![row-1][col]));
                let isBelowBlocked = (row === grid.height-1 || isBlackSquare(grid.squares[row+1][col]));
                let isLeftBlocked = (col === 0 || isBlackSquare(grid.squares[row][col-1]));
                let isRightBlocked = (col === grid.width-1 || isBlackSquare(grid.squares[row][col+1]));

                let isUnchecked = (isAboveBlocked && isBelowBlocked) || (isLeftBlocked && isRightBlocked);
                let isUncheckedStart = (isAboveBlocked && isBelowBlocked && isLeftBlocked && !isRightBlocked) || 
                                       (isLeftBlocked && isRightBlocked && isAboveBlocked && !isBelowBlocked);
                let isCheckedStart = isAboveBlocked || isLeftBlocked;

                if ((isUnchecked && isUncheckedStart) || (!isUnchecked && isCheckedStart)) {
                    sq.number = currentNumber++;
                }
            } 
        }
    }
}

export function generateConstraintInfoForSquares(grid: GridState, squares: GridSquare[]) {
    squares.forEach(sq => {
        if (sq.content) {
            sq.constraintInfo = {
                isCalculated: true,
                sumTotal: 1,
                viableLetters: new Map<string, number>([[sq.content!, 1]]),
            };
        }
        else {
            sq.constraintInfo = {
                isCalculated: false,
                sumTotal: 0,
                viableLetters: new Map<string, number>(),
            }
        }
    });
    if (isWordEmpty(squares) || isWordFull(squares)) return;

    let entryOptions = indexedWordListLookupSquares(squares);
    if (entryOptions.length > 200) {
        squares.forEach(sq => { sq.constraintInfo!.isCalculated = false; });
        return;
    }

    for (let i = 0; i < squares.length; i++) {
        let sq = squares[i];
        let letters = entryOptions.map(x => x[i]);
        let newViableLetters = new Map<string, number>();
        letters.forEach(ltr => {
            newViableLetters.set(ltr, (newViableLetters.get(ltr) || 0) + 1);
        });

        let sumTotal = 0;
        let existingViableLetters = sq.constraintInfo!.viableLetters;
        if (sq.constraintInfo!.isCalculated) {
            newViableLetters.forEach((_, k) => {
                if (!existingViableLetters.has(k))
                newViableLetters.delete(k);
            });
            newViableLetters.forEach((v, k) => {
                let oldVal = existingViableLetters.get(k) || 0;
                let newVal = Math.min(v, oldVal);
                if (newVal > 0) newViableLetters.set(k, newVal);
                else newViableLetters.delete(k);
                sumTotal += newVal;
            });
        }
        else {
            newViableLetters.forEach((v, k) => {
                sumTotal += v;
            });
        }

        sq.constraintInfo!.isCalculated = true;
        sq.constraintInfo!.viableLetters = newViableLetters;
        sq.constraintInfo!.sumTotal = sumTotal;
    }
}

export function getConstraintSquareSum(squares: GridSquare[]): number {
    let total = 0;
    squares.forEach(sq => {
        total += sq.constraintInfo!.sumTotal;
    });
    return total;
}

export function getLettersFromSquares(squares: GridSquare[], includeFillContent?: boolean): string {
    if (includeFillContent === undefined) includeFillContent = true;
    let ret = "";
    squares.forEach(sq => {
        ret += (includeFillContent ? sq.content : sq.content) || "-";
    });
    return ret;
}

export function gridToString(grid: GridState): string {
    let chs: string[] = [];
    forAllGridSquares(grid, sq => {
        chs.push(isBlackSquare(sq) ? "." : sq.content ? sq.content : "-");
    });
    return chs.join("");
}

export function createNewGrid(width: number, height: number): GridState {
    let squares: GridSquare[][] = [];

    for (let row = 0; row < height; row++) {
        squares.push([]);
        for (let col = 0; col < width; col++) {
            squares[row][col] = {
                row: row,
                col: col,
                type: SquareType.White,
                isCircled: false,
                contentType: ContentType.Autofill,
            } as GridSquare;
        }
    }

    let grid: GridState = {
        height: height,
        width: width,
        squares: squares,
        words: new Map<string, GridWord>(),
        usedWords: new Map<string, boolean>(),
    };

    populateWords(grid);

    return grid;
}

export function getUncheckedSquareDir(grid: GridState, row: number, col: number): WordDirection | undefined {
    if (grid.squares[row][col].type === SquareType.Black) return undefined;
    if ((col === 0 || grid.squares[row][col-1].type === SquareType.Black) &&
        (col === grid.width-1 || grid.squares[row][col+1].type === SquareType.Black))
        return WordDirection.Down;
    if ((row === 0 || grid.squares[row-1][col].type === SquareType.Black) &&
        (row === grid.height-1 || grid.squares[row+1][col].type === SquareType.Black))
        return WordDirection.Across;

    return undefined;
}

export function clearFill(grid: GridState) {
    grid.squares.forEach(row => {
        row.forEach(sq => {
            if (!isUserFilled(sq)) {
                sq.content = undefined;
            }
        });
    });
}

export function getSymmetrySquares(initSquare: [number, number]): [number, number][] {
    let grid = getGrid();
    let w = grid.width - 1;
    let h = grid.height - 1;
    let r = initSquare[0];
    let c = initSquare[1];
    let ret = [initSquare];

    switch (Globals.gridSymmetry!) {
        case SymmetryType.Rotate180:
            ret.push([h - r, w - c]);
            break;
        case SymmetryType.Rotate90:
            ret.push([c, h - r]);
            ret.push([h - r, w - c]);
            ret.push([w - c, r]);
            break;
        case SymmetryType.MirrorHorizontal:
            ret.push([r, w - c]);
            break;
        case SymmetryType.MirrorVertical:
            ret.push([h - r, c]);
            break;
        case SymmetryType.MirrorNWSE:
            ret.push([w - c, h - r]);
            break;
        case SymmetryType.MirrorNESW:
            ret.push([c, r]);
            break;
    }

    return ret;
}

export function getSquareAtKey(grid: GridState, squareKey: string): GridSquare {
    let tokens = squareKey.substring(1, squareKey.length - 1).split(",");
    return grid.squares[+tokens[0]][+tokens[1]];
}

export function insertEntryIntoGrid(node: FillNode, wordKey: string, entry: string) {
    let grid = node.startGrid;
    node.fillWord = grid.words.get(wordKey)!;
    node.chosenEntry = node.entryCandidates.find(ec => ec.word === entry);
    processAndInsertChosenEntry(node);
}
