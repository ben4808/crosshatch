import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { getUnfilledCrosses } from "./fill";
import { getLettersFromSquares } from "./grid";
import {
    constraintLetterCount, getSquaresForWord, isWordFull, mapKeys, squareKey,
    squareAllowsLetter, squareViableMask, maskToLetterList,
} from "./util";
import { isAllowedFillWord, isKnownWord, queryIndexedWordList, queryWordsByLength } from "./wordList";

const MAX_CANDIDATES_MANUAL = 100;
/** Cap match counting used only for manual ranking. */
const RANK_MATCH_CAP = 20;
/** Prefer length-bucket scan over 2-letter combo explosion when open. */
const MAX_ANCHOR_COMBOS_BEFORE_LENGTH_SCAN = 40;
/** Cap used by MRV estimates so open slots stay cheap. */
const MRV_COUNT_CAP = 50;
/** Forward-check only needs existence of one legal entry. */
const FORWARD_CHECK_CAP = 1;

export function populateAndScoreEntryCandidates(node: FillNode, isForManualFill: boolean): boolean {
    let word = node.fillWord!;
    let squares = getSquaresForWord(node.startGrid, word);
    node.entryCandidates = buildEntryCandidates(node.startGrid, word, squares, isForManualFill);
    return node.entryCandidates.length > 0;
}

/** Build candidates for autofill frames without allocating a FillNode. */
export function buildEntryCandidates(
    grid: GridState,
    word: GridWord,
    squares: GridSquare[],
    isForManualFill: boolean,
): EntryCandidate[] {
    if (isForManualFill && isWordFull(squares)) {
        return [{ word: getLettersFromSquares(squares), score: 1 }];
    }

    let pattern = getLettersFromSquares(squares);
    let usedWords = grid.usedWords;
    let entries = getPatternEntries(squares, pattern, usedWords);
    let crosses = prepareCrossInfos(grid, word, squares);
    let candidates: EntryCandidate[] = [];

    for (let entry of entries) {
        let scored = scoreEntryAgainstCrosses(grid, squares, entry, crosses, isForManualFill);
        if (scored === undefined) continue;

        candidates.push({ word: entry, score: scored });
        if (isForManualFill && candidates.length >= MAX_CANDIDATES_MANUAL) break;
    }

    if (isForManualFill) {
        candidates.sort((a, b) => b.score - a.score);
    }
    return candidates;
}

export function populateNoHeuristicEntryCandidates(node: FillNode, dontRecalc?: boolean) {
    if (dontRecalc === undefined) dontRecalc = false;
    if (node.entryCandidates.length > 0 && dontRecalc) return;

    let word = node.fillWord!;
    let squares = getSquaresForWord(node.startGrid, word);
    let pattern = getLettersFromSquares(squares);
    let usedWords = node.startGrid.usedWords;
    let entries = queryIndexedWordList(pattern).filter(e => !usedWords.has(e));

    if (entries.length === 0 && pattern.includes("-")) {
        entries = getPatternEntries(squares, pattern, usedWords);
    }

    node.entryCandidates = entries.map(entry => ({
        word: entry,
        score: 1,
    } as EntryCandidate));
}

/**
 * Cheap MRV heuristic: fewer remaining options → fill this word first.
 * Fully open slots use a letter-product estimate; partial patterns query with a cap.
 */
export function estimateWordOpenness(squares: GridSquare[], usedWords: Map<string, boolean>): number {
    let pattern = getLettersFromSquares(squares);
    let openCount = 0;
    let letterProd = 1;

    for (let sq of squares) {
        if (sq.content) continue;
        openCount++;
        let n = constraintLetterCount(sq);
        if (n === 0) return 0;
        letterProd = Math.min(MRV_COUNT_CAP, letterProd * n);
    }

    if (openCount === 0) return Infinity;
    if (openCount === squares.length) return letterProd;

    return countPatternEntries(squares, pattern, usedWords, MRV_COUNT_CAP);
}

/**
 * After placing a word, reject the branch if any remaining section word has
 * zero legal (non-duplicate) entries — fail-first forward checking.
 * Also rejects in-section duplicated completed words.
 *
 * newlyClaimed: words added by the latest placement. When provided, only
 * unfilled words of those lengths are re-queried (others can't have lost
 * candidates via the used-word set). Empty viable-letter squares are
 * always checked.
 */
export function forwardCheckSection(
    grid: GridState,
    section: Section,
    newlyClaimed?: string[],
): boolean {
    let seenFilled = new Set<string>();
    let checkLengths = newlyClaimed
        ? new Set(newlyClaimed.map(w => w.length))
        : undefined;

    for (let key of mapKeys(section.words)) {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        if (isWordFull(squares)) {
            let letters = getLettersFromSquares(squares);
            if (seenFilled.has(letters)) return false;
            seenFilled.add(letters);
            continue;
        }

        for (let sq of squares) {
            if (!sq.content && sq.viableMask === 0) {
                return false;
            }
        }

        if (checkLengths && !checkLengths.has(squares.length)) continue;

        if (countPatternEntries(squares, getLettersFromSquares(squares), grid.usedWords, FORWARD_CHECK_CAP) === 0) {
            return false;
        }
    }
    return true;
}

function getPatternEntries(
    squares: GridSquare[],
    pattern: string,
    usedWords?: Map<string, boolean>,
): string[] {
    let fixedCount = 0;
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] !== "-") fixedCount++;
    }

    let raw: string[];
    if (fixedCount >= 1) {
        raw = queryIndexedWordList(pattern);
    }
    else {
        raw = entriesViaAnchorCombos(squares, pattern);
    }

    return raw.filter(entry => {
        if (usedWords && usedWords.has(entry)) return false;
        if (!isAllowedFillWord(entry, usedWords)) return false;
        for (let i = 0; i < squares.length; i++) {
            if (!squareAllowsLetter(squares[i], entry[i])) return false;
        }
        return true;
    });
}

function countPatternEntries(
    squares: GridSquare[],
    pattern: string,
    usedWords: Map<string, boolean>,
    cap: number,
): number {
    let fixedCount = 0;
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] !== "-") fixedCount++;
    }

    let raw: string[];
    if (fixedCount >= 1) {
        raw = queryIndexedWordList(pattern);
    }
    else {
        raw = entriesViaAnchorCombos(squares, pattern);
    }

    let count = 0;
    for (let entry of raw) {
        if (usedWords.has(entry)) continue;
        if (!isAllowedFillWord(entry, usedWords)) continue;
        let ok = true;
        for (let i = 0; i < squares.length; i++) {
            if (!squareAllowsLetter(squares[i], entry[i])) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;
        count++;
        if (count >= cap) return cap;
    }
    return count;
}

function entriesViaAnchorCombos(squares: GridSquare[], pattern: string): string[] {
    let anchors = pickAnchorSquares(squares);
    if (anchors.length === 0) {
        return queryWordsByLength(pattern.length);
    }

    let combos = generateAllAnchorCombos(squares, anchors);
    if (combos.length > MAX_ANCHOR_COMBOS_BEFORE_LENGTH_SCAN) {
        return queryWordsByLength(pattern.length);
    }

    let seen = new Map<string, boolean>();
    let results: string[] = [];

    for (let combo of combos) {
        let anchored = pattern;
        for (let i = 0; i < anchors.length; i++) {
            anchored = insertLetterIntoPattern(anchored, combo[i], squares, anchors[i]);
        }
        for (let entry of queryIndexedWordList(anchored)) {
            if (!seen.has(entry)) {
                seen.set(entry, true);
                results.push(entry);
            }
        }
    }
    return results;
}

function pickAnchorSquares(squares: GridSquare[]): string[] {
    let ranked: [string, number][] = [];
    for (let sq of squares) {
        let count = constraintLetterCount(sq);
        if (count === 0) continue;
        ranked.push([squareKey(sq), count]);
    }
    ranked.sort((a, b) => a[1] - b[1]);

    if (ranked.length >= 2) return [ranked[0][0], ranked[1][0]];
    if (ranked.length === 1) return [ranked[0][0]];
    return [];
}

function generateAllAnchorCombos(squares: GridSquare[], anchorSquareKeys: string[]): string[][] {
    let constraintLetters = anchorSquareKeys.map(sqKey => {
        let sq = squares.find(s => squareKey(s) === sqKey)!;
        if (sq.content) return [sq.content];
        return maskToLetterList(squareViableMask(sq));
    });

    let combos: string[][] = [[]];
    for (let letters of constraintLetters) {
        let next: string[][] = [];
        for (let prefix of combos) {
            for (let letter of letters) {
                next.push([...prefix, letter]);
            }
        }
        combos = next;
    }
    return combos;
}

interface CrossInfo {
    squares: GridSquare[];
    /** For each index in the fill word, the index in this cross (-1 if no intersection). */
    wordToCrossIdx: Int8Array;
}

function prepareCrossInfos(grid: GridState, word: GridWord, wordSquares: GridSquare[]): CrossInfo[] {
    let crosses = getUnfilledCrosses(grid, word);
    return crosses.map(cross => {
        let crossSquares = getSquaresForWord(grid, cross);
        let wordToCrossIdx = new Int8Array(wordSquares.length);
        wordToCrossIdx.fill(-1);
        for (let i = 0; i < wordSquares.length; i++) {
            let sq = wordSquares[i];
            for (let j = 0; j < crossSquares.length; j++) {
                if (crossSquares[j].row === sq.row && crossSquares[j].col === sq.col) {
                    wordToCrossIdx[i] = j;
                    break;
                }
            }
        }
        return { squares: crossSquares, wordToCrossIdx };
    });
}

/**
 * Returns openness score, or undefined if any cross is impossible / would duplicate.
 * Candidates and completed crosses must not reuse any word already in the grid
 * (or completed by this same placement).
 */
function scoreEntryAgainstCrosses(
    grid: GridState,
    wordSquares: GridSquare[],
    entry: string,
    crosses: CrossInfo[],
    includeDetailedScore: boolean,
): number | undefined {
    let crossScore = 0;
    let minCrossScore = 1e8;
    let matchCap = includeDetailedScore ? RANK_MATCH_CAP : 1;
    let usedWords = grid.usedWords;
    let claimed = new Set<string>([entry]);

    for (let cross of crosses) {
        let crossSquares = cross.squares;
        let crossPatternChars = new Array<string>(crossSquares.length);
        for (let j = 0; j < crossSquares.length; j++) {
            crossPatternChars[j] = crossSquares[j].content || "-";
        }
        for (let i = 0; i < wordSquares.length; i++) {
            let idx = cross.wordToCrossIdx[i];
            if (idx >= 0) crossPatternChars[idx] = entry[i];
        }

        let fullyDetermined = true;
        for (let j = 0; j < crossPatternChars.length; j++) {
            if (crossPatternChars[j] === "-") {
                fullyDetermined = false;
                break;
            }
        }

        if (fullyDetermined) {
            let crossPattern = crossPatternChars.join("");
            if (usedWords.has(crossPattern) || claimed.has(crossPattern)) return undefined;
            if (!isKnownWord(crossPattern)) return undefined;
            claimed.add(crossPattern);
            if (includeDetailedScore) {
                crossScore += 1;
                if (1 < minCrossScore) minCrossScore = 1;
            }
            continue;
        }

        // Cheap domain check: each newly fixed letter must be allowed on that square.
        for (let i = 0; i < wordSquares.length; i++) {
            let idx = cross.wordToCrossIdx[i];
            if (idx < 0) continue;
            let sq = crossSquares[idx];
            if (sq.content) continue;
            if (!squareAllowsLetter(sq, entry[i])) return undefined;
        }

        let crossPattern = crossPatternChars.join("");
        let matchCount = 0;
        for (let match of queryIndexedWordList(crossPattern)) {
            if (usedWords.has(match) || claimed.has(match)) continue;
            let ok = true;
            for (let i = 0; i < crossSquares.length; i++) {
                let sq = crossSquares[i];
                if (sq.content) continue;
                if (crossPatternChars[i] !== "-" && crossPatternChars[i] !== match[i]) {
                    ok = false;
                    break;
                }
                if (!squareAllowsLetter(sq, match[i])) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;
            matchCount++;
            if (matchCount >= matchCap) break;
        }

        if (matchCount === 0) return undefined;

        if (includeDetailedScore) {
            crossScore += matchCount;
            if (matchCount < minCrossScore) minCrossScore = matchCount;
        }
    }

    if (!includeDetailedScore) return 1;
    if (crosses.length === 0) return 1;
    return minCrossScore * 1000 + crossScore;
}

function insertLetterIntoPattern(pattern: string, newLetter: string, squares: GridSquare[], sqKey: string): string {
    let i = squares.findIndex(sq => squareKey(sq) === sqKey);
    return pattern.substring(0, i) + newLetter + pattern.substring(i + 1);
}
