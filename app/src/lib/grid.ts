import { ConstraintInfo } from "../models/ConstraintInfo";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { WordDirection } from "../models/WordDirection";
import { compareTuples, getSquaresForWord,
    isBlackSquare, newWord, forAllGridSquares, indexedWordListLookupSquares } from "./util";
import Globals from './windowService';

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

        if (grid.selectedSquare && dir === oldDir && compareTuples([row, col], grid.selectedSquare)) {
            grid.selectedWord = currentWord;
        }

        currentWord.end = [row, col];

        let nextSq = dir === WordDirection.Across ? [row, col+1] : [row+1, col];
        if (nextSq[0] === grid.height || nextSq[1] === grid.width || isBlackSquare(grid.squares[nextSq[0]][nextSq[1]])) {
            grid.words.push(currentWord);
            currentWord = newWord();
        }
    }

    let oldDir = grid.selectedWord?.direction || WordDirection.Across;
    grid.words = [];
    grid.selectedWord = undefined;

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
    forAllGridSquares(grid, sq => { sq.constraintInfo = undefined; });

    grid.words.forEach(word => {
        let squares = getSquaresForWord(grid, word);
        generateConstraintInfoForSquares(grid, squares);
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

// returns sum of the squares' constraint sums, or 0 if the word isn't viable
export function generateConstraintInfoForSquares(grid: GridState, squares: GridSquare[]): number {
    if (!squares.find(x => x.fillContent)) return 1;
    if (!squares.find(x => !x.fillContent)) {
        grid.usedWords.set(getLettersFromSquares(squares), true);
        return 1;
    }

    let wl: IndexedWordList = Globals.wordList!;
    let entryOptions = indexedWordListLookupSquares(wl, grid, squares);
    if (entryOptions.length === 0) return 0;

    let total = 0;
    let foundZeroSquare = false;
    for (let i = 0; i < squares.length; i++) {
        let sq = squares[i];

        if (!sq.constraintInfo) {
            sq.constraintInfo = {
                viableLetters: new Map<string, number>(),
                sumTotal: 0,
            } as ConstraintInfo;
        }

        if (sq.fillContent) {
            sq.constraintInfo.sumTotal = 1;
            sq.constraintInfo.viableLetters = new Map<string, number>([[sq.fillContent, 1]]);
            total += 1;
            continue;
        }

        let letters = entryOptions.map(x => x[i]);
        let newViableLetters = new Map<string, number>();
        letters.forEach(ltr => {
            newViableLetters.set(ltr, (newViableLetters.get(ltr) || 0) + 1);
        });

        let newSumTotal = 0;
        let existingViableLetters = sq.constraintInfo!.viableLetters;
        newViableLetters.forEach((v, k) => {
            if (!existingViableLetters.has(k))
            newViableLetters.delete(k);
        });
        newViableLetters.forEach((v, k) => {
            let oldVal = existingViableLetters.get(k) || 0;
            let newVal = Math.min(v, oldVal);
            if (newVal > 0) newViableLetters.set(k, newVal);
            else newViableLetters.delete(k);
            newSumTotal += newVal;
        });

        if (newSumTotal === 0) foundZeroSquare = true;
        existingViableLetters = newViableLetters;
        sq.constraintInfo.sumTotal = newSumTotal;
        total += newSumTotal;
    }

    return foundZeroSquare ? 0 : total;
}

function getLettersFromSquares(squares: GridSquare[]): string {
    let ret = "";
    squares.forEach(sq => {
        ret += sq.fillContent || ".";
    });
    return ret;
}