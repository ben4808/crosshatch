import { EntryCandidate } from "../models/EntryCandidate";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { getUnfilledCrosses } from "./fill";
import { getLettersFromSquares } from "./grid";
import { getSectionWordList } from "./section";
import {
    constraintLetterCount, getSquaresForWord, isWordFull, letterBit, squareViableMask,
} from "./util";
import {
    countExtraUsed, countLikelyGettableUsed, fillWordIdFilter, queryIndexedWordList, scanWordIds, wordIdOf, wordOfId,
} from "./wordList";
import Globals from "./windowService";

const MAX_CANDIDATES_MANUAL = 100;
/** Cap match counting used only for manual ranking. */
const RANK_MATCH_CAP = 20;
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

type AllowWordFn = (word: string) => boolean;
type IdPredicate = (id: number) => boolean;

/** Likely Gettable entries the grid already uses toward the fill quota. */
export function getLikelyUsedCount(grid: GridState): number {
    if (!Globals.fillFilter) return 0;
    return grid.likelyUsedCount ?? countLikelyGettableUsed(grid.usedWords);
}

/** Crosswordese / Abbreviation entries the grid already uses toward the fill quota. */
export function getExtraUsedCount(grid: GridState): number {
    if (!Globals.fillFilter) return 0;
    return grid.extraUsedCount ?? countExtraUsed(grid.usedWords);
}

function gridWordIdFilter(grid: GridState): IdPredicate | undefined {
    return fillWordIdFilter(getLikelyUsedCount(grid), getExtraUsedCount(grid));
}

function makeUsedCheck(grid: GridState): IdPredicate {
    const ids = grid.usedWordIds;
    if (ids && grid.usedWordIdsIndex === Globals.wordList) return id => ids[id] === 1;
    const used = grid.usedWords;
    return id => used.size > 0 && used.has(wordOfId(id));
}

/** Per-position letter masks: placed letters are single bits. */
function slotMasks(squares: GridSquare[]): Int32Array {
    const masks = new Int32Array(squares.length);
    for (let i = 0; i < squares.length; i++) {
        const sq = squares[i];
        masks[i] = sq.content ? letterBit(sq.content) : squareViableMask(sq);
    }
    return masks;
}

/**
 * Build candidates for autofill frames without allocating a FillNode.
 * allowWord overrides the fill filter for this word only (crosses still use the filter).
 */
export function buildEntryCandidates(
    grid: GridState,
    word: GridWord,
    squares: GridSquare[],
    isForManualFill: boolean,
    allowWord?: AllowWordFn,
): EntryCandidate[] {
    if (isForManualFill && isWordFull(squares)) {
        return [{ word: getLettersFromSquares(squares), score: 1 }];
    }
    if (!Globals.wordList) return [];

    const isUsed = makeUsedCheck(grid);
    const allowed = gridWordIdFilter(grid);
    const crosses = prepareCrossInfos(grid, word, squares);
    const candidates: EntryCandidate[] = [];

    scanWordIds(slotMasks(squares), id => {
        if (isUsed(id)) return false;
        let entry: string | undefined;
        if (allowWord) {
            entry = wordOfId(id);
            if (!allowWord(entry)) return false;
        } else if (allowed && !allowed(id)) {
            return false;
        }
        entry = entry ?? wordOfId(id);

        const score = scoreEntryAgainstCrosses(id, entry, crosses, isForManualFill, isUsed, allowed);
        if (score === undefined) return false;
        candidates.push({ word: entry, score, id });
        return isForManualFill && candidates.length >= MAX_CANDIDATES_MANUAL;
    });

    if (isForManualFill) {
        candidates.sort((a, b) => b.score - a.score);
    }
    return candidates;
}

/** Unused, filter-allowed dictionary words fitting the squares' letters and masks. */
function getPatternEntries(grid: GridState, squares: GridSquare[]): string[] {
    const isUsed = makeUsedCheck(grid);
    const allowed = gridWordIdFilter(grid);
    const out: string[] = [];
    scanWordIds(slotMasks(squares), id => {
        if (isUsed(id) || (allowed && !allowed(id))) return false;
        out.push(wordOfId(id));
        return false;
    });
    return out;
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
        entries = getPatternEntries(node.startGrid, squares);
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
export function estimateWordOpenness(grid: GridState, squares: GridSquare[]): number {
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

    return countPatternEntries(grid, squares, MRV_COUNT_CAP);
}

export interface ForwardCheckFailure {
    /** The word left without entries, or the two completed words that duplicate each other. */
    words: GridWord[];
    duplicate: boolean;
}

/**
 * After placing a word, reject the branch if any remaining section word has
 * zero legal (non-duplicate) entries — fail-first forward checking.
 *
 * newlyClaimed: words added by the latest placement. When provided, only
 * unfilled words of those lengths are re-queried (others can't have lost
 * candidates via the used-word set), and completed words aren't re-compared
 * (placement already rejects duplicates). Without it, completed section words
 * are checked for duplicates. Empty viable-letter squares are always checked.
 */
export function forwardCheckSection(
    grid: GridState,
    section: Section,
    newlyClaimed?: string[],
): ForwardCheckFailure | undefined {
    let checkLengths = newlyClaimed
        ? new Set(newlyClaimed.map(w => w.length))
        : undefined;
    let seenFilled = newlyClaimed ? undefined : new Map<string, GridWord>();

    for (let word of getSectionWordList(grid, section)) {
        let squares = getSquaresForWord(grid, word);
        if (isWordFull(squares)) {
            if (seenFilled) {
                let letters = getLettersFromSquares(squares);
                let other = seenFilled.get(letters);
                if (other) return { words: [other, word], duplicate: true };
                seenFilled.set(letters, word);
            }
            continue;
        }

        for (let sq of squares) {
            if (!sq.content && sq.viableMask === 0) {
                return { words: [word], duplicate: false };
            }
        }

        if (checkLengths && !checkLengths.has(squares.length)) continue;

        if (countPatternEntries(grid, squares, FORWARD_CHECK_CAP) === 0) {
            return { words: [word], duplicate: false };
        }
    }
    return undefined;
}

function countPatternEntries(grid: GridState, squares: GridSquare[], cap: number): number {
    const isUsed = makeUsedCheck(grid);
    const allowed = gridWordIdFilter(grid);
    let count = 0;
    scanWordIds(slotMasks(squares), id => {
        if (isUsed(id) || (allowed && !allowed(id))) return false;
        return ++count >= cap;
    });
    return count;
}

interface CrossInfo {
    squares: GridSquare[];
    /** Cross masks before the candidate's letters are applied. */
    baseMasks: Int32Array;
    /** Working copy of baseMasks for the candidate being scored. */
    masks: Int32Array;
    openCount: number;
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
            let j = crossSquares.indexOf(wordSquares[i]);
            if (j >= 0) wordToCrossIdx[i] = j;
        }
        let baseMasks = slotMasks(crossSquares);
        let openCount = 0;
        for (let sq of crossSquares) if (!sq.content) openCount++;
        return { squares: crossSquares, baseMasks, masks: new Int32Array(crossSquares.length), openCount, wordToCrossIdx };
    });
}

function letterOfMask(mask: number): string {
    return String.fromCharCode(65 + 31 - Math.clz32(mask));
}

/**
 * Returns openness score, or undefined if any cross is impossible / would duplicate.
 * Candidates and completed crosses must not reuse any word already in the grid
 * (or completed by this same placement).
 */
function scoreEntryAgainstCrosses(
    entryId: number,
    entry: string,
    crosses: CrossInfo[],
    includeDetailedScore: boolean,
    isUsed: IdPredicate,
    allowed: IdPredicate | undefined,
): number | undefined {
    let crossScore = 0;
    let minCrossScore = 1e8;
    let matchCap = includeDetailedScore ? RANK_MATCH_CAP : 1;
    let claimedIds = [entryId];

    for (let cross of crosses) {
        let masks = cross.masks;
        masks.set(cross.baseMasks);
        let open = cross.openCount;
        for (let i = 0; i < entry.length; i++) {
            let idx = cross.wordToCrossIdx[i];
            if (idx < 0 || cross.squares[idx].content) continue;
            let bit = letterBit(entry[i]);
            if ((masks[idx] & bit) === 0) return undefined;
            masks[idx] = bit;
            open--;
        }

        if (open === 0) {
            let crossWord = "";
            for (let j = 0; j < masks.length; j++) crossWord += letterOfMask(masks[j]);
            let id = wordIdOf(crossWord);
            if (id < 0 || isUsed(id) || claimedIds.includes(id)) return undefined;
            if (allowed && !allowed(id)) return undefined;
            claimedIds.push(id);
            if (includeDetailedScore) {
                crossScore += 1;
                if (1 < minCrossScore) minCrossScore = 1;
            }
            continue;
        }

        let matchCount = 0;
        scanWordIds(masks, id => {
            if (isUsed(id) || claimedIds.includes(id)) return false;
            if (allowed && !allowed(id)) return false;
            return ++matchCount >= matchCap;
        });

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
