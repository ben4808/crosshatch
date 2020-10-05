import { ConstraintErrorType } from "../models/ConstraintErrorType";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { WordDirection } from "../models/WordDirection";
import { compareTuples, getWordAtSquare, getWordSquares, indexedWordListLookup, isBlackSquare, newWord, otherDir } from "./util";
import Globals from './windowService';

export function generateWordInfo(grid: GridState) {
    function resetCurrentWord() {
        if (currentWord && currentWord.number) {
            grid.words.push(currentWord);
            generateConstraintInfo(wl, grid, currentWord);
        }

        currentWord = newWord();
    }

    function processSquare(sq: GridSquare, row: number, col: number, dir: WordDirection) {
        if (isBlackSquare(sq)) {
            resetCurrentWord();
            return;
        }

        if (!currentWord.number && !sq.number) {
            return;
        }

        if (!currentWord.number) {
            currentWord.number = sq.number;
            currentWord.direction = dir;
            currentWord.start = [row, col]; 
        }

        if (grid.selectedSquare && dir === oldDir && compareTuples([row, col], grid.selectedSquare)) {
            grid.selectedWord = currentWord;
        }

        currentWord.end = [row, col];
    }

    let wl: IndexedWordList = Globals.wordList;
    let oldDir = grid.selectedWord?.direction || WordDirection.Across;
    grid.words = [];
    grid.selectedWord = undefined;

    numberizeGrid(grid);

    let currentWord: GridWord;
    for (let row = 0; row < grid.height; row++) {
        resetCurrentWord();
        for (let col = 0; col < grid.width; col++) {
            let sq = grid.squares[row][col];
            processSquare(sq, row, col, WordDirection.Across);
        }
    }

    for (let col = 0; col < grid.width; col++) {
        resetCurrentWord();
        for (let row = 0; row < grid.height; row++) {
            let sq = grid.squares[row][col];
            processSquare(sq, row, col, WordDirection.Down);
        }
    }
    resetCurrentWord();
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
                let isUncheckedStart = (isAboveBlocked && isBelowBlocked && isLeftBlocked) || 
                                       (isLeftBlocked && isRightBlocked && isAboveBlocked);
                let isCheckedStart = isAboveBlocked || isLeftBlocked;

                if ((isUnchecked && isUncheckedStart) || (!isUnchecked && isCheckedStart)) {
                    sq.number = currentNumber++;
                }
            } 
        }
    }
}

function generateConstraintInfo(wl: IndexedWordList, grid: GridState, word: GridWord) {
    let squares = getWordSquares(grid, word);
    if (!squares.find(x => x.fillContent) || !squares.find(x => !x.fillContent)) {
        return;
    }

    let entryOptions = indexedWordListLookup(wl, grid, word);

    var constraintSum = 0;
    let badCrossingFound = false;
    word.constraintError = entryOptions.length === 0 ? ConstraintErrorType.Word : ConstraintErrorType.None;
    for (let i = 0; i < squares.length; i++) {
        let sq = squares[i];
        sq.constraintError = word.constraintError;

        if (sq.fillContent) {
            sq.constraintSum = 1;
            sq.constraintMap = new Map<string, number>([[sq.fillContent, 1]]);
            continue;
        }
        else if (badCrossingFound || entryOptions.length === 0) {
            sq.constraintSum = 0;
            sq.constraintMap = new Map<string, number>();
            continue;
        }

        let letters = entryOptions.map(x => x.entry[i]);
        let newConstraintsMap = new Map<string, number>();
        letters.forEach(ltr => {
            newConstraintsMap.set(ltr, (newConstraintsMap.get(ltr) || 0) + 1);
            constraintSum++;
        });

        let isExistingMap = sq.constraintMap.size > 0;
        if (!isExistingMap) {
            sq.constraintSum = constraintSum;
            sq.constraintMap = newConstraintsMap;
        }
        else {
            constraintSum = 0;
            newConstraintsMap.forEach((v, k) => {
                let oldVal = sq.constraintMap.get(k) || 0;
                let newVal = Math.min(v, oldVal);
                if (newVal > 0) sq.constraintMap.set(k, newVal);
                else sq.constraintMap.delete(k);
                constraintSum += newVal;
            });

            sq.constraintSum = constraintSum;
            if (constraintSum === 0) {
                badCrossingFound = true;

                word.constraintError = ConstraintErrorType.Crossing;
                squares.forEach(w => { w.constraintError = ConstraintErrorType.Crossing; });

                let otherWord = getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction));
                otherWord.constraintError = ConstraintErrorType.Crossing;
                getWordSquares(grid, otherWord).forEach(w => { w.constraintError = ConstraintErrorType.Crossing; });
            }
        }
    }
}