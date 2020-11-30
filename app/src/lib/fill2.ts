import { FillNode } from '../models/FillNode';
import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { Section } from '../models/Section';
import { SectionCandidate } from '../models/SectionCandidate';
import { PriorityQueue } from './priorityQueue';
import { deepClone } from './util';
import Globals from './windowService';

export function fillSectionWord(fillQueue: PriorityQueue<FillNode>, section: Section,
        sectionCandidate: SectionCandidate): GridState {
    let node = fillQueue.peek()!;
    let gridToReturn = node.startGrid;

    node.fillWord = selectWordToFill(node, section, sectionCandidate);

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

function selectWordToFill(node: FillNode, section: Section, sectionCandidate: SectionCandidate): GridWord | undefined {
    let grid = node.startGrid;
    let longestDir = section.longestDir;

    if (Globals.isFirstFillCall && isGridEmpty(grid)) {
        return getLongestWord(grid);
    }

    let crosses: GridWord[];
    let gridEmpty = false;
    if (node.parent) {
        crosses = getUnfilledCrosses(grid, node.parent.fillWord);
    } 
    else {
        crosses = [];
        gridEmpty = isGridEmpty(grid);
    }
    let words = crosses.length > 0 ? crosses : grid.words;

    if (crosses.length === 0 && node.parent && node.isChainNode)
        node.isStartOfSection = true;
    
    let mostConstrainedKey = -1;
    let mostConstrainedScore = 1e8;
    for (let i = 0; i < words.length; i++) {
        let squares = getSquaresForWord(grid, words[i]);
        if ((!gridEmpty && isWordEmpty(squares)) || isWordFull(squares)) continue;

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