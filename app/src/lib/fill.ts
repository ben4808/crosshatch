import { Entry } from "../models/Entry";
import { FillCandidate } from "../models/FillCandidate";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { WordDirection } from "../models/WordDirection";
import { average, compareTuples, getWordAtSquare, getWordSquares, 
    indexedWordListLookup, indexedWordListLookupSquares, isBlackSquare, isWordEmptyOrFull, otherDir, sum } from "./util";
import Globals from './windowService';

export function fillWord(grid: GridState) {
    if (isGridFilled(grid)) {
        return;
    }

    let wl: IndexedWordList = Globals.wordList;

    let wordToFillOrNull = getMostConstrainedWord(grid, wl);
    if (!wordToFillOrNull) return;
    let wordToFill = wordToFillOrNull!;

    let fillOptions = indexedWordListLookup(wl, grid, wordToFill);
    let candidate: FillCandidate = {
        previousGrid: grid,
        fillWord: wordToFill,
        entryCandidates: [],
    };
    let wordSquares = getWordSquares(grid, wordToFill);
    let crosses = wordSquares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(wordToFill.direction)))
        .filter(w => w.number && getWordSquares(grid, w).find(x => !x.fillContent));
    if (crosses.length === 0) return;

    fillOptions.forEach(op => {
        let sumOfChanges = 0;
        let foundBadCross = false;
        for (let i = 0; i < crosses.length; i++) {
            let cross = crosses[i];
            let squares = getWordSquares(grid, cross);
            let oldSum = getWordConstraintSum(squares);

            let newSquares = squares.map(x => Object.assign({}, x));
            let sqToReplace: GridSquare;
            let newVal: string;
            if (wordToFill.direction === WordDirection.Across) {
                sqToReplace = newSquares.find(nsq => nsq.row === wordSquares[0].row)!;
                newVal = op.entry[sqToReplace.col - wordSquares[0].col];
            }
            else {
                sqToReplace = newSquares.find(nsq => nsq.col === wordSquares[0].col)!;
                newVal = op.entry[sqToReplace.row - wordSquares[0].row];
            }
            sqToReplace.fillContent = newVal;
            
            let newSum = getConstriantSumWithSquares(wl, grid, newSquares);
            if (newSum === 0) {
                foundBadCross = true;
                break;
            }
            sumOfChanges += (oldSum - newSum);
        }

        if (!foundBadCross)
            candidate.entryCandidates.push([op.entry, calculateCandidateScore(op, sumOfChanges)]);
    });

    if(candidate.entryCandidates.length === 0) return;

    candidate.entryCandidates = candidate.entryCandidates.sort((a, b) => b[1] - a[1]);
    var chosenEntry = chooseEntryFromCandidates(candidate.entryCandidates);
    insertEntryIntoGrid(grid, wordToFill, chosenEntry);
}

function calculateCandidateScore(op: Entry, sumOfChanges: number): number {
    return 100 * op.qualityClass / sumOfChanges;
}

function chooseEntryFromCandidates(candidates: [string, number][]): string {
    let sumOfScores = sum(candidates.map(x => x[1]));
    let roll = Math.random();
    let curTotal = 0;
    for (let i = 0; i < candidates.length; i++) {
        curTotal += candidates[i][1];
        if (roll <= (curTotal / sumOfScores))
            return candidates[i][0];
    }

    return candidates[0][0];
}

function isGridFilled(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && !sq.fillContent));
}

function getMostConstrainedWord(grid: GridState, wl: IndexedWordList): GridWord | undefined {
    let words = grid.words;
    
    let mostConstrainedKey = -1;
    let mostConstrainedScore = 1e8;
    for (let i = 0; i < words.length; i++) {
        let squares = getWordSquares(grid, words[i]);
        if (isWordEmptyOrFull(squares)) continue;

        var constraintScore = getWordConstraintScore(squares);
        if (constraintScore >= 0 && constraintScore < mostConstrainedScore) {
            mostConstrainedKey = i;
            mostConstrainedScore = constraintScore;
        }
    }
    
    if (mostConstrainedKey === -1) return undefined;
    return words[mostConstrainedKey];
}

function getWordConstraintScore(squares: GridSquare[]): number {
    if(squares[0].constraintSum === -1) return -1;

    return average(squares.filter(x => !x.fillContent).map(x => x.constraintSum));
}

function getWordConstraintSum(squares: GridSquare[]): number {
    if(squares[0].constraintSum === -1) return -1;

    return sum(squares.filter(x => !x.fillContent).map(x => x.constraintSum));
}

function insertEntryIntoGrid(grid: GridState, word: GridWord, newEntry: string) {
    let curPos = word.start;
    let curIndex = 0;
    while (!compareTuples(curPos, word.end)) {
        grid.squares[curPos[0]][curPos[1]].fillContent = newEntry[curIndex];

        curPos = word.direction === WordDirection.Across ?
            [curPos[0], curPos[1]+1] : [curPos[0]+1, curPos[1]];
        curIndex++;
    }
    grid.squares[curPos[0]][curPos[1]].fillContent = newEntry[curIndex];
}

function getConstriantSumWithSquares(wl: IndexedWordList, grid: GridState, squares: GridSquare[]): number {
    let entryOptions = indexedWordListLookupSquares(wl, grid, squares);
    if (entryOptions.length === 0) return 0;

    let total = 0;
    for (let i = 0; i < squares.length; i++) {
        let newSq = squares[i];
        let existingSq = grid.squares[newSq.row][newSq.col];

        if (newSq.fillContent) {
            newSq.constraintSum = 1;
            newSq.constraintMap = new Map<string, number>([[newSq.fillContent, 1]]);
            total += 1;
            continue;
        }

        let letters = entryOptions.map(x => x.entry[i]);
        newSq.constraintMap = new Map<string, number>();
        letters.forEach(ltr => {
            newSq.constraintMap.set(ltr, (newSq.constraintMap.get(ltr) || 0) + 1);
        });

        newSq.constraintSum = 0;
        let existingConstraintsMap = existingSq.constraintMap;
        newSq.constraintMap.forEach((v, k) => {
            if (!existingConstraintsMap.has(k))
                newSq.constraintMap.delete(k);
        });
        newSq.constraintMap.forEach((v, k) => {
            let oldVal = existingConstraintsMap.get(k) || 0;
            let newVal = Math.min(v, oldVal);
            if (newVal > 0) newSq.constraintMap.set(k, newVal);
            else newSq.constraintMap.delete(k);
            newSq.constraintSum += newVal;
        });

        if (newSq.constraintSum === 0) return 0;
        total += newSq.constraintSum;
    }

    return total;
}
