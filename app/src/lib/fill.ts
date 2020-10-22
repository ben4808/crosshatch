import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { FillStatus } from "../models/FillStatus";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { QualityClass } from "../models/QualityClass";
import { WordDirection } from "../models/WordDirection";
import { generateConstraintInfoForSquares, gridToString } from "./grid";
import { deepClone, compareTuples, getWordAtSquare, getSquaresForWord, indexedWordListLookup, isBlackSquare, 
    otherDir, sum, getWordLength, getRandomWordsOfLength, sortedListInsert } from "./util";
import Globals from './windowService';

export function fillWord(): void {
    if ([FillStatus.Ready, FillStatus.Running, FillStatus.Paused].find(x => x === Globals.fillStatus) === undefined) {
        return;
    }

    let fillQueue = Globals.fillQueue!;
    let grid = Globals.gridState!;
    let visited = Globals.visitedGrids!;
    Globals.fillStatus = FillStatus.Running;

    if (visited.size > 0 && fillQueue.isEmpty()) {
        Globals.fillStatus = FillStatus.Failed;
        return;
    }

    let prevNode = fillQueue.isEmpty() ? makeNewNode(grid) : fillQueue.peek()!;

    let gridString = gridToString(grid);
    if (visited.has(gridString)) {
        invalidateNode(prevNode);
        fillWord();
        return;
    }
    
    let newNode = populateNewNode(grid, prevNode);
    if (!newNode) {
        invalidateNode(prevNode);
        fillWord();
        return;
    }
    Globals.gridState = newNode.startGrid;

    let viableCandidates = newNode.entryCandidates.filter(n => n.isViable);
    if(viableCandidates.length === 0) {
        invalidateNode(prevNode);
        fillWord();
        return;
    }

    newNode.chosenWord = chooseEntryFromCandidates(viableCandidates);
    insertEntryIntoGrid(grid, newNode.fillWord!, newNode.chosenWord);

    if (isGridFilled(grid)) {
        let newGridString = gridToString(grid);
        Globals.visitedGrids?.set(newGridString, true);
        sortedListInsert(Globals.completedGrids!, grid, calculateGridPriority);

        invalidateNode(prevNode);
        return;
    }

    fillQueue.insert(newNode, calculateGridPriority(grid));
}

function invalidateNode(node: FillNode) {
    let fillQueue = Globals.fillQueue!;
    let parent = node.parentNode;

    fillQueue.pop();
    if (parent) {
        let prevCandidate = parent.entryCandidates.find(x => x.word === parent!.chosenWord)!;
        prevCandidate.score = 0;
        prevCandidate.isViable = false;
        parent.chosenWord = "";
    }
}

function calculateGridPriority(grid: GridState): number {
    let isBad = false;
    let isUgly = false;
    grid.usedWords.forEach((_, word) => {
        let qualityClass = Globals.qualityClasses!.get(word)!;
        switch(qualityClass) {
            case QualityClass.Lively: { break; }
            case QualityClass.Normal: { break; }
            case QualityClass.Crosswordese: { isBad = true; break; }
            case QualityClass.Iffy: { isBad = true; break; }
            case QualityClass.NotAThing: { isUgly = true; break; }
        }
    });

    let score = 0;
    grid.usedWords.forEach((_, word) => {
        let qualityClass = Globals.qualityClasses!.get(word)!;
        switch(qualityClass) {
            case QualityClass.Lively: { score += isUgly ? 4 : isBad ? 1e3 + 4 : 1e6 + 2; break; }
            case QualityClass.Normal: { score += isUgly ? 3 : isBad ? 1e3 + 3 : 1e6 + 1; break; }
            case QualityClass.Crosswordese: { score += isUgly ? 2 : 1e3 + 2; break; }
            case QualityClass.Iffy: { score += isUgly ? 1 : 1e3 + 1; break; }
            case QualityClass.NotAThing: { break; }
        }
    });

    return score;
}

function makeNewNode(grid: GridState): FillNode {
    return {
        startGrid: deepClone(grid),
        fillWord: grid.words[0],
        entryCandidates: [],
        chosenWord: "",
    } as FillNode;
}

function populateNewNode(oldGrid: GridState, prevNode: FillNode): FillNode | undefined {
    let node = makeNewNode(oldGrid);
    let grid = node.startGrid;

    let fillWord = getMostConstrainedWord(prevNode);
    if (!fillWord) return undefined;
    node.fillWord = fillWord;
    
    let wordSquares = getSquaresForWord(grid, fillWord);
    let crosses = getUnfilledCrosses(grid, fillWord);

    if (!populateEntryCandidates(node)) return undefined;

    node.entryCandidates.forEach(candidate => {
        let foundBadCross = false;
        let totalCrossScores = 0;
        let lowestCrossScore = 1e8;
        crosses.forEach(cross => {
            if (foundBadCross) return;
            let squares = getSquaresForWord(grid, cross);
            let newSquares: GridSquare[] = deepClone(squares);

            let sqToReplace: GridSquare;
            let newVal: string;
            if (fillWord!.direction === WordDirection.Across) {
                sqToReplace = newSquares.find(nsq => nsq.row === wordSquares[0].row)!;
                newVal = candidate.word[sqToReplace.col - wordSquares[0].col];
            }
            else {
                sqToReplace = newSquares.find(nsq => nsq.col === wordSquares[0].col)!;
                newVal = candidate.word[sqToReplace.row - wordSquares[0].row];
            }
            sqToReplace.fillContent = newVal;

            if (sqToReplace.constraintInfo && !sqToReplace.constraintInfo.viableLetters.has(newVal)) {
                foundBadCross = true;
                return;
            }
            
            let newSum = generateConstraintInfoForSquares(grid, newSquares);
            if (newSum === 0) {
                foundBadCross = true;
                return;
            }

            let crossScore = getWordConstraintScore(newSquares);
            totalCrossScores += crossScore;
            if (crossScore < lowestCrossScore) lowestCrossScore = crossScore;
        });

        if (foundBadCross || totalCrossScores === 0) {
            candidate.score = 0;
            candidate.isViable = false;
            return;
        }

        candidate.score = calculateCandidateScore(candidate, totalCrossScores / crosses.length, lowestCrossScore);
    });

    // eslint-disable-next-line
    let viableCandidates = node.entryCandidates.filter(x => x.isViable);
    viableCandidates = viableCandidates.sort((a, b) => b.score! - a.score!);

    return node;
}

function calculateCandidateScore(candidate: EntryCandidate, averageCrossScore: number, lowestCrossScore: number): number {
    let rawScore = (averageCrossScore + (lowestCrossScore * 2)) / 3;

    let qualityClass = Globals.qualityClasses!.get(candidate.word);
    switch(qualityClass) {
        case QualityClass.Lively: return 1e6 + 2*rawScore;
        case QualityClass.Normal: return 1e6 + rawScore;
        case QualityClass.Crosswordese: return 1e3 + 2*rawScore;
        case QualityClass.Iffy: return 1e3 + rawScore;
    }

    return rawScore;
}

function chooseEntryFromCandidates(candidates: EntryCandidate[]): string {
    let topTier: EntryCandidate[];
    if (candidates.find(c => c.score! >= 1e6)) topTier = deepClone(candidates.filter(c => c.score! >= 1e6));
    else if (candidates.find(c => c.score! >= 1e3)) topTier = deepClone(candidates.filter(c => c.score! >= 1e3));
    else topTier = deepClone(candidates);

    let topScore = 0;
    topTier.forEach(c => {
        if (c.score! >= 1e6) c.score! -= 1e6;
        if (c.score! >= 1e3) c.score! -= 1e3;
        if (c.score! > topScore) topScore = c.score!;
    });
    topTier.forEach(c => {
        c.score! = Math.pow(c.score! / topScore, 3);
    });

    let sumOfScores = sum(candidates.map(c => c.score!));
    let roll = Math.random();
    let curTotal = 0;
    for (let i = 0; i < candidates.length; i++) {
        curTotal += candidates[i].score!;
        if (roll <= (curTotal / sumOfScores))
            return candidates[i].word;
    }

    return candidates[0].word;
}

// returns whether any viable options were found
function populateEntryCandidates(node: FillNode): boolean {
    let viableEntries = node.entryCandidates.filter(x => x.isViable);
    if (viableEntries.length >= 20) return true;

    let entryMap = new Map<string, EntryCandidate>();
    node.entryCandidates.forEach(candidate => {
        entryMap.set(candidate.word, candidate);
    });

    let wl = Globals.wordList!;
    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let fillOptions: string[];
    if (wordSquares.find(sq => sq.fillContent))
        fillOptions = indexedWordListLookup(wl, grid, node.fillWord!).filter(x => !entryMap.has(x) && !grid.usedWords.has(x));
    else
        fillOptions = getRandomWordsOfLength(wl, wordSquares.length).filter(x => !grid.usedWords.has(x));
    if (fillOptions.length === 0) return viableEntries.length > 0;

    fillOptions.sort((a, b) => Globals.qualityClasses!.get(b)! - Globals.qualityClasses!.get(a)!);

    for (let i = 0; i < 50; i++) {
        if (i >= fillOptions.length) break;
        let op = fillOptions[i];
        node.entryCandidates.push({
            word: op,
            isViable: true,
        });
    }

    return true;
}

function isGridEmpty(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && sq.fillContent));
}

function isGridFilled(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && !sq.fillContent));
}

function getMostConstrainedWord(prevNode: FillNode): GridWord | undefined {
    let grid = prevNode.startGrid;

    if (isGridEmpty(grid)) {
        return getLongestWord(grid);
    }

    let crosses = getUnfilledCrosses(grid, prevNode.fillWord);
    let words = crosses.length > 0 ? crosses : grid.words;
    
    let mostConstrainedKey = -1;
    let mostConstrainedScore = 1e8;
    for (let i = 0; i < words.length; i++) {
        let squares = getSquaresForWord(grid, words[i]);
        if (!squares.find(sq => sq.fillContent)) continue;

        var constraintScore = getWordConstraintScore(squares) / squares.length;
        if (constraintScore === 0) return undefined;
        if (constraintScore < mostConstrainedScore) {
            mostConstrainedKey = i;
            mostConstrainedScore = constraintScore;
        }
    }
    
    if (mostConstrainedKey === -1) return undefined;
    return words[mostConstrainedKey];
}

function getLongestWord(grid: GridState): GridWord {
    let ret = grid.words[0];
    let longest = getWordLength(ret);
    grid.words.forEach(w => {
        let l = getWordLength(w);
        if(l > longest) {
            ret = w;
            longest = l;
        }
    });

    return ret;
}

function getUnfilledCrosses(grid: GridState, prevWord: GridWord | undefined): GridWord[] {
    if (!prevWord) return [];
    let word = prevWord!;

    let squares = getSquaresForWord(grid, word);
    let crosses = squares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction)))
        .filter(w => w && getSquaresForWord(grid, w).find(x => !x.fillContent))
        .map(w => w!);
    return crosses.length > 0 ? crosses : [];
}

function getWordConstraintScore(squares: GridSquare[]): number {
    let total = 0;
    let foundZero = false;
    squares.forEach(sq => {
        if (sq.fillContent) return;
        let sum = sq.constraintInfo ? sq.constraintInfo.sumTotal : 1000;
        if (sum === 0) {
            foundZero = true;
            return;
        }
        total += Math.log2(sum);
    });

    return foundZero ? 0 : total / squares.length;
}

function insertEntryIntoGrid(grid: GridState, word: GridWord, newEntry: string) {
    let curPos = word.start;
    let curIndex = 0;
    let qualityClass = Globals.qualityClasses!.get(newEntry)!;
    while (!compareTuples(curPos, word.end)) {
        let sq = grid.squares[curPos[0]][curPos[1]];
        if (!sq.fillContent) {
            sq.fillContent = newEntry[curIndex];
            sq.qualityClass = qualityClass;
        }

        curPos = word.direction === WordDirection.Across ?
            [curPos[0], curPos[1]+1] : [curPos[0]+1, curPos[1]];
        curIndex++;
    }
    let sq = grid.squares[curPos[0]][curPos[1]];
        if (!sq.fillContent) {
            sq.fillContent = newEntry[curIndex];
            sq.qualityClass = qualityClass;
        }
}
