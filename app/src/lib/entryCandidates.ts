import { ContentType } from "../models/ContentType";
import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridWord } from "../models/GridWord";
import { getAllCrosses, getEligibleCandidates, getWordScore } from "./fill";
import { getLettersFromSquares } from "./grid";
import { constraintLetterCount, deepClone, fullAlphabet, getSquaresForWord, getWordAtSquare, isUserFilled, 
    isWordFull, letterMatrixToLetterList, otherDir, squareKey, wordKey } from "./util";
import { queryIndexedWordList } from "./wordList";
import Globals from './windowService';

// returns false if no viable candidates were found or iffy was set
export function populateAndScoreEntryCandidates(node: FillNode, isForManualFill: boolean): boolean {
    if (node.anchorSquareKeys.length === 0) {
        let word = node.fillWord!;
        let squares = getSquaresForWord(node.startGrid, word);
        let anchorInfo = populateFillWordAnchors(squares);
        node.anchorCombosLeft = anchorInfo.anchorCombosLeft;
        node.anchorSquareKeys = anchorInfo.anchorSquareKeys;
    }

    let eligibleCandidates = [] as EntryCandidate[];
    let performFullHeuristics = node.anchorCombosLeft.length <= 20;
    // cap anchor combos processed at 144
    for(let i = 0; i < 144; i++) {
        processAnchorCombo(node, isForManualFill, performFullHeuristics);
        eligibleCandidates = getEligibleCandidates(node);
        if (node.anchorCombosLeft.length === 0) break;
        if (eligibleCandidates.length > (isForManualFill ? 100 : 0)) break;
    }

    node.entryCandidates.sort((a, b) => b.score! - a.score!);
    return true;
}

export function populateNoHeuristicEntryCandidates(node: FillNode) {
    let word = node.fillWord!;
    let squares = deepClone(getSquaresForWord(node.startGrid, word)) as GridSquare[];
    squares.forEach(sq => {
        if (!isUserFilled(sq)) sq.content = undefined;
    });
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
            calculatedSquares: new Map<string, string[]>(),
        } as EntryCandidate);
    });
}

function populateFillWordAnchors(squares: GridSquare[], calculatedSquares?: Map<string, string[]>, ignoredSquares?: string[]):
    { anchorSquareKeys: string[], anchorCombosLeft: [string, string][] } {
    let anchorKeyCounts = [] as [string, number][];

    squares.forEach(sq => {
        let count = (ignoredSquares && ignoredSquares.includes(squareKey(sq))) ? 26 :
            (calculatedSquares && calculatedSquares.has(squareKey(sq))) ? 
            calculatedSquares!.get(squareKey(sq))!.length : constraintLetterCount(sq);
        if (count === 0) return; // don't anchor iffy

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
        .map(sq => (calculatedSquares && calculatedSquares.has(squareKey(sq))) ? 
        calculatedSquares!.get(squareKey(sq))! : sq.viableLetters || fullAlphabet);

    let combos = [] as [string, string][];
    for (var letter1 of constraintLetters[0]) {
        for (var letter2 of constraintLetters[1]) {
            combos.push([letter1, letter2]);
        }
    }

    combos.sort((a, b) => {
        return (letterFrequencies[a[0]] * letterFrequencies[a[1]]) - 
               (letterFrequencies[b[0]] * letterFrequencies[b[1]]);
    });

    return combos;
}

function processAnchorCombo(node: FillNode, isForManualFill: boolean, performFullHeuristics: boolean) {
    let grid = node.startGrid;
    let combo = node.anchorCombosLeft.pop()!;

    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let patternWithAnchor = getLettersFromSquares(wordSquares);
    node.anchorSquareKeys.forEach((sqKey, i) => {
        patternWithAnchor = insertLetterIntoPattern(patternWithAnchor, combo[i], wordSquares, sqKey);
    });
    if (isForManualFill && isWordFull(wordSquares)) {
        node.entryCandidates.push({
            word: patternWithAnchor,
            score: 1,
            isViable: true,
            hasBeenChained: false,
            wasChainFailure: false,
            calculatedSquares: new Map<string, string[]>(),
        } as EntryCandidate);
        return;
    }

    let entries = getFilteredEntries(wordSquares, patternWithAnchor, undefined, grid.usedWords);
    entries.forEach(entry => {
        let isViable = true;
        let distillIndex = 1;
        let crossKeys = new Map<string, boolean>();
        let crossCrossKeys = new Map<string, boolean>();
        let calculatedSquares = new Map<string, string[]>();
        let usedWords = new Map<string, boolean>();
        let iffyEntries = [] as string[];
        let iffyWordKeys = [] as string[];
        let crossCount = 0;

        wordSquares.forEach((sq, i) => {
            calculatedSquares.set(squareKey(sq), [entry[i]]);
        });

        getAllCrosses(grid, node.fillWord!).forEach(cross => {
            crossKeys.set(wordKey(cross), true);
            getAllCrosses(grid, cross).forEach(crossCross => {
                crossCrossKeys.set(wordKey(crossCross), true);
            });
        });

        while(true) {
            let wordKeys = distillIndex % 2 === 1  ? crossKeys : crossCrossKeys;
            let foundCountReduction = false;
    
            // eslint-disable-next-line
            wordKeys.forEach((_, wKey) => {
                if (!isViable) return;

                let word = grid.words.get(wKey)!;
                let squares = getSquaresForWord(grid, word);
                if (isWordFull(squares)) return;
                let wordPattern = getLettersFromSquares(squares);
                let filteredEntries = [] as string[];
                let anchorInfo = populateFillWordAnchors(squares, calculatedSquares);
                let anchorComboCount = anchorInfo.anchorCombosLeft.length;
                if (distillIndex > 1 && anchorComboCount > 120) return;

                anchorInfo.anchorCombosLeft.forEach(combo => {
                    let newPattern = wordPattern;
                    anchorInfo.anchorSquareKeys.forEach((sqKey, i) => {
                        newPattern = insertLetterIntoPattern(newPattern, combo[i], squares, sqKey);
                    });
                    filteredEntries = filteredEntries.concat(getFilteredEntries(squares, newPattern, calculatedSquares, usedWords));
                });
    
                if (filteredEntries.length === 0) {
                    if (Globals.maxIffyLength! === 0 || node.iffyWordKey || iffyWordKeys.length > 0 ||
                        !populateIffies(node, entry, iffyEntries, iffyWordKeys, word, squares, calculatedSquares, usedWords)) 
                        isViable = false;
                    return;
                }

                if (distillIndex === 1)
                    crossCount += filteredEntries.length;
    
                squares.forEach((sq, i) => {
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
            });

            if (!foundCountReduction) break;
            if (iffyEntries.length > 0) break;
            if (!isViable) break;
            if (distillIndex > 0 && !performFullHeuristics) break;

            distillIndex++;
        }

        if (!isViable) return;

        if (iffyEntries.length > 0) {
            iffyEntries.forEach((iffyEntry, i) => {
                node.entryCandidates.push({
                    word: entry,
                    score: calculateEntryCandidateScore(entry, crossCount, true),
                    isViable: isViable,
                    hasBeenChained: false,
                    wasChainFailure: false,
                    iffyEntry: iffyEntry,
                    iffyWordKey: iffyWordKeys[i],
                    calculatedSquares: calculatedSquares,
                } as EntryCandidate);
            });
            return;
        }

        node.entryCandidates.push({
            word: entry,
            score: calculateEntryCandidateScore(entry, crossCount, false),
            isViable: isViable,
            hasBeenChained: false,
            wasChainFailure: false,
            calculatedSquares: calculatedSquares,
        } as EntryCandidate);
    });
}

function populateIffies(node: FillNode, entry: string, iffyEntries: string[], iffyWordKeys: string[], word: GridWord, squares: GridSquare[], 
    calculatedSquares: Map<string, string[]>, usedWords: Map<string, boolean>): boolean {
    let grid = node.startGrid;
    let unviableCrosses = [] as string[];
    let wordPattern = getLettersFromSquares(squares);
    squares.forEach((sq, i) => {
        if (sq.contentType !== ContentType.Autofill) return;

        let sqKey = squareKey(sq);
        let ignoredSquares = [sqKey];
        let anchorInfo = populateFillWordAnchors(squares, calculatedSquares, ignoredSquares);
        let filteredEntries = [] as string[];
        anchorInfo.anchorCombosLeft.forEach(combo => {
            let newPattern = wordPattern;
            anchorInfo.anchorSquareKeys.forEach((sqKey, i) => {
                newPattern = insertLetterIntoPattern(newPattern, combo[i], squares, sqKey);
            });
            let newEntries = getFilteredEntries(squares, newPattern, calculatedSquares, usedWords, ignoredSquares);
            filteredEntries = filteredEntries.concat(newEntries);
        });

        if (filteredEntries.length > 0) {
            let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction))!;
            let crossSquares = deepClone(getSquaresForWord(grid, cross)) as GridSquare[];
            if (Globals.maxIffyLength! >= crossSquares.length) {
                let crossPattern = getLettersFromSquares(crossSquares);
                insertLetterIntoPattern(crossPattern, entry[i], crossSquares, sqKey);
                iffyEntries.push(crossPattern);
                iffyWordKeys.push(wordKey(cross));
            }
            else unviableCrosses.push(sqKey);
        }
        else unviableCrosses.push(sqKey);
    });

    if (unviableCrosses.length === 0 && Globals.maxIffyLength! >= wordPattern.length) {
        iffyEntries.push(wordPattern);
        iffyWordKeys.push(wordKey(word));
    }

    return iffyWordKeys.length > 0;
}

function getFilteredEntries(squares: GridSquare[], anchorPattern: string, calculatedSquares?: Map<string, string[]>,
    usedWords?: Map<string, boolean>, ignoredSquares?: string[]): string[] {
    let entries = [] as string[];
    broadenAnchorPatterns(squares, anchorPattern, calculatedSquares, ignoredSquares).forEach(pattern => {
        entries = entries.concat(queryIndexedWordList(pattern));
    });

    let filteredEntries = entries.filter(entry => {
        if (usedWords && usedWords.has(entry)) return false;

        for (let i = 0; i < squares.length; i++) {
            let sq = squares[i];
            let sqKey = squareKey(sq);
            if (ignoredSquares && ignoredSquares.includes(sqKey)) return true;
            
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

function broadenAnchorPatterns(squares: GridSquare[], anchorPattern: string, 
    calculatedSquares?: Map<string, string[]>, ignoredSquares?: string[]): string[] {
    let constraintCounts = squares.map((sq, i) => {
        if (ignoredSquares && ignoredSquares.includes(squareKey(sq))) return [i, fullAlphabet] as [number, string[]];
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

function calculateEntryCandidateScore(entry: string, crossCount: number, containsZeroSquare: boolean): number {
    let wordScore = getWordScore(entry);
    let ret = crossCount * wordScore * (containsZeroSquare ? 1 : 10);
    return ret;
}

function insertLetterIntoPattern(pattern: string, newLetter: string, squares: GridSquare[], sqKey: string): string {
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    return pattern.substring(0, i) + newLetter + pattern.substring(i+1);
}
