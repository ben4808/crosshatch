import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { FillStatus } from "../models/FillStatus";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { WordDirection } from "../models/WordDirection";
import { average, deepClone, compareTuples, getWordAtSquare, getSquaresForWord, 
    indexedWordListLookup, indexedWordListLookupSquares, isBlackSquare, 
    isWordEmptyOrFull, otherDir, shuffleArray, sum } from "./util";
import Globals from './windowService';

export function fillWord(): void {
    if ([FillStatus.Ready, FillStatus.Running, FillStatus.Paused].find(x => x === Globals.fillStatus) === undefined) {
        return;
    }

    let fillQueue = Globals.fillQueue!;
    let grid = deepClone(Globals.gridState!);
    Globals.fillStatus = FillStatus.Running;

    let node = fillQueue.isEmpty() ? makeNewNode(grid) : fillQueue.pop();
    let newNode = populateNewNode(grid);
    
    let viableCandidates = node.entryCandidates.filter(x => x.isViable);
    if(viableCandidates.length === 0) {
        if (fillStack.length === 0) {
            Globals.fillStatus = FillStatus.Failed;
            return node.startGrid;
        }

        let previousNode = fillStack.pop()!;
        let prevCandidate = previousNode.entryCandidates.find(x => x.entry.word === previousNode.chosenWord)!;
        prevCandidate.score = 0;
        prevCandidate.isViable = false;
        previousNode.chosenWord = "";
        return fillWord(previousNode.startGrid, previousNode);
    }

    node.chosenWord = chooseEntryFromCandidates(viableCandidates);
    insertEntryIntoGrid(grid, node.fillWord, node.chosenWord);
    fillStack.push(node);

    if (isGridFilled(grid)) {
        Globals.fillStatus = FillStatus.Success;
    }

    return grid;
}

function makeNewNode(grid: GridState): FillNode {
    return {
        startGrid: grid,
        fillWord: grid.words[0],
        entryCandidates: [],
        chosenWord: "",
    } as FillNode;
}

function populateNewNode(grid: GridState): FillNode | undefined {
    let node = {
        startGrid: deepClone(grid),
        fillWord: grid.words[0],
        entryCandidates: [],
        chosenWord: "",
    } as FillNode;

    let wordToFillOrNull = getMostConstrainedWord(grid, wl);
    if (!wordToFillOrNull) return undefined;
    node.fillWord = wordToFillOrNull!;
    
    let wordSquares = getWordSquares(grid, node.fillWord);
    let crosses = wordSquares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(node.fillWord.direction)))
        .filter(w => w.number && getWordSquares(grid, w).find(x => !x.fillContent));
    if (crosses.length === 0) return;

    let highestLowConstraintSum = 0;
    let maxSumOfPercentageLosses = 0;
    while(highestLowConstraintSum === 0 && getOptionsToConsider(wl, grid, node)) {
        node.entryCandidates.forEach(candidate => {
            let foundBadCross = false;
            let sumOfPercentageLosses = 0;
            let lowConstraintSum = 1e8;
            for (let i = 0; i < crosses.length; i++) {
                let cross = crosses[i];
                let squares = getWordSquares(grid, cross);
                let oldSum = getWordConstraintSum(squares);

                let newSquares = squares.map(x => Object.assign({}, x));
                let sqToReplace: GridSquare;
                let newVal: string;
                if (node.fillWord.direction === WordDirection.Across) {
                    sqToReplace = newSquares.find(nsq => nsq.row === wordSquares[0].row)!;
                    newVal = candidate.entry.word[sqToReplace.col - wordSquares[0].col];
                }
                else {
                    sqToReplace = newSquares.find(nsq => nsq.col === wordSquares[0].col)!;
                    newVal = candidate.entry.word[sqToReplace.row - wordSquares[0].row];
                }
                sqToReplace.fillContent = newVal;

                if (!sqToReplace.constraintMap.has(newVal)) {
                    foundBadCross = true;
                    break;
                }
                
                let newSum = getConstriantSumWithSquares(wl, grid, newSquares);
                if (newSum === 0) {
                    foundBadCross = true;
                    break;
                }

                sumOfPercentageLosses += (oldSum - newSum) / oldSum;
                if (newSum < lowConstraintSum) lowConstraintSum = newSum;
            }

            if (foundBadCross) {
                candidate.score = 0;
                candidate.isViable = false;
                return;
            }

            candidate.sumOfPercentageLosses = sumOfPercentageLosses;
            candidate.lowConstraintSum = lowConstraintSum;
            if (sumOfPercentageLosses > maxSumOfPercentageLosses)
                maxSumOfPercentageLosses = sumOfPercentageLosses;
            if (lowConstraintSum > highestLowConstraintSum)
                highestLowConstraintSum = lowConstraintSum;
        });
    }

    let viableCandidates = node.entryCandidates.filter(x => x.isViable);
    viableCandidates.forEach(candidate => {
        candidate.score = calculateCandidateScore(candidate, maxSumOfPercentageLosses, highestLowConstraintSum);
    });
    
    viableCandidates = viableCandidates.sort((a, b) => b.score! - a.score!);

    return node;
}

function calculateCandidateScore(candidate: EntryCandidate, maxSumOfPercentageLosses: number, highestLowConstraintSum: number): number {
    let score1 = (maxSumOfPercentageLosses - candidate.sumOfPercentageLosses!) / maxSumOfPercentageLosses;
    let score2 = candidate.lowConstraintSum! / highestLowConstraintSum;

    return (score1 * 1 + score2 * 2) * candidate.entry.qualityClass / 3;
}

function chooseEntryFromCandidates(candidates: EntryCandidate[]): string {
    let sumOfScores = sum(candidates.map(x => x.score!));
    let roll = Math.random();
    let curTotal = 0;
    for (let i = 0; i < candidates.length; i++) {
        curTotal += candidates[i].score!;
        if (roll <= (curTotal / sumOfScores))
            return candidates[i].entry.word;
    }

    return candidates[0].entry.word;
}

// returns whether any viable options were found
function getOptionsToConsider(wl: IndexedWordList, grid: GridState, node: FillNode): boolean {
    let viableEntries = node.entryCandidates.filter(x => x.isViable);
    if (viableEntries.length >= 20) return true;

    let entryMap = new Map<string, EntryCandidate>();
    node.entryCandidates.forEach(e => {
        entryMap.set(e.entry.word, e);
    });

    let fillOptions = indexedWordListLookup(wl, grid, node.fillWord)
        .filter(x => !entryMap.has(x.word));
    shuffleArray(fillOptions);
    fillOptions.sort((a, b) => b.qualityClass - a.qualityClass);

    if (fillOptions.length === 0) return false;

    for (let i = 0; i < 50; i++) {
        if (i >= fillOptions.length) break;
        let op = fillOptions[i];
        node.entryCandidates.push({
            entry: op,
            isViable: !hasStackUsedWord(Globals.fillStack, op.word),
        });
    }

    return true;
}

function isGridFilled(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && !sq.fillContent));
}

function hasStackUsedWord(stack: FillNode[], word: string): boolean {
    return !!stack.find(x => x.chosenWord === word);
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

        if (!newSq.constraintInitialized) {
            continue;
        }

        let letters = entryOptions.map(x => x.word[i]);
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
