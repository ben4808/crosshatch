import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { getEligibleCandidates, getWordScore } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { constraintLetterCount, deepClone, getSquareAtKey, getSquaresForWord, getWordAtSquare,
    isPatternFull, isWordFull, mapKeys, maxIffyLength, otherDir, squareKey, wordKey, wordLength } from "./util";
import { queryIndexedWordList } from "./wordList";

// returns false if no viable candidates were found (fill word has to be iffy and should skip to next fill word)
export function populateAndScoreEntryCandidates(node: FillNode, processdMoreCandidates: boolean): boolean {
    if (node.anchorSquareKeys.length === 0)
        populateFillWordAnchors(node);

    if (node.anchorCombosLeft.length === 0) return false;

    let eligibleCandidates = [] as EntryCandidate[];
    while(true) {
        processAnchorCombo(node);
        eligibleCandidates = getEligibleCandidates(node);
        if (node.anchorCombosLeft.length === 0) break;
        if (!processdMoreCandidates && eligibleCandidates.length >= 20) break;
        if (processdMoreCandidates && eligibleCandidates.length >= 250) break;
    }

    node.entryCandidates.sort((a, b) => b.score! - a.score!);
    return eligibleCandidates.length > 0;
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
        .map(sq => mapKeys(sq.constraintInfo!.viableLetters));

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

function processAnchorCombo(node: FillNode) {
    let grid = node.startGrid;
    let combo = node.anchorCombosLeft.pop()!;

    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let patternWithAnchor = getLettersFromSquares(wordSquares);
    node.anchorSquareKeys.forEach((sqKey, i) => {
        patternWithAnchor = insertLetterIntoPattern(patternWithAnchor, combo[i], wordSquares, sqKey);
    });

    let entries = queryIndexedWordList(patternWithAnchor);
    let iffyWordKey = node.iffyWordKey;

    entries.forEach(entry => {
        if (grid.usedWords.has(entry)) return;

        let crossCountsTotal = 0;
        let containsZeroSquare = false;
        let isUnviable = false;
        let iffyEntry = undefined as string | undefined;
        let constraintSquares = new Map<string, GridSquare[]>();
        let crossCrossKeys = new Map<string, boolean>();
        let usedWords = new Map<string, boolean>();

        // check crosses
        wordSquares.forEach((sq, i) => {
            let sqKey = squareKey(sq);
            let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(node.fillWord!.direction));
            if (!cross) return;
            let crossKey = wordKey(cross);
            let crossSquares = getSquaresForWord(grid, cross);
            crossSquares = insertLetterIntoSquares(crossSquares, entry[i], sqKey);
            let crossPattern = getLettersFromSquares(crossSquares);
            if (grid.usedWords.has(crossPattern) || usedWords.has(crossPattern)) 
                return;
            if (isPatternFull(crossPattern))
                usedWords.set(crossPattern, true);

            let crossCount = queryIndexedWordList(crossPattern).length;
            crossCountsTotal += crossCount;

            generateConstraintInfoForSquares(grid, crossSquares);
            constraintSquares.set(sqKey, crossSquares);
            crossCrossKeys.set(crossKey, true);

            crossSquares.forEach(csq => {
                let cc = getWordAtSquare(grid, csq.row, csq.col, node.fillWord!.direction);
                if (!cc) return;
                let ccKey = wordKey(cc);
                if (crossCrossKeys.has(ccKey)) return;

                crossCrossKeys.set(ccKey, true);
            });

            if (crossCount === 0) {
                containsZeroSquare = true;
                if (!iffyWordKey && wordLength(cross) <= maxIffyLength) {
                    iffyEntry = crossPattern;
                    iffyWordKey = crossKey;
                }
                else isUnviable = true;
            }
        });

        // check that crosscrosses have something workable
        let isAlreadyIffy = !!iffyEntry;
        crossCrossKeys.forEach((_, ccKey) => {
            let ccWord = grid.words.get(ccKey)!;
            let ccSquares = getSquaresForWord(grid, ccWord);
            if (isWordFull(ccSquares)) return;

            let ccPattern = getLettersFromSquares(ccSquares);
            let ccConstraintCounts = ccSquares.map((ccsq, i) => [i, ccsq.constraintInfo!.viableLetters.size])
                .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
            let curPatterns = [ccPattern];
            while(ccConstraintCounts.length > 0 && curPatterns.length < 12) {
                let index = ccConstraintCounts.pop()![0];
                let viableLetters = ccSquares[index].constraintInfo!.viableLetters;
                let newCurPatterns = [] as string[];
                mapKeys(viableLetters).forEach(ltr => {
                    curPatterns.forEach(pattern => {
                        newCurPatterns.push(pattern.substring(0, index) + ltr + pattern.substring(index+1));
                    });
                });
                curPatterns = newCurPatterns;
            }

            let found = false;
            let provEntry = "";
            let provWordKey = "";
            let iffyAdded = false;
            for (let pattern of curPatterns) {
                let ccEntries = queryIndexedWordList(pattern);
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
                if (!isAlreadyIffy) {
                    isAlreadyIffy = true;
                    iffyEntry = provEntry;
                    iffyWordKey = provWordKey;
                }
            }
        });

        node.entryCandidates.push({
            word: entry,
            score: isUnviable ? 0 : calculateEntryCandidateScore(entry, crossCountsTotal, containsZeroSquare),
            isViable: !isUnviable,
            hasBeenChained: false,
            wasChainFailure: false,
            iffyEntry: iffyEntry,
            iffyWordKey: iffyWordKey,
            crossSquares: constraintSquares,
        } as EntryCandidate);
    });
}

function calculateEntryCandidateScore(entry: string, crossCountsTotal: number, containsZeroSquare: boolean): number {
    let wordScore = getWordScore(entry);
    let ret = crossCountsTotal * (!containsZeroSquare ? wordScore  : 1);
    return ret * (wordScore > 3 ? 2 : 1);
}

function insertLetterIntoPattern(pattern: string, newLetter: string, squares: GridSquare[], sqKey: string): string {
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    return pattern.substring(0, i) + newLetter + pattern.substring(i+1);
}

function insertLetterIntoSquares(squares: GridSquare[], newLetter: string, sqKey: string): GridSquare[] {
    let newSquares = deepClone(squares) as GridSquare[];
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    newSquares[i].content = newLetter;
    return newSquares;
}
