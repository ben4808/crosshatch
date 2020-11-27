import { ConstraintInfo } from "../models/ConstraintInfo";
import { FillNode } from "../models/FillNode";
import { FillStatus } from "../models/FillStatus";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { priorityQueue } from "./priorityQueue";
import Globals from './windowService';
import { getSquaresForWord, isBlackSquare, newWord, forAllGridSquares, 
    indexedWordListLookupSquares, isWordFull, isWordEmpty, getWordAtSquare } from "./util";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";

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
                grid.words.push(currentWord);
            currentWord = newWord();
        }
    }

    grid.words = [];

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

    grid.words.sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === WordDirection.Across ? -1 : 1;
        return a.number! - b.number!;
    });
}

export function updateGridConstraintInfo(grid: GridState) {
    grid.usedWords = new Map<string, boolean>();
    forAllGridSquares(grid, sq => { sq.constraintInfo = undefined; });

    grid.words.forEach(word => {
        let squares = getSquaresForWord(grid, word);
        let letters = getLettersFromSquares(squares);
        if (!letters.includes(".")) grid.usedWords.set(letters, true);
        let newSquares = generateConstraintInfoForSquares(grid, squares);
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

export function generateConstraintInfoForSquares(grid: GridState, squares: GridSquare[]): GridSquare[] | undefined {
    let ret = [] as GridSquare[];

    if (isWordEmpty(squares)) return ret;

    if (isWordFull(squares)) {
        squares.forEach(sq => {
            sq.constraintInfo = {
                sumTotal: 1,
                viableLetters: new Map<string, number>([[sq.fillContent!, 1]]),
            };
        });
        return squares;
    }

    let entryOptions = indexedWordListLookupSquares(grid, squares);
    if (entryOptions.length > 200) return ret;

    let foundZeroSquare = false;
    for (let i = 0; i < squares.length; i++) {
        let sq = squares[i];

        let justInitialized = false;
        if (!sq.constraintInfo) {
            sq.constraintInfo = {
                viableLetters: new Map<string, number>(),
                sumTotal: 0,
            } as ConstraintInfo;
            justInitialized = true;
        }

        if (sq.fillContent) {
            sq.constraintInfo.sumTotal = 1;
            sq.constraintInfo.viableLetters = new Map<string, number>([[sq.fillContent, 1]]);
            continue;
        }

        let letters = entryOptions.map(x => x[i]);
        let newViableLetters = new Map<string, number>();
        letters.forEach(ltr => {
            newViableLetters.set(ltr, (newViableLetters.get(ltr) || 0) + 1);
        });

        let sumTotal = 0;
        let existingViableLetters = sq.constraintInfo!.viableLetters;
        if (!justInitialized) {
            newViableLetters.forEach((v, k) => {
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

        if (sumTotal === 0) foundZeroSquare = true;
        sq.constraintInfo!.viableLetters = newViableLetters;
        sq.constraintInfo.sumTotal = sumTotal;
    }

    return foundZeroSquare ? undefined : squares;
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
        ret += (includeFillContent ? sq.fillContent : sq.userContent) || "-";
    });
    return ret;
}

export function gridToString(grid: GridState): string {
    let chs: string[] = [];
    forAllGridSquares(grid, sq => {
        chs.push(isBlackSquare(sq) ? "." : sq.fillContent ? sq.fillContent : "-");
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
            };
        }
    }

    let grid: GridState = {
        height: height,
        width: width,
        squares: squares,
        words: [],
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
    Globals.fillStatus = FillStatus.Ready;
    Globals.isFirstFillCall = true;
    Globals.fillQueue = priorityQueue<FillNode>();

    grid.squares.forEach(row => {
        row.forEach(sq => {
            if (!sq.userContent && !sq.chosenFillContent) {
                sq.fillContent = undefined;
            }
        });
    });
}

export function generateGridSections(grid: GridState): Section[] {
    function iterateSection(section: Section, grid: GridState, sq: GridSquare, usedSquares: Map<string, boolean>) {
        section.openSquareCount++;
        usedSquares.set(`${sq.row},${sq.col}`, true);

        getNeighboringSquares(grid, sq).forEach(neighbor => {
            if (isOpenSquare(grid, neighbor) && !usedSquares.has(`${neighbor.row},${neighbor.col}`)) {
                iterateSection(section, grid, neighbor, usedSquares);
            }

            [WordDirection.Across, WordDirection.Down].forEach(dir => {
                let word = getWordAtSquare(grid, neighbor.row, neighbor.col, dir)!;
                if (!section.words.includes(word)) {
                    section.words.push(word);
                    let squares = getSquaresForWord(grid, word);
                    squares.forEach(wsq => {
                        section.squares.set(`${wsq.row},${wsq.col}`, true);
                    });
                }
            });
        });
    }

    let sections = [] as Section[];
    let usedSquares = new Map<string, boolean>();
    let i = 1;

    forAllGridSquares(grid, sq => {
        if (isOpenSquare(grid, sq) && !usedSquares.has(`${sq.row},${sq.col}`)) {
            let newSection = {
                number: i++,
                openSquareCount: 0,
                squares: new Map<string, boolean>(),
                words: [],
                candidates: new Map<string, SectionCandidate>(),
            } as Section;

            iterateSection(newSection, grid, sq, usedSquares);
            sections.push(newSection);
        }
    });

    return sections.sort((a, b) => a.openSquareCount - b.openSquareCount);
}

function isOpenSquare(grid: GridState, sq: GridSquare): boolean {
    let neighbors = getNeighboringSquares(grid, sq);
    return neighbors.length === 8 && !neighbors.find(n => isBlackSquare(n));
}

function getNeighboringSquares(grid: GridState, sq: GridSquare): GridSquare[] {
    let ret = [] as GridSquare[];
    let nClear = sq.row > 0;
    let sClear = sq.row < grid.height-1;
    let wClear = sq.col > 0;
    let eClear = sq.col < grid.width-1;

    if (nClear && wClear) ret.push(grid.squares[sq.row-1][sq.col-1]);
    if (nClear) ret.push(grid.squares[sq.row-1][sq.col]);
    if (nClear && eClear) ret.push(grid.squares[sq.row-1][sq.col+1]);
    if (eClear) ret.push(grid.squares[sq.row][sq.col+1]);
    if (sClear && eClear) ret.push(grid.squares[sq.row+1][sq.col+1]);
    if (sClear) ret.push(grid.squares[sq.row+1][sq.col]);
    if (sClear && wClear) ret.push(grid.squares[sq.row+1][sq.col-1]);
    if (wClear) ret.push(grid.squares[sq.row][sq.col-1]);

    return ret;
}
