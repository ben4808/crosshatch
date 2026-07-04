import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { getAllCrosses, getEligibleCandidates, getWordScore } from "./fill";
import { getLettersFromSquares } from "./grid";
import { constraintLetterCount, fullAlphabet, getSquaresForWord,
    isWordFull, letterMatrixToLetterList, squareKey, sum, wordKey } from "./util";
import { queryIndexedWordList } from "./wordList";
import Globals from './windowService';

const MAX_ANCHOR_COMBOS = 40;
const MAX_CANDIDATES_MANUAL = 100;

export function populateAndScoreEntryCandidates(node: FillNode, isForManualFill: boolean): boolean {
    if (node.anchorSquareKeys.length === 0) {
        let word = node.fillWord!;
        let squares = getSquaresForWord(node.startGrid, word);
        let anchorInfo = populateFillWordAnchors(squares);
        node.anchorCombosLeft = anchorInfo.anchorCombosLeft;
        node.anchorSquareKeys = anchorInfo.anchorSquareKeys;
    }

    let eligibleCandidates = [] as EntryCandidate[];
    while(true) {
        processAnchorCombo(node, isForManualFill);
        eligibleCandidates = getEligibleCandidates(node);
        if (node.anchorCombosLeft.length === 0) break;
        if (eligibleCandidates.length > (isForManualFill ? MAX_CANDIDATES_MANUAL : 0)) break;
    }

    node.entryCandidates.sort((a, b) => b.score! - a.score!);
    return true;
}

export function populateNoHeuristicEntryCandidates(node: FillNode, dontRecalc?: boolean) {
    if (dontRecalc === undefined) dontRecalc = false;
    if (node.entryCandidates.length > 0 && dontRecalc) return;

    let word = node.fillWord!;
    let squares = getSquaresForWord(node.startGrid, word);
    let pattern = getLettersFromSquares(squares);
    let entries = queryIndexedWordList(pattern).sort((a, b) => Globals.qualityClasses!.get(b)! - Globals.qualityClasses!.get(a)!);

    node.entryCandidates = [];
    entries.forEach(entry => {
        node.entryCandidates.push({
            word: entry,
            score: getWordScore(entry),
            isViable: true,
            hasBeenChained: false,
            wasChainFailure: false,
            crossScore: 0,
            minCrossScore: 0,
        } as EntryCandidate);
    });
}

function populateFillWordAnchors(squares: GridSquare[], calculatedSquares?: Map<string, string[]>):
    { anchorSquareKeys: string[], anchorCombosLeft: [string, string][] } {
    let anchorKeyCounts = [] as [string, number][];

    squares.forEach(sq => {
        let count = (calculatedSquares && calculatedSquares.has(squareKey(sq))) ? 
            calculatedSquares!.get(squareKey(sq))!.length : constraintLetterCount(sq);
        if (count === 0) return;

        if (anchorKeyCounts.length < 2) {
            anchorKeyCounts.push([squareKey(sq), count]);
            anchorKeyCounts.sort((a, b) => a[1] - b[1]);
            return;
        }

        if (count < anchorKeyCounts[1][1]) {
            anchorKeyCounts[1] = [squareKey(sq), count];
            anchorKeyCounts.sort((a, b) => a[1] - b[1]);
        }
    });

    if (anchorKeyCounts.length < 2) {
        return {
            anchorSquareKeys: [],
            anchorCombosLeft: [],
        };
    }

    let anchorSquareKeys = [anchorKeyCounts[0][0], anchorKeyCounts[1][0]];
    let combos = generateAnchorCombos(squares, anchorSquareKeys, calculatedSquares);

    return {
        anchorSquareKeys: anchorSquareKeys,
        anchorCombosLeft: combos,
    };
}

const letterFrequencies = {
    "A": 8.2, "B": 1.5, "C": 2.8, "D": 4.3,
    "E": 13, "F": 2.2, "G": 2, "H": 6.1,
    "I": 7, "J": 0.15, "K": 0.77, "L": 4,
    "M": 2.4, "N": 6.7, "O": 7.5, "P": 1.9,
    "Q": 0.095, "R": 6, "S": 6.3, "T": 9.1,
    "U": 2.8, "V": 0.98, "W": 2.4, "X": 0.15,
    "Y": 2, "Z": 0.074,
} as any;

function generateAnchorCombos(squares: GridSquare[], anchorSquareKeys: string[], 
    calculatedSquares?: Map<string, string[]>): [string, string][] {
    let constraintLetters = anchorSquareKeys
        .map(sqKey => squares.find(sq => squareKey(sq) === sqKey)!)
        .map(sq => sq.content ? [sq.content!] : (calculatedSquares && calculatedSquares.has(squareKey(sq))) ? 
        calculatedSquares!.get(squareKey(sq))! : sq.viableLetters || fullAlphabet);

    let combos = [] as [string, string][];
    let comboScores = new Map<string, number>();
    for (var letter1 of constraintLetters[0]) {
        for (var letter2 of constraintLetters[1]) {
            combos.push([letter1, letter2]);
            comboScores.set(`[${letter1},${letter2}]`, (letterFrequencies[letter1] + letterFrequencies[letter2]) * Math.random());
        }
    }

    combos.sort((a, b) => {
        return comboScores.get(`[${a[0]},${a[1]}]`)! - comboScores.get(`[${b[0]},${b[1]}]`)!;
    });

    return combos.slice(0, MAX_ANCHOR_COMBOS);
}

function processAnchorCombo(node: FillNode, isForManualFill: boolean) {
    let grid = node.startGrid;
    let combo = node.anchorCombosLeft.pop()!;
    let fillWordKey = wordKey(node.fillWord!);
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let patternWithAnchor = getLettersFromSquares(wordSquares);
    node.anchorSquareKeys.forEach((sqKey, i) => {
        patternWithAnchor = insertLetterIntoPattern(patternWithAnchor, combo[i], wordSquares, sqKey);
    });
    if (isForManualFill && isWordFull(wordSquares)) {
        node.entryCandidates = [];
        node.entryCandidates.push({
            word: patternWithAnchor,
            score: 1,
            isViable: true,
            hasBeenChained: false,
            wasChainFailure: false,
            crossScore: 0,
            minCrossScore: 0,
        } as EntryCandidate);
        return;
    }

    let entries = getFilteredEntries(wordSquares, patternWithAnchor, undefined, grid.usedWords);
    let maxFilteredEntryCount = entries.length > 0 ? 100_000 / entries.length : 1;
    entries.forEach(entry => {
        processEntry(entry, maxFilteredEntryCount);
    });

    node.entryCandidates.forEach(ec => {
        ec.score = calculateEntryCandidateScore(node, ec);
    });

    function processEntry(entry: string, maxCount: number): boolean {
        let isViable = true;
        let distillIndex = 1;
        let calculatedSquares = new Map<string, string[]>();
        let crossScore = 0;
        let minCrossScore = 1e8;
        let usedWords = new Map(grid.usedWords);
        usedWords.set(entry, true);
        let batchKeys = new Map<string, boolean>();
        batchKeys.set(fillWordKey, true);
        let filledCrosses = new Map<string, boolean>();
        let filteredEntriesCount = 0;
        
        while(true) {
            let foundCountReduction = false;
            let nextBatchKeys = new Map<string, boolean>();
    
            // eslint-disable-next-line
            batchKeys.forEach((_, wKey) => {
                if (!isViable) return;
                if (distillIndex > 1 && filteredEntriesCount > maxCount) return;

                let word = grid.words.get(wKey)!;
                let wordSquares = getSquaresForWord(grid, word);
                if (distillIndex === 1) {
                    wordSquares.forEach((sq, i) => {
                        calculatedSquares.set(squareKey(sq), [entry[i]]);
                    });
                }

                let crosses = getAllCrosses(grid, word);
                crosses.forEach(cross => {
                    if (!isViable) return;
                    let crossKey = wordKey(cross);
                    if (nextBatchKeys.has(crossKey)) return;
                    if (crossKey === fillWordKey || filledCrosses.has(crossKey)) return;

                    let crossSquares = getSquaresForWord(grid, cross);
                    if(isWordFull(crossSquares)) return;
                    let crossPattern = getLettersFromSquares(crossSquares);
                    let filteredEntries = [] as string[];
                    let anchorInfo = populateFillWordAnchors(crossSquares, calculatedSquares);
                    if (anchorInfo.anchorCombosLeft.length > 20) {
                        filteredEntriesCount += 500;
                        crossScore += 300;
                        if (300 < minCrossScore) minCrossScore = 300;
                        return;
                    }

                    anchorInfo.anchorCombosLeft.forEach(combo => {
                        let newPattern = crossPattern;
                        anchorInfo.anchorSquareKeys.forEach((sqKey, i) => {
                            newPattern = insertLetterIntoPattern(newPattern, combo[i], crossSquares, sqKey);
                        });
                        filteredEntries.push(...getFilteredEntries(crossSquares, newPattern, calculatedSquares, usedWords));
                        if (distillIndex === 1 && anchorInfo.anchorCombosLeft.length === 1 && !newPattern.includes("-")) {
                            usedWords.set(newPattern, true);
                            filledCrosses.set(crossKey, true);
                        }
                    });
        
                    if (filteredEntries.length === 0) {
                        isViable = false;
                        return;
                    }
                    filteredEntriesCount += filteredEntries.length;

                    if (distillIndex === 1) {
                        let score = sum(filteredEntries.map(fe => getWordScore(fe)));
                        crossScore += score;
                        if (score < minCrossScore) minCrossScore = score;
                    }
        
                    crossSquares.forEach((sq, i) => {
                        let newMatrix = Array<boolean>(26).fill(false);
                        filteredEntries.forEach(entry => {
                            newMatrix[entry[i].charCodeAt(0) - 65] = true;
                        });
                        let letters = letterMatrixToLetterList(newMatrix);

                        let existingCounts = calculatedSquares.get(squareKey(sq))!;
                        if (!existingCounts || existingCounts.length > letters.length)
                            foundCountReduction = true;

                        calculatedSquares.set(squareKey(sq), letters);
                    });

                    nextBatchKeys.set(crossKey, true);
                });
            });

            if (!foundCountReduction) break;
            if (!isViable) break;

            batchKeys = nextBatchKeys;
            distillIndex++;
        }

        if (!isViable) return false;

        if (crossScore > node.topCrossScore) node.topCrossScore = crossScore;
        if (minCrossScore > node.topMinCrossScore) node.topMinCrossScore = minCrossScore;

        node.entryCandidates.push({
            word: entry,
            score: -1,
            isViable: isViable,
            hasBeenChained: false,
            wasChainFailure: false,
            crossScore: crossScore,
            minCrossScore: minCrossScore,
        } as EntryCandidate);

        return true;
    }
}

function getFilteredEntries(squares: GridSquare[], anchorPattern: string, calculatedSquares?: Map<string, string[]>,
    usedWords?: Map<string, boolean>): string[] {
    let entries = [] as string[];
    broadenAnchorPatterns(squares, anchorPattern, calculatedSquares).forEach(pattern => {
        entries.push(...queryIndexedWordList(pattern));
    });

    let filteredEntries = entries.filter(entry => {
        if (usedWords && usedWords.has(entry)) return false;

        for (let i = 0; i < squares.length; i++) {
            let sq = squares[i];
            let sqKey = squareKey(sq);
            
            if (calculatedSquares && calculatedSquares.has(sqKey) && !calculatedSquares.get(sqKey)!.includes(entry[i])) {
                return false;
            }
            else if (sq.viableLetters && !sq.viableLetters.includes(entry[i])) {
                return false;
            }
        }
        
        return true;
    });

    return filteredEntries;
}

function broadenAnchorPatterns(squares: GridSquare[], anchorPattern: string, calculatedSquares?: Map<string, string[]>): string[] {
    let constraintCounts = squares.map((sq, i) => {
        if (anchorPattern[i] !== "-") return [i, [anchorPattern[i]]] as [number, string[]];
        if (calculatedSquares && calculatedSquares.has(squareKey(sq))) {
            return [i, calculatedSquares.get(squareKey(sq))!] as [number, string[]];
        }
        return [i, sq.viableLetters || fullAlphabet] as [number, string[]];
    })
    .filter(x => x[1].length > 0).sort((a, b) => b[1].length - a[1].length);

    let curPatterns = [anchorPattern];
    while(constraintCounts.length > 0 && curPatterns.length < 12) {
        let lowestCount = constraintCounts.pop()!;
        if (lowestCount[1].length >= 6) 
            return curPatterns;

        let index = lowestCount[0];
        let viableLetters = lowestCount[1];
        let newCurPatterns = [] as string[];
        // eslint-disable-next-line
        viableLetters.forEach(ltr => {
            curPatterns.forEach(pattern => {
                newCurPatterns.push(pattern.substring(0, index) + ltr + pattern.substring(index+1));
            });
        });
        curPatterns = newCurPatterns;
    }

    return curPatterns;
}

function calculateEntryCandidateScore(node: FillNode, ec: EntryCandidate): number {
    let wordScore = getWordScore(ec.word);
    let crossScore = node.topCrossScore > 0 ? ec.crossScore / node.topCrossScore : 1;
    let minCrossScore = node.topMinCrossScore > 0 ? ec.minCrossScore / node.topMinCrossScore : 1;
    return (crossScore + minCrossScore) * wordScore * 100;
}

function insertLetterIntoPattern(pattern: string, newLetter: string, squares: GridSquare[], sqKey: string): string {
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    return pattern.substring(0, i) + newLetter + pattern.substring(i+1);
}
