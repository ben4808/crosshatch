import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { getEligibleCandidates, getWordScore } from "./fill";
import { getConstraintLetters, getLettersFromSquares, setLettersArrayVal } from "./grid";
import { average, constraintLetterCount, deepClone, getSquareAtKey, getSquaresForWord, getWordAtSquare,
    isPatternFull, isWordFull, maxIffyLength, otherDir, squareKey, wordKey, wordLength } from "./util";
import { queryIndexedWordList } from "./wordList";

// returns false if no viable candidates were found or iffy was set
export function populateAndScoreEntryCandidates(node: FillNode, isForManualFill: boolean): boolean {
    if (node.anchorSquareKeys.length === 0)
        populateFillWordAnchors(node);

    let eligibleCandidates = [] as EntryCandidate[];
    while(true) {
        processAnchorCombo(node, isForManualFill);
        if (node.anchorCombosLeft.length === 0) break;
        eligibleCandidates = getEligibleCandidates(node);
        if (eligibleCandidates.length > (isForManualFill ? 100 : 0)) break;
    }

    if (eligibleCandidates.length === 0) {
        if (node.iffyWordKey || wordLength(node.fillWord!) > maxIffyLength) return false;
    
        node.iffyWordKey = wordKey(node.fillWord!);
        return true;
    }

    node.entryCandidates.sort((a, b) => b.score! - a.score!);
    return true;
}

function populateFillWordAnchors(node: FillNode) {
    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let anchorKeyCounts = [] as [string, number][];

    wordSquares.forEach(sq => {
        let count = constraintLetterCount(sq);
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

    node.anchorSquareKeys = [anchorKeyCounts[0][0], anchorKeyCounts[1][0]];
    generateAnchorCombos(node);
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

function generateAnchorCombos(node: FillNode) {
    node.anchorCombosLeft = [];
    let grid = node.startGrid;
    let constraintLetters = node.anchorSquareKeys.map(sqKey => getSquareAtKey(grid, sqKey))
        .map(sq => getConstraintLetters(sq));

    for (var letter1 of constraintLetters[0]) {
        for (var letter2 of constraintLetters[1]) {
            node.anchorCombosLeft.push([letter1, letter2]);
        }
    }

    node.anchorCombosLeft.sort((a, b) => {
        return (letterFrequencies[a[0]] * letterFrequencies[a[1]]) - 
               (letterFrequencies[b[0]] * letterFrequencies[b[1]]);
    });
}

function processAnchorCombo(node: FillNode, isForManualFill: boolean) {
    let grid = node.startGrid;
    let anchorLeftCount = node.anchorCombosLeft.length;
    let mode = anchorLeftCount <= 5 ? "Three" : anchorLeftCount <= 30 ? "Two" : "One";
    let combo = node.anchorCombosLeft.pop()!;

    let wKey = wordKey(node.fillWord!);
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
            calculatedEntries: new Map<string, string[]>(),
        } as EntryCandidate);
        return;
    }

    let entries = [] as string[];
    let calculatedEntries = node.parent?.chosenEntry?.calculatedEntries.get(wKey);
    if (calculatedEntries) {
        entries = calculatedEntries;
    }
    else {
        broadenAnchorPatterns(wordSquares, patternWithAnchor).forEach(pattern => {
            entries = entries.concat(queryIndexedWordList(pattern));
        });
    }

    entries.forEach(entry => {
        if (grid.usedWords.has(entry)) return;

        let crossCountsTotal = 0;
        let crossCrossTotal = 0;
        let containsZeroSquare = false;
        let isViable = true;
        let iffyEntry = undefined as string | undefined;
        let iffyWordKey = node.iffyWordKey;
        let calculatedSquares = new Map<string, string[]>();
        let calculatedEntries = new Map<string, string[]>();
        let crossCrossKeys = new Map<string, boolean>();
        let usedWords = new Map<string, boolean>();
        usedWords.set(entry, true);

        wordSquares.forEach((sq, i) => {
            let index = entry[i].charCodeAt(0) - 65;
            if (sq.constraintInfo && sq.constraintInfo!.isCalculated && !sq.constraintInfo!.viableLetters[index]) {
                isViable = false;
            }
        });
        if (!isViable) return;

        // check crosses
        wordSquares.forEach((sq, i) => {
            let sqKey = squareKey(sq);
            let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(node.fillWord!.direction));
            if (!cross) return;
            let crossKey = wordKey(cross);
            let crossSquares = getSquaresForWord(grid, cross);
            crossSquares = insertLetterIntoSquares(crossSquares, entry[i], sqKey);
            let crossPattern = getLettersFromSquares(crossSquares);
            if (usedWords.has(crossPattern)) {
                isViable = false;
                return;
            }
            if (isPatternFull(crossPattern))
                usedWords.set(crossPattern, true);

            let crossEntries = getCrossEntries(crossSquares);
            populateCrossCalculatedSquares(calculatedSquares, crossSquares, crossEntries);
            crossCountsTotal += average(crossSquares.map(csq => calculatedSquares.get(squareKey(csq))!.length));

            crossSquares.forEach(csq => {
                if (!isViable) return;
                let cc = getWordAtSquare(grid, csq.row, csq.col, node.fillWord!.direction);
                if (!cc) return;

                if (crossEntries.length === 0) {
                    containsZeroSquare = true;
                    if (crossKey === iffyWordKey || (!iffyWordKey && crossSquares.length <= maxIffyLength)) {
                        iffyEntry = crossPattern;
                        iffyWordKey = crossKey;
                    }
                    else isViable = false;
                }

                let ccKey = wordKey(cc);
                if (ccKey === wKey || crossCrossKeys.has(ccKey)) return;

                crossCrossKeys.set(ccKey, true);
            });
        });
        if (!isViable) return;

        if (mode !== "One") {
            // check that crosscrosses have something workable
            let isAlreadyIffy = !!iffyEntry;
            crossCrossKeys.forEach((_, ccKey) => {
                if (!isViable) return;
                let ccWord = grid.words.get(ccKey)!;
                if (wordKey(ccWord) === node.iffyWordKey) return;
                let ccSquares = deepClone(getSquaresForWord(grid, ccWord)) as GridSquare[];
                //if (isForManualFill) ccSquares = getManualEntrySquares(ccSquares);
                if (isWordFull(ccSquares)) return;

                for(let ccsq of ccSquares) {
                    let ccConstraintInfo = ccConstraintSquares.get(squareKey(ccsq));
                    if (ccConstraintInfo) {
                        ccsq.constraintInfo = ccConstraintInfo;
                    }
                }

                if (ccSquares.find(csq => !csq.constraintInfo || !csq.constraintInfo.isCalculated)) return;

                let anchorPattern = getLettersFromSquares(ccSquares);
                let curPatterns = broadenAnchorPatterns(ccSquares, anchorPattern);
                if (!curPatterns[0].match(/[A-Z]/)) return;

                let found = false;
                let provEntry = "";
                let provWordKey = "";
                let iffyAdded = false;
                for (let pattern of curPatterns) {
                    let ccEntries = queryIndexedWordList(pattern);

                    ccEntries = ccEntries.filter(en => {
                        for (let i = 0; i < ccSquares.length; i++) {
                            let ccsq = ccSquares[i];
                            let index = en[i].charCodeAt(0) - 65;
                            if (!ccsq.constraintInfo!.viableLetters[index]) {
                                return false;
                            }
                        };
                        return true;
                    });

                    if (ccEntries.length === 0) {
                        if (!iffyAdded && provEntry.length === 0 && wordLength(ccWord) <= maxIffyLength) {
                            iffyAdded = true;
                            provEntry = pattern;
                            provWordKey = wordKey(ccWord);
                        }
                    }
                    else {
                        found = true;
                        break;
                    }
                };
                if (!found) {
                    containsZeroSquare = true;
                    if (!iffyAdded || isAlreadyIffy) isUnviable = true;
                    else if (!isAlreadyIffy) {
                        isAlreadyIffy = true;
                        iffyEntry = provEntry;
                        iffyWordKey = provWordKey;
                    }
                }
            });
        }
        if (!isViable) return;
        
        node.entryCandidates.push({
            word: entry,
            score: calculateEntryCandidateScore(entry, crossCountsTotal, containsZeroSquare),
            isViable: isViable,
            hasBeenChained: false,
            wasChainFailure: false,
            iffyEntry: iffyEntry,
            iffyWordKey: iffyWordKey,
            calculatedSquares: calculatedSquares,
            calculatedEntries: calculatedEntries,
        } as EntryCandidate);
    });
}

function broadenAnchorPatterns(squares: GridSquare[], anchorPattern: string): string[] {
    let constraintCounts = squares.map((sq, i) => [i, anchorPattern[i] !== "-" ? 1 : sq.constraintInfo ? sq.constraintInfo!.letterFillCount : 26])
        .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);

    let curPatterns = [anchorPattern];
    while(constraintCounts.length > 0 && curPatterns.length < 12) {
        let lowestCount = constraintCounts.pop()!;
        if (lowestCount[1] > 6) 
            return curPatterns;

        let index = lowestCount[0];
        let viableLetters = anchorPattern[index] !== "-" ? [anchorPattern[index]] : getConstraintLetters(squares[index]);
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

function calculateEntryCandidateScore(entry: string, crossCountsTotal: number, containsZeroSquare: boolean): number {
    let wordScore = getWordScore(entry);
    let ret = crossCountsTotal * wordScore * (containsZeroSquare ? 1 : 10);
    return ret;
}

function insertLetterIntoPattern(pattern: string, newLetter: string, squares: GridSquare[], sqKey: string): string {
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    return pattern.substring(0, i) + newLetter + pattern.substring(i+1);
}

function insertLetterIntoSquares(squares: GridSquare[], newLetter: string, sqKey: string): GridSquare[] {
    let newSquares = deepClone(squares) as GridSquare[];
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    newSquares[i].content = newLetter;

    let newLettersArr = Array<boolean>(26).fill(false);
    setLettersArrayVal(newLettersArr, newLetter, true);
    newSquares[i].constraintInfo = {
        isCalculated: true,
        letterFillCount: 1,
        viableLetters: newLettersArr,
    };

    return newSquares;
}

function getCrossEntries(crossSquares: GridSquare[]): string[] {
    let pattern = getLettersFromSquares(crossSquares);
    let entries = [] as string[];
    broadenAnchorPatterns(crossSquares, pattern).forEach(pattern => {
        entries = entries.concat(queryIndexedWordList(pattern));
    });
    if (entries.length > 100) return entries;

    let filtered = entries.filter(entry => {
        crossSquares.forEach((sq, i) => {
            let index = entry[i].charCodeAt(0) - 65;
            if (sq.constraintInfo && sq.constraintInfo!.isCalculated && !sq.constraintInfo!.viableLetters[index]) {
                return false;
            }
        });
        return true;
    });
    return filtered;
}

function populateCrossCalculatedSquares(calculatedSquares: Map<string, string[]>, 
    crossSquares: GridSquare[], crossEntries: string[]) {
    let matrix = [] as boolean[][];
    crossSquares.forEach((sq, i) => {
        if (sq.content) {
            let newLettersArr = Array<boolean>(26).fill(false);
            setLettersArrayVal(newLettersArr, sq.content!, true);
            matrix.push(newLettersArr);
            return;
        }
        if (crossEntries.length > 500) {
            matrix.push(Array<boolean>(26).fill(true));
            return;
        }

        let newLettersArr = Array<boolean>(26).fill(false);
        crossEntries.forEach(entry => {
            newLettersArr[entry[i].charCodeAt(0) - 65] = true;
        });
        matrix.push(newLettersArr);
    });

    matrix.forEach((arr, index) => {
        let letters = arr.map((x, i) => x ? String.fromCharCode(i + 65) : "").filter(x => x);
        calculatedSquares.set(squareKey(crossSquares[index]), letters);
    });
}
