import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { getAllCrosses, getEligibleCandidates, getWordScore } from "./fill";
import { getLettersFromSquares } from "./grid";
import { constraintLetterCount, deepClone, fullAlphabet, getSquaresForWord, getWordAtSquare,
    isWordFull, letterMatrixToLetterList, otherDir, squareKey, sum, wordKey, wordLength } from "./util";
import { queryIndexedWordList } from "./wordList";
import Globals from './windowService';

// returns false if no viable candidates were found or iffy was set
export function populateAndScoreEntryCandidates(node: FillNode, isForManualFill: boolean): boolean {
    if (isForManualFill && wordKey(node.fillWord!) === node.iffyWordKey) {
        populateNoHeuristicEntryCandidates(node);
        return true;
    }

    if (node.anchorSquareKeys.length === 0) {
        let word = node.fillWord!;
        let squares = getSquaresForWord(node.startGrid, word);
        let anchorInfo = populateFillWordAnchors(squares);
        node.anchorCombosLeft = anchorInfo.anchorCombosLeft;
        node.anchorSquareKeys = anchorInfo.anchorSquareKeys;
    }

    let eligibleCandidates = [] as EntryCandidate[];
    let heuristicsLevel = node.anchorCombosLeft.length > 100 ? 1 : node.anchorCombosLeft.length > 25 ? 2 : 3;

    while(true) {
        processAnchorCombo(node, isForManualFill, heuristicsLevel);
        eligibleCandidates = getEligibleCandidates(node);
        if (node.anchorCombosLeft.length === 0) break;
        if (eligibleCandidates.filter(ec => !ec.iffyWordKey).length > (isForManualFill ? 100 : 0)) break;
    }

    node.entryCandidates.sort((a, b) => b.score! - a.score!);
    return true;
}

export function populateNoHeuristicEntryCandidates(node: FillNode, dontRecalc?: boolean) {
    if (dontRecalc === undefined) dontRecalc = false;
    if (node.entryCandidates.length > 0 && dontRecalc) return;

    let word = node.fillWord!;
    let squares = deepClone(getSquaresForWord(node.startGrid, word)) as GridSquare[];
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
            comboScores.set(`[${letter1},${letter2}]`, letterFrequencies[letter1] * letterFrequencies[letter2] * Math.random());
        }
    }

    combos.sort((a, b) => {
        return comboScores.get(`[${a[0]},${a[1]}]`)! - comboScores.get(`[${b[0]},${b[1]}]`)!;
    });

    return combos;
}

function processAnchorCombo(node: FillNode, isForManualFill: boolean, heuristicsLevel: number) {
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

    let crossKeys = new Map<string, boolean>();
    let crossCrossKeys = new Map<string, boolean>();
    getAllCrosses(grid, node.fillWord!).forEach(cross => {
        crossKeys.set(wordKey(cross), true);
        getAllCrosses(grid, cross).forEach(crossCross => {
            if (wordKey(crossCross) !== fillWordKey)
                crossCrossKeys.set(wordKey(crossCross), true);
        });
    });

    if (wordSquares.length < 6 || (wordSquares.length < 7 && crossKeys.size + crossCrossKeys.size <= 15))
        heuristicsLevel = 3;
    if (heuristicsLevel === 3 && wordSquares.length > 8 && crossKeys.size + crossCrossKeys.size > 20)
        heuristicsLevel = 2;

    let iffyWordKey = isForManualFill ? Globals.manualIffyKey : node.iffyWordKey;
    wordSquares.forEach(sq => {
        let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(node.fillWord!.direction))!;
        if (!cross) return;
        let crossSquares = getSquaresForWord(grid, cross);
        if (wordKey(cross) === iffyWordKey) {
            crossSquares.forEach(csq => {
                if (!csq.content)
                    csq.viableLetters = deepClone(fullAlphabet);
            });
        }
        if (isWordFull(crossSquares))
            crossKeys.delete(wordKey(cross));
    });
    if (crossKeys.size === 0) {
        populateNoHeuristicEntryCandidates(node, true);
        return;
    }

    let entries = getFilteredEntries(wordSquares, patternWithAnchor, undefined, grid.usedWords);

    entries.forEach(entry => {
        let success = processEntry(entry, iffyWordKey);

        if (!success && !node.iffyWordKey && heuristicsLevel === 3 && Globals.maxIffyLength! > 0) {
            crossKeys.forEach((_, ck) => {
                let cross = grid.words.get(ck)!;
                if (wordLength(cross) > Globals.maxIffyLength!) return;
                processEntry(entry, ck);
            });
        }
    });

    node.entryCandidates.forEach(ec => {
        if(ec.score === -1) {
            ec.score = calculateEntryCandidateScore(node, ec);
        }
    });

    function processEntry(entry: string, iffyWordKey?: string): boolean {
        let isViable = true;
        let distillIndex = 1;
        let calculatedSquares = new Map<string, string[]>();
        let crossScore = 0;
        let minCrossScore = 1e8;
        let usedWords = deepClone(grid.usedWords) as Map<string, boolean>;
        usedWords.set(entry, true);

        wordSquares.forEach((sq, i) => {
            let sqKey = squareKey(sq);
            calculatedSquares.set(sqKey, [entry[i]]);

            let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(node.fillWord!.direction))!;
            if (!cross) {
                calculatedSquares.set(sqKey, deepClone(fullAlphabet));
                return;
            }

            let crossSquares = getSquaresForWord(grid, cross);
            let pattern = getLettersFromSquares(crossSquares);
            insertLetterIntoPattern(pattern, entry[i], crossSquares, sqKey);
            if (!pattern.includes("-"))
                usedWords.set(pattern, true);

            if (wordKey(cross) === iffyWordKey) {
                crossSquares.forEach(csq => {
                    if (!csq.content)
                        csq.viableLetters = deepClone(fullAlphabet);
                });
            }
        });

        while(true) {
            let wordKeys = distillIndex % 2 === 1  ? crossKeys : crossCrossKeys;
            let foundCountReduction = false;
    
            // eslint-disable-next-line
            wordKeys.forEach((_, wKey) => {
                if (!isViable) return;
                if (wKey === fillWordKey) return;
                if (wKey === iffyWordKey) return;

                let word = grid.words.get(wKey)!;
                let squares = getSquaresForWord(grid, word);
                if (isWordFull(squares)) return;
                if (distillIndex === 1 && squares.filter(sq => !calculatedSquares.has(squareKey(sq)) && 
                    (!sq.viableLetters || sq.viableLetters.length < 20)).length === 0) return;
                let wordPattern = getLettersFromSquares(squares);
                let filteredEntries = [] as string[];
                let anchorInfo = populateFillWordAnchors(squares, calculatedSquares);
                let anchorComboCount = anchorInfo.anchorCombosLeft.length;
                if (distillIndex > 1 && anchorComboCount > 20) return;

                anchorInfo.anchorCombosLeft.forEach(combo => {
                    let newPattern = wordPattern;
                    anchorInfo.anchorSquareKeys.forEach((sqKey, i) => {
                        newPattern = insertLetterIntoPattern(newPattern, combo[i], squares, sqKey);
                    });
                    filteredEntries.push(...getFilteredEntries(squares, newPattern, calculatedSquares, usedWords));
                });
    
                if (filteredEntries.length === 0) {
                    isViable = false;
                    return;
                }

                if (distillIndex === 1) {
                    let score = sum(filteredEntries.map(fe => getWordScore(fe)));
                    crossScore += score;
                    if (score < minCrossScore) minCrossScore = score;
                }

                if (heuristicsLevel === 1) return;
                if (distillIndex === 2 && heuristicsLevel === 2) return;
    
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

            if (distillIndex === 3) break;
            if (!foundCountReduction) break;
            if (!isViable) break;
            if (distillIndex > 0 && heuristicsLevel === 1) break;
            if (distillIndex === 2 && heuristicsLevel === 2) break;

            distillIndex++;
        }

        if (!isViable) return false;

        if (crossScore > node.topCrossScore) node.topCrossScore = crossScore;
        if (minCrossScore > node.topMinCrossScore) node.topMinCrossScore = minCrossScore;

        let iffyEntry = undefined as string | undefined;
        if (iffyWordKey) {
            let iffyWord = grid.words.get(iffyWordKey)!;
            let iffySquares = getSquaresForWord(grid, iffyWord);
            let pattern = getLettersFromSquares(iffySquares);
            iffySquares.forEach((isq, idx) => {
                let calSq = calculatedSquares.get(squareKey(isq));
                if (!isq.content && calSq && calSq.length === 1)
                    pattern = pattern.substring(0, idx) + calSq[0] + pattern.substring(idx+1);
            });
            iffyEntry = pattern;
        }

        if (iffyEntry && usedWords.has(iffyEntry)) return false;

        node.entryCandidates.push({
            word: entry,
            score: -1,
            isViable: isViable,
            hasBeenChained: false,
            wasChainFailure: false,
            iffyEntry: iffyEntry,
            iffyWordKey: iffyWordKey,
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
    let ret = (crossScore + minCrossScore) * wordScore * (ec.iffyWordKey ? 1 : 100);
    return ret;
}

function insertLetterIntoPattern(pattern: string, newLetter: string, squares: GridSquare[], sqKey: string): string {
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    return pattern.substring(0, i) + newLetter + pattern.substring(i+1);
}