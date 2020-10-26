import { clearFill } from "../components/Grid/Grid";
import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { FillStatus } from "../models/FillStatus";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { QualityClass } from "../models/QualityClass";
import { WordDirection } from "../models/WordDirection";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { deepClone, compareTuples, getWordAtSquare, getSquaresForWord, indexedWordListLookup, isBlackSquare, 
    otherDir, sum, getWordLength, getRandomWordsOfLength, isWordEmpty, isWordFull, doesWordContainSquare } from "./util";
import Globals from './windowService';

export function fillWord(): GridState {
    let fillQueue = Globals.fillQueue!;
    let grid = Globals.gridState!;

    if ([FillStatus.Ready, FillStatus.Running, FillStatus.Paused].find(x => x === Globals.fillStatus) === undefined) {
        return grid;
    }

    Globals.fillStatus = FillStatus.Running;

    if (Globals.isFirstFillCall) {
        let firstNode = makeNewNode(grid, 0, false);

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

    let prevNode = fillQueue.peek()!;
    let node: FillNode;
    let newGrid: GridState;
    let shouldMakeNewNode = !!prevNode.chosenEntry;

    if (prevNode.isChainNode) {
        if (shouldMakeNewNode) {
            node = makeNewNode(prevNode.endGrid, prevNode.depth + 1, true);
            newGrid = node.endGrid;
            node.parent = prevNode;

            node.fillWord = getMostConstrainedWord(node);
            // either an unfillable word or puzzle completed
            if (!node.fillWord) return grid;
        }
        else {
            node = prevNode;
            newGrid = node.endGrid;

            if (node.backtracks >= (node.isStartOfSection ? 20 : 3)) {
                chainNodeMaxBacktracks(node);
                node.isChainNode = false;
                fillQueue.pop();
                fillQueue.insert(node, calculateNodePriority(node));
                return fillWord();
            }
        }
    }
    else {
        if (prevNode.processStopsUpdated) {
            prevNode.processStopsUpdated = false;
            fillQueue.pop();
            fillQueue.insert(prevNode, calculateNodePriority(prevNode));
            return fillWord();
        }

        if (shouldMakeNewNode) {
            node = makeNewNode(prevNode.endGrid, prevNode.depth + 1, true);
            newGrid = node.endGrid;
            node.parent = prevNode;

            node.fillWord = getMostConstrainedWord(node);
            // either an unfillable word or puzzle completed
            if (!node.fillWord) return grid;
        }
        else {
            node = prevNode;
            newGrid = node.endGrid;
        }
    }

    populateAndScoreEntryCandidates(node);

    let viableCandidates = getViableCandidates(node);
    if(viableCandidates.length === 0) {
        if (prevNode.isChainNode) {
            if (shouldMakeNewNode) {
                chainNewNodeNotViable(prevNode);
                fillQueue.pop();
                fillQueue.insert(prevNode, calculateNodePriority(prevNode));
            }
            else {
                chainNodeMaxBacktracks(node);
                fillQueue.pop();
            }
        }
        else {
            fillQueue.pop();
        }
        
        return fillWord();
    }

    node.chosenEntry = chooseEntryFromCandidates(viableCandidates);
    insertEntryIntoGrid(newGrid, node.fillWord!, node.chosenEntry);

    if (isGridFilled(newGrid)) {
        insertIntoCompletedGrids(node);
        chainNewNodeNotViable(prevNode);
        Globals.fillStatus = FillStatus.Success;
        return newGrid;
    }

    if (shouldMakeNewNode) {
        fillQueue.insert(node, calculateNodePriority(node));
    }
    
    return newGrid;
}

function chainNewNodeNotViable(prevNode: FillNode) {
    let prevCandidate = prevNode.chosenEntry!;
    prevCandidate.score = 0;
    prevCandidate.isViable = false;

    if (prevNode.isChainNode) {
        prevCandidate.wasChainFailure = true;
        prevNode.backtracks++;
    }
    else {
        prevCandidate.hasBeenChained = true;
        checkForProcessStops(prevNode, prevCandidate);
    }

    prevNode.chosenEntry = undefined;
    prevNode.endGrid = deepClone(prevNode.startGrid);
}

function chainNodeMaxBacktracks(node: FillNode) {
    if (!node.parent) return;

    let parent = node.parent;
    let prevCandidate = parent.chosenEntry!;
    if (parent.isChainNode) {
        prevCandidate.wasChainFailure = true;
        parent.backtracks++;
    }
    else {
        prevCandidate.hasBeenChained = true;
        checkForProcessStops(parent, prevCandidate);
    }

    parent.chosenEntry = undefined;
    parent.endGrid = deepClone(parent.startGrid);
}

function getViableCandidates(node: FillNode): EntryCandidate[] {
    if (node.isChainNode) {
        return node.entryCandidates.filter(ec => ec.isViable && !ec.wasChainFailure);
    }
    else {
        return node.entryCandidates.filter(ec => ec.isViable && !ec.hasBeenChained);
    }
}

function checkForProcessStops(node: FillNode, chosenEntry: EntryCandidate) {
    let qualityClasses = Globals.qualityClasses!;
    let chosenQc = qualityClasses.get(chosenEntry.word);

    let goodChained = 0, goodTotal = 0;
    let badChained = 0, badTotal = 0;
    let uglyChained = 0, uglyTotal = 0;
    let chainedBeforeStop = 20;
    node.entryCandidates.forEach(ec => {
    if ([QualityClass.Lively, QualityClass.Normal].find(x => qualityClasses.get(ec.word)!)) { goodTotal++; if(ec.hasBeenChained) goodChained++; }
    if ([QualityClass.Crosswordese, QualityClass.Iffy].find(x => qualityClasses.get(ec.word)!)) { badTotal++; if(ec.hasBeenChained) badChained++; }
    if ([QualityClass.NotAThing].find(x => qualityClasses.get(ec.word)!)) { uglyTotal++; if(ec.hasBeenChained) uglyChained++; }
    });

    if ([QualityClass.Lively, QualityClass.Normal].find(x => x === chosenQc) && goodChained > 0 &&
        (goodChained % chainedBeforeStop === 0 || goodChained === goodTotal))
        { node.processStops++; node.processStopsUpdated = true; }
    if ([QualityClass.Crosswordese, QualityClass.Iffy].find(x => x === chosenQc) && badChained > 0 &&
        (badChained % chainedBeforeStop === 0 || badChained === badTotal))
        { node.processStops++; node.processStopsUpdated = true; }
    if ([QualityClass.NotAThing].find(x => x === chosenQc) && uglyChained > 0 &&
        (uglyChained % chainedBeforeStop === 0 || uglyChained === uglyTotal))
        { node.processStops++; node.processStopsUpdated = true; }
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

    let situationScore: number;
    if (node.isChainNode) {
        situationScore = 1e8 + 10000*node.depth;
    }
    else {
        situationScore = (10000 - node.depth - 5*node.processStops) * 10000;
    }

    return wordScore + situationScore;
}

function makeNewNode(grid: GridState, depth: number, isChainNode: boolean): FillNode {
    return {
        startGrid: deepClone(grid),
        endGrid: deepClone(grid),
        entryCandidates: [],
        depth: depth,
        processedCount: 0,
        processStops: 0,
        processStopsUpdated: false,
        isChainNode: isChainNode,
        backtracks: 0,
        isStartOfSection: false,
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
    let viableEntries = getViableCandidates(node);
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
            hasBeenChained: false,
            wasChainFailure: false,
            constraintSquaresForCrosses: [],
        });
    }

    return true;
}

function populateAndScoreEntryCandidates(node: FillNode) {
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
                sqToReplace.constraintInfo = {
                    sumTotal: 1,
                    viableLetters: new Map<string, number>([[sqToReplace.fillContent, 1]]),
                };
    
                if (sqToReplace.constraintInfo && !sqToReplace.constraintInfo.viableLetters.has(newVal)) {
                    foundBadCross = true;
                    return;
                }
                
                let populatedSquares = generateConstraintInfoForSquares(grid, newSquares);
                if (populatedSquares === undefined) {
                    foundBadCross = true;
                    return;
                }
                candidate.constraintSquaresForCrosses.push(populatedSquares);
    
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
        let viableCandidates = getViableCandidates(node);
        if (viableCandidates.length >= 10) break;
    }

    // eslint-disable-next-line
    let viableCandidates = node.entryCandidates.filter(x => x.isViable);
    viableCandidates = viableCandidates.sort((a, b) => b.score! - a.score!);
}

function isGridEmpty(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && sq.fillContent));
}

function isGridFilled(grid: GridState): boolean {
    return !grid.squares.find(row => row.find(sq => !isBlackSquare(sq) && !sq.fillContent));
}

function getMostConstrainedWord(node: FillNode): GridWord | undefined {
    let grid = node.startGrid;

    if (Globals.isFirstFillCall && isGridEmpty(grid)) {
        return getLongestWord(grid);
    }

    let crosses = node.parent ? getUnfilledCrosses(grid, node.parent.fillWord) : [];
    let words = crosses.length > 0 ? crosses : grid.words;

    if (crosses.length === 0 && node.parent && node.isChainNode)
        node.isStartOfSection = true;
    
    let mostConstrainedKey = -1;
    let mostConstrainedScore = 1e8;
    for (let i = 0; i < words.length; i++) {
        let squares = getSquaresForWord(grid, words[i]);
        if ((crosses.length > 0 && isWordEmpty(squares)) || isWordFull(squares)) continue;

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

function insertEntryIntoGrid(grid: GridState, word: GridWord, newEntry: EntryCandidate) {
    function processSquare() {
        if (crossIndex < crosses.length) {
            let cross = crosses[crossIndex];
            if (doesWordContainSquare(cross, curPos[0], curPos[1])) {
                let crossSquares = getSquaresForWord(grid, cross);
                let newCrossSquares = newEntry.constraintSquaresForCrosses[crossIndex];
                if (newCrossSquares.length > 0) {
                    crossSquares.forEach((sq, i) => {
                        grid.squares[sq.row][sq.col] = newEntry.constraintSquaresForCrosses[crossIndex][i];
                    });
                }

                let letters = getLettersFromSquares(newCrossSquares);
                if (!letters.includes(".")) grid.usedWords.set(letters, true);

                crossIndex++;
            }
        }
        
        let sq = grid.squares[curPos[0]][curPos[1]];
        sq.fillContent = newEntry.word[wordIndex];
        sq.qualityClass = qualityClass;
        sq.constraintInfo = {
            sumTotal: 1,
            viableLetters: new Map<string, number>([[sq.fillContent, 1]]),
        }
        wordIndex++;
    }

    let curPos = word.start;
    let wordIndex = 0;
    let crossIndex = 0;
    let qualityClass = Globals.qualityClasses!.get(newEntry.word)!;
    let crosses = getUnfilledCrosses(grid, word);
    while (!compareTuples(curPos, word.end)) {
        processSquare();

        curPos = word.direction === WordDirection.Across ?
            [curPos[0], curPos[1]+1] : [curPos[0]+1, curPos[1]];
    }
    processSquare();

    grid.usedWords.set(newEntry.word, true);
}

function insertIntoCompletedGrids(node: FillNode) {
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