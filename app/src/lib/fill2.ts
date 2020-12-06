import { EntryCandidate } from '../models/EntryCandidate';
import { FillNode } from '../models/FillNode';
import { GridSquare } from '../models/GridSquare';
import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { QualityClass } from '../models/QualityClass';
import { Section } from '../models/Section';
import { SectionCandidate } from '../models/SectionCandidate';
import { WordDirection } from '../models/WordDirection';
import { generateConstraintInfoForSquares } from './grid';
import { PriorityQueue } from './priorityQueue';
import { deepClone, getSquaresForWord, wordLength, mapKeys, isWordFull, isUserFilled, 
    getWordAtSquare, otherDir, isWordEmpty, indexedWordListLookup, getRandomWordsOfLength } from './util';
import Globals from './windowService';

export function fillSectionWord(fillQueue: PriorityQueue<FillNode>, section: Section,
        sectionCandidate: SectionCandidate): GridState {
    let node = fillQueue.peek()!;
    let gridToReturn = node.startGrid;

    node.fillWord = selectWordToFill(node, section);

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
        //insertIntoCompletedGrids(node);
        chainNewNodeNotViable(prevNode);
        Globals.fillStatus = FillStatus.Success;
        return newGrid;
    }

    if (shouldMakeNewNode) {
        fillQueue.insert(node, calculateNodePriority(node));
    }
    
    return newGrid;
}

export function makeNewNode(grid: GridState, depth: number, isChainNode: boolean): FillNode {
    return {
        startGrid: deepClone(grid),
        endGrid: deepClone(grid),
        entryCandidates: [],
        depth: depth,
        isChainNode: isChainNode,
        backtracks: 0,
    } as FillNode;
}

function selectWordToFill(node: FillNode, section: Section): GridWord | undefined {
    function priorityScore(wordKey: string): number {
        let word = grid.words.get(wordKey)!;
        let squares = getSquaresForWord(grid, word);
        let constraintScore = getWordConstraintScore(squares);
        if (section.stackWords.has(wordKey)) {
            return 1000 * wordLength(word) - constraintScore;
        }
        else {
            return 100 * wordLength(word) - constraintScore;
        }
    }

    let grid = node.startGrid;
    let wordScores = new Map<string, number>();
    mapKeys(section.words).forEach(key => {
        wordScores.set(key, priorityScore(key));
    });
    let prioritizedWordList = mapKeys(section.words).sort((a, b) => wordScores.get(a)! - wordScores.get(b)!);

    for (let key of prioritizedWordList) {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        if (!isWordFull(squares))
            return word;
    }

    return undefined;
}

function getWordConstraintScore(squares: GridSquare[]): number {
    let total = 0;
    let openSquareCount = 0;
    let foundZero = false;
    squares.forEach(sq => {
        if (isUserFilled(sq)) return;
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
                sqToReplace.content = newVal;
    
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

function populateEntryCandidates(node: FillNode) {
    let viableEntries = getViableCandidates(node);
    if (viableEntries.length >= 20) return;

    let entryMap = new Map<string, EntryCandidate>();
    node.entryCandidates.forEach(candidate => {
        entryMap.set(candidate.word, candidate);
    });

    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let fillOptions: string[];
    if (!isWordEmpty(wordSquares))
        fillOptions = indexedWordListLookup(grid, node.fillWord!).filter(x => !entryMap.has(x) && !grid.usedWords.has(x));
    else
        fillOptions = getRandomWordsOfLength(wordSquares.length).filter(x => !grid.usedWords.has(x));
    if (fillOptions.length === 0) return;

    fillOptions.sort((a, b) => Globals.qualityClasses!.get(b)! - Globals.qualityClasses!.get(a)!);

    for (let i = 0; i < 50; i++) {
        if (i >= fillOptions.length) break;
        let op = fillOptions[i];
        node.entryCandidates.push({
            word: op,
            minCrossEntries: 0,
            sumOfCrosses: 0,
            isViable: true,
            hasBeenChained: false,
            wasChainFailure: false,
            constraintSquaresForCrosses: [],
        });
    }
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

function getViableCandidates(node: FillNode): EntryCandidate[] {
    if (node.isChainNode) {
        return node.entryCandidates.filter(ec => ec.isViable && !ec.wasChainFailure);
    }
    else {
        return node.entryCandidates.filter(ec => ec.isViable && !ec.hasBeenChained);
    }
}