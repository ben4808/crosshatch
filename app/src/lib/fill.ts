import { clearFill } from "../components/Grid/Grid";
import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { FillStatus } from "../models/FillStatus";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { QualityClass } from "../models/QualityClass";
import { WordDirection } from "../models/WordDirection";
import { generateConstraintInfoForSquares } from "./grid";
import { deepClone, compareTuples, getWordAtSquare, getSquaresForWord, indexedWordListLookup, isBlackSquare, 
    otherDir, sum, getWordLength, getRandomWordsOfLength, isWordEmpty, isWordFull } from "./util";
import Globals from './windowService';

export function fillWord(): GridState {
    let fillQueue = Globals.fillQueue!;
    let grid = Globals.gridState!;

    if ([FillStatus.Ready, FillStatus.Running, FillStatus.Paused].find(x => x === Globals.fillStatus) === undefined) {
        return grid;
    }

    Globals.fillStatus = FillStatus.Running;

    if (Globals.isFirstFillCall) {
        let firstNode = makeNewNode(grid, 0);

        firstNode.fillWord = getMostConstrainedWord(firstNode);
        // either an unfillable word or puzzle completed
        if (!firstNode.fillWord) return grid;

        fillQueue.insert(firstNode, calculateNodePriority(firstNode));
    }

    if (!Globals.isFirstFillCall && fillQueue.isEmpty()) {
        Globals.fillStatus = FillStatus.Failed;
        clearFill(grid);
        return grid;
    }
    Globals.isFirstFillCall = false;

    let prevNode: FillNode;
    let node: FillNode;
    let newGrid: GridState;

    if (Globals.currentChainNode) {
        prevNode = Globals.currentChainNode;
        node = makeNewNode(prevNode.endGrid, prevNode.depth + 1);
        newGrid = node.endGrid;

        node.fillWord = getMostConstrainedWord(node);
        // either an unfillable word or puzzle completed
        if (!node.fillWord) return grid;
    }
    else {
        prevNode = fillQueue.peek()!;
        node = prevNode;
        newGrid = node.endGrid;
    }

    populateAndScoreEntryCandidates(node);

    let viableCandidates = node.entryCandidates.filter(n => n.isViable && !n.isProcessed);
    if(viableCandidates.length === 0) {
        if (Globals.currentChainNode) {
            endNodeChain(prevNode);
        }
        else {
            fillQueue.pop();
        }
        
        return fillWord();
    }

    node.chosenEntry = chooseEntryFromCandidates(viableCandidates);
    insertEntryIntoGrid(newGrid, node.fillWord!, node.chosenEntry.word);
    newGrid.usedWords.set(node.chosenEntry.word, true);

    if (isGridFilled(newGrid)) {
        insertIntoCompletedGrids(node);
        if (Globals.currentChainNode) {
            endNodeChain(prevNode);
        }
        Globals.fillStatus = FillStatus.Success;
        return newGrid;
    }

    if (Globals.currentChainNode) {
        fillQueue.insert(node, calculateNodePriority(node));
    }
    
    Globals.currentChainNode = node;
    return newGrid;
}

function endNodeChain(prevNode: FillNode) {
    Globals.currentChainNode = undefined;

    let prevCandidate = prevNode.chosenEntry!;
    prevCandidate.score = 0;
    prevCandidate.isViable = false;
    prevNode.chosenEntry = undefined;
    prevNode.endGrid = deepClone(prevNode.startGrid);

    let curBaseNode = Globals.fillQueue?.peek()!;
    // in case we just killed it
    if (curBaseNode.chosenEntry) {
        curBaseNode.chosenEntry.isProcessed = true;
        curBaseNode.chosenEntry = undefined;
        curBaseNode.endGrid = deepClone(curBaseNode.startGrid);
    }
}

function calculateNodePriority(node: FillNode): number {
    let grid = node.endGrid;
    let wordScore = 0;
    grid.usedWords.forEach((_, word) => {
        let qualityClass = Globals.qualityClasses!.get(word)!;
        switch(qualityClass) {
            case QualityClass.Lively: { wordScore += 10; break; }
            case QualityClass.Normal: { wordScore += 7; break; }
            case QualityClass.Crosswordese: { wordScore += 2; break; }
            case QualityClass.Iffy: { wordScore += 1; break; }
            case QualityClass.NotAThing: { break; }
        }
    });

    let depthScore = (10000 - node.depth) * 10000;

    return wordScore + depthScore;
}

function makeNewNode(grid: GridState, depth: number): FillNode {
    return {
        startGrid: deepClone(grid),
        endGrid: deepClone(grid),
        entryCandidates: [],
        depth: depth,
        processedCount: 0,
    } as FillNode;
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

function chooseEntryFromCandidates(candidates: EntryCandidate[]): EntryCandidate {
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

    let sumOfScores = sum(topTier.map(c => c.score!));
    let roll = Math.random();
    let curTotal = 0;
    for (let i = 0; i < topTier.length; i++) {
        curTotal += topTier[i].score!;
        if (roll <= (curTotal / sumOfScores))
            return candidates.find(c => c.word === topTier[i].word)!;
    }

    return candidates.find(c => c.word === topTier[0].word)!;
}

// returns whether any viable options were found
function populateEntryCandidates(node: FillNode): boolean {
    let viableEntries = node.entryCandidates.filter(x => x.isViable && !x.isProcessed);
    if (viableEntries.length >= 20) return true;

    let entryMap = new Map<string, EntryCandidate>();
    node.entryCandidates.forEach(candidate => {
        entryMap.set(candidate.word, candidate);
    });

    let wl = Globals.wordList!;
    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let fillOptions: string[];
    if (!isWordEmpty(wordSquares))
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
            isProcessed: false,
        });
    }

    return true;
}

function populateAndScoreEntryCandidates(node: FillNode): boolean {
    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let crosses = getUnfilledCrosses(grid, node.fillWord!);

    let oldLength = node.entryCandidates.length;
    while (true) {
        populateEntryCandidates(node);
        if (node.entryCandidates.length === oldLength) break;
        oldLength = node.entryCandidates.length;

        node.entryCandidates.forEach(candidate => {
            if (!candidate.isViable) return;

            if (crosses.length === 0) {
                candidate.score = calculateCandidateScore(candidate, 1, 1);
                return;
            }
    
            let foundBadCross = false;
            let totalCrossScores = 0;
            let lowestCrossScore = 1e8;
            crosses.forEach(cross => {
                if (foundBadCross) return;
                let squares = getSquaresForWord(grid, cross);
                let newSquares: GridSquare[] = deepClone(squares);
    
                let sqToReplace: GridSquare;
                let newVal: string;
                if (node.fillWord!.direction === WordDirection.Across) {
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
        let viableCandidates = node.entryCandidates.filter(x => x.isViable && !x.isProcessed);
        if (viableCandidates.length >= 10) break;
    }

    // eslint-disable-next-line
    let viableCandidates = node.entryCandidates.filter(x => x.isViable);
    viableCandidates = viableCandidates.sort((a, b) => b.score! - a.score!);

    return viableCandidates.length > 0;
}

function isGridEmpty(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && sq.fillContent));
}

function isGridFilled(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && !sq.fillContent));
}

function getMostConstrainedWord(prevNode: FillNode): GridWord | undefined {
    let grid = prevNode.endGrid;

    if (isGridEmpty(grid)) {
        return getLongestWord(grid);
    }

    let crosses = getUnfilledCrosses(grid, prevNode.fillWord);
    let words = crosses.length > 0 ? crosses : grid.words;
    
    let mostConstrainedKey = -1;
    let mostConstrainedScore = 1e8;
    for (let i = 0; i < words.length; i++) {
        let squares = getSquaresForWord(grid, words[i]);
        if (isWordEmpty(squares) || isWordFull(squares)) continue;

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
        .filter(w => w && !isWordFull(getSquaresForWord(grid, w)))
        .map(w => w!);
    return crosses.length > 0 ? crosses : [];
}

function getWordConstraintScore(squares: GridSquare[]): number {
    let total = 0;
    let openSquareCount = 0;
    let foundZero = false;
    squares.forEach(sq => {
        if (sq.fillContent) return;
        let sum = sq.constraintInfo ? sq.constraintInfo.sumTotal : 1000;
        if (sum === 0) {
            foundZero = true;
            return;
        }
        total += Math.log2(sum + 1);
        openSquareCount++;
    });

    return foundZero ? 0 : total / openSquareCount;
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

export function insertIntoCompletedGrids(node: FillNode) {
    let completedGrids = Globals.completedGrids!;
    let score = calculateNodePriority(node);
    let grid = node.endGrid;
    completedGrids.push([score, grid]);
    let i = completedGrids.length - 1;
    let item = completedGrids[i];
    while (i > 0 && completedGrids[i][0] > completedGrids[i-1][0]) {
        completedGrids[i] = completedGrids[i-1];
        i -= 1;
    }
    completedGrids[i] = item;
}