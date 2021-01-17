import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import Globals from './windowService';
import { getSquaresForWord, isBlackSquare, newWord, forAllGridSquares, 
    isWordFull, isWordEmpty, getGrid, isUserFilled, deepClone, 
    wordKey, getWordAtSquare, getSquareAtKey, otherDir, squareKey, fullAlphabet } from "./util";
import { SymmetryType } from "../models/SymmetryType";
import { makeNewNode } from "./fill";
import { ContentType } from "../models/ContentType";
import { processAndInsertChosenEntry } from "./insertEntry";
import { queryIndexedWordList } from "./wordList";
import { populateAndScoreEntryCandidates } from "./entryCandidates";
import { getSectionsWithSelectedCandidate, getSectionWithCandidate, getSelectedSectionCandidatesWithWord } from "./section";

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
        if (!letters.includes("-")) grid.usedWords.set(letters, true);
        generateConstraintInfoForSquares(newSquares);
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

export function generateConstraintInfoForSquares(squares: GridSquare[]) {
    squares.forEach(sq => {
        if (sq.content) {
            let newLettersArr = Array<boolean>(26).fill(false);
            setLettersArrayVal(newLettersArr, sq.content!, true);
            sq.constraintInfo = {
                isCalculated: true,
                letterFillCount: 1,
                viableLetters: newLettersArr,
            };
        }
        else if (!sq.constraintInfo) {
            sq.constraintInfo = {
                isCalculated: false,
                letterFillCount: 26,
                viableLetters: Array<boolean>(26).fill(true),
            }
        }
    });
    if (isWordEmpty(squares) || isWordFull(squares)) return;

    let pattern = getLettersFromSquares(squares);
    let entryOptions = queryIndexedWordList(pattern);
    if (entryOptions.length > 500) return;

    for (let i = 0; i < squares.length; i++) {
        let sq = squares[i];
        if (sq.content) continue;
        let existingViableLetters = sq.constraintInfo!.viableLetters;
        let newViableLetters = Array<boolean>(26).fill(false);

        let letters = entryOptions.map(entry => entry[i]);
        letters.forEach(ltr => {
            if (sq.constraintInfo!.isCalculated && !getLettersArrayVal(existingViableLetters, ltr)) return;
            setLettersArrayVal(newViableLetters, ltr, true);
        });
        sq.constraintInfo!.isCalculated = true;
        sq.constraintInfo!.letterFillCount = newViableLetters.filter(x => x).length;
        sq.constraintInfo!.viableLetters = newViableLetters;
    }
}

export function getLettersArrayVal(arr: boolean[], ltr: string) {
    return arr[ltr.charCodeAt(0) - 65];
}

export function setLettersArrayVal(arr: boolean[], ltr: string, newVal: boolean) {
    arr[ltr.charCodeAt(0) - 65] = newVal;
}

export function getConstraintLetters(sq: GridSquare): string[] {
    if (!sq.constraintInfo) return fullAlphabet;
    return sq.constraintInfo!.viableLetters
        .map((v, i) => v ? String.fromCharCode(i + 65) : "")
        .filter(x => x);
}

export function getConstraintSquareSum(squares: GridSquare[]): number {
    let total = 0;
    squares.forEach(sq => {
        total += sq.constraintInfo!.letterFillCount;
    });
    return total;
}

export function getLettersFromSquares(squares: GridSquare[]): string {
    return squares.map(sq => sq.content ? sq.content! : "-").join("");
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
        userFilledSectionCandidates: new Map<string, boolean>(),
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

export function insertEntryIntoGrid(node: FillNode, wordKey: string, entry: string, contentType?: ContentType) {
    let grid = node.startGrid;
    node.fillWord = grid.words.get(wordKey)!;
    node.chosenEntry = node.entryCandidates.find(ec => ec.word === entry);
    processAndInsertChosenEntry(node, contentType);
}

export function eraseGridSquare(grid: GridState, sq: GridSquare, dir: WordDirection) {
    let word = getWordAtSquare(grid, sq.row, sq.col, dir)!;
    let squares = getSquaresForWord(grid, word);

    if (squares.find(sq => sq.contentType === ContentType.Autofill)) {
        ; // autofill is ephemeral, no need to explicitly delete
    }
    else if (squares.find(sq => sq.contentType === ContentType.ChosenSection)) {
        getSelectedSectionCandidatesWithWord(wordKey(word)).forEach(sc => {
            let section = getSectionWithCandidate(sc);
            section.squares.forEach((_, sqKey) => {
                let sq = getSquareAtKey(grid, sqKey);
                if (sq.contentType === ContentType.ChosenSection)
                    sq.contentType = ContentType.Autofill;
            });
        });
    }
    else if (squares.find(sq => sq.contentType === ContentType.ChosenWord)) {
        let isInSection = getSectionsWithSelectedCandidate().find(sec => sec.squares.has(squareKey(sq)));

        squares.forEach(wsq => {
            if (wsq.contentType === ContentType.User) return;

            let cross = getWordAtSquare(grid, wsq.row, wsq.col, otherDir(dir))!;
            let crossSquares = getSquaresForWord(grid, cross);
            if (crossSquares.find(csq => [ContentType.Autofill, ContentType.ChosenSection].includes(csq.contentType))) {
                if (isInSection)
                    wsq.contentType = ContentType.ChosenSection;
                else
                    wsq.contentType = ContentType.Autofill;
            }
        });
    }

    if (sq.contentType === ContentType.User)
        sq.contentType = ContentType.Autofill;
        
    sq.content = undefined;
    clearFill(grid);
}

export function clearFill(grid: GridState) {
    forAllGridSquares(grid, sq => {
        if (!isUserFilled(sq)) {
            sq.content = undefined;
        }
    });
}

export function updateManualEntryCandidates(grid: GridState) {
    if (Globals.selectedWordKey) {
        let node = makeNewNode(grid, 0, false, undefined);
        node.fillWord = grid.words.get(Globals.selectedWordKey!);
        populateAndScoreEntryCandidates(node, true);
        Globals.selectedWordNode = node;
    }
    else 
        Globals.selectedWordNode = undefined;
}
