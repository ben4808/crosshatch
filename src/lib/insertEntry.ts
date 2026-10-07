import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { FillSearchState } from "../models/FillSearchState";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { addDepth, DepthSet, newDepthSet, unionInto } from "./depthSet";
import { getUnfilledCrosses } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { sectionCandidateKey, sectionCandidateLetterAt } from "./section";
import { cloneGridForFill, getSectionCandidatesFromKeys, getSquaresForWord, isWordFull, mapKeys, letterBit, squareKey } from "./util";
import { countLikelyGettableUsed, countsTowardLikelyQuota, isLikelyQuotaFull, wordIdOf } from "./wordList";
import Globals from './windowService';

/**
 * Inserts chosenEntry into the grid.
 * mutateInPlace: for callers whose startGrid is already an exclusive clone.
 * Otherwise clones startGrid so the caller's base grid stays unchanged (manual fill UI).
 * Returns the words newly claimed by this placement, or undefined on duplicate/failure.
 */
export function processAndInsertChosenEntry(
    node: FillNode,
    contentType?: ContentType,
    mutateInPlace?: boolean,
): string[] | undefined {
    if (contentType === undefined) contentType = ContentType.Autofill;
    if (!node.chosenEntry) return undefined;

    let grid = mutateInPlace ? node.startGrid : cloneGridForFill(node.startGrid);
    let word = node.fillWord!;
    let entryWord = node.chosenEntry.word;

    let claimed = placeEntryOnGrid(grid, word, entryWord, contentType);
    node.endGrid = grid;
    return claimed;
}

/**
 * Trail-aware placement for autofill search at frame `depth`. Pushes undo ops before mutating.
 * Returns claimed words, or undefined on failure (trail restored to mark, and
 * state.failure holds the shallower frames that explain it).
 */
export function placeEntryWithTrail(
    state: FillSearchState,
    word: GridWord,
    entryWord: string,
    contentType: ContentType = ContentType.Autofill,
    depth = -1,
): string[] | undefined {
    let mark = state.trail.length;
    state.failure.fill(0);
    let claimed = placeEntryOnGrid(state.grid, word, entryWord, contentType, state, depth);
    if (!claimed) {
        undoFillTrailTo(state, mark);
        return undefined;
    }
    return claimed;
}

export function undoFillTrailTo(state: FillSearchState, mark: number) {
    let trail = state.trail;
    let grid = state.grid;
    while (trail.length > mark) {
        let op = trail.pop()!;
        if (op.kind === "sq") {
            let sq = grid.squares[op.row][op.col];
            if (sq.content && !op.content) state.openCount++;
            sq.content = op.content;
            sq.contentType = op.contentType;
            sq.viableMask = op.viableMask;
            if (op.culprits) state.squareCulprits.set(op.culprits, squareSlot(state, sq));
        } else {
            grid.usedWords.delete(op.word);
            state.claims.delete(op.word);
            if (op.id >= 0 && grid.usedWordIds) grid.usedWordIds[op.id] = 0;
            if (op.countsTowardQuota) grid.likelyUsedCount!--;
        }
    }
}

function squareSlot(state: FillSearchState, sq: GridSquare): number {
    return (sq.row * state.grid.width + sq.col) * state.depthSetWidth;
}

function squareCulpritView(state: FillSearchState, sq: GridSquare): DepthSet {
    let slot = squareSlot(state, sq);
    return state.squareCulprits.subarray(slot, slot + state.depthSetWidth);
}

/** Add the frames that determine sq's letter/mask to `set`. */
export function addSquareCulprits(state: FillSearchState, set: DepthSet, sq: GridSquare) {
    unionInto(set, state.squareCulprits, squareSlot(state, sq));
}

/**
 * Add frames whose claimed words could have removed candidates of the given lengths
 * (and, while the Likely quota is full, every frame that claimed a Likely entry).
 */
export function addClaimCulprits(state: FillSearchState, set: DepthSet, lengths: Set<number>) {
    let quotaFull = isLikelyQuotaFull(state.grid.likelyUsedCount ?? 0);
    state.claims.forEach((claim, claimedWord) => {
        if (lengths.has(claimedWord.length) || (quotaFull && claim.countsTowardQuota)) {
            addDepth(set, claim.depth);
        }
    });
}

function pushSquareTrail(state: FillSearchState | undefined, sq: GridSquare) {
    if (!state) return;
    let slot = squareSlot(state, sq);
    state.trail.push({
        kind: "sq",
        row: sq.row,
        col: sq.col,
        content: sq.content,
        contentType: sq.contentType,
        viableMask: sq.viableMask,
        culprits: state.squareCulprits.slice(slot, slot + state.depthSetWidth),
    });
}

function claimWord(grid: GridState, word: string, state: FillSearchState | undefined, depth: number, id?: number) {
    grid.usedWords.set(word, true);
    if (!state) return;
    let wordId = id ?? wordIdOf(word);
    if (wordId >= 0 && grid.usedWordIds) grid.usedWordIds[wordId] = 1;
    let countsTowardQuota = countsTowardLikelyQuota(word);
    if (countsTowardQuota) grid.likelyUsedCount = (grid.likelyUsedCount ?? 0) + 1;
    state.claims.set(word, { depth, countsTowardQuota });
    state.trail.push({ kind: "used", word, id: wordId, countsTowardQuota });
}

const REPLACEABLE_CONTENT_TYPES = [ContentType.Autofill, ContentType.ChosenSection, ContentType.HoverChosenWord];

function placeEntryOnGrid(
    grid: GridState,
    word: GridWord,
    entryWord: string,
    contentType: ContentType,
    state?: FillSearchState,
    depth = -1,
): string[] | undefined {
    let wordSquares = getSquaresForWord(grid, word);

    if (grid.usedWords.has(entryWord)) {
        if (state) addDepth(state.failure, state.claims.get(entryWord)?.depth ?? -1);
        return undefined;
    }

    let crosses = getUnfilledCrosses(grid, word);
    let claimed = [entryWord];

    for (let i = 0; i < wordSquares.length; i++) {
        let sq = wordSquares[i];
        pushSquareTrail(state, sq);
        if (state && !sq.content) {
            state.openCount--;
            let culprits = squareCulpritView(state, sq);
            culprits.fill(0);
            addDepth(culprits, depth);
        }
        sq.content = entryWord[i];
        sq.viableMask = letterBit(entryWord[i]);
        if (REPLACEABLE_CONTENT_TYPES.includes(sq.contentType))
            sq.contentType = contentType;
    }

    claimWord(grid, entryWord, state, depth);

    if (contentType === ContentType.ChosenWord) {
        removeNonmatchingSectionCandidates(grid, wordSquares, entryWord);
    }

    let crossCulprits = state ? newDepthSet(state.depthSetWidth) : undefined;
    for (let cross of crosses) {
        let newSquares = getSquaresForWord(grid, cross);
        let masksBefore: (number | undefined)[] | undefined;
        if (state) {
            crossCulprits!.fill(0);
            masksBefore = newSquares.map(sq => sq.viableMask);
            for (let sq of newSquares) {
                addSquareCulprits(state, crossCulprits!, sq);
                if (!sq.content) pushSquareTrail(state, sq);
            }
        }
        generateConstraintInfoForSquares(newSquares);

        if (state) {
            // A tightened mask follows from every letter and mask in the cross.
            addDepth(crossCulprits!, depth);
            for (let j = 0; j < newSquares.length; j++) {
                let sq = newSquares[j];
                if (!sq.content && sq.viableMask !== masksBefore![j]) {
                    unionInto(squareCulpritView(state, sq), crossCulprits!);
                }
            }
        }

        if (isWordFull(newSquares)) {
            let letters = getLettersFromSquares(newSquares);
            if (grid.usedWords.has(letters)) {
                if (state) {
                    for (let sq of newSquares) addSquareCulprits(state, state.failure, sq);
                    addDepth(state.failure, state.claims.get(letters)?.depth ?? -1);
                }
                return undefined;
            }
            claimWord(grid, letters, state, depth);
            claimed.push(letters);
        }
    }

    let filter = Globals.fillFilter;
    if (filter) {
        let likelyUsed = grid.likelyUsedCount ?? countLikelyGettableUsed(grid.usedWords);
        if (likelyUsed > filter.maxLikelyGettable) {
            if (state) {
                state.claims.forEach(claim => {
                    if (claim.countsTowardQuota) addDepth(state.failure, claim.depth);
                });
            }
            return undefined;
        }
    }

    return claimed;
}

function removeNonmatchingSectionCandidates(grid: GridState, newSquares: GridSquare[], chosenEntry: string) {
    let sectionCandidates = getSectionCandidatesFromKeys(mapKeys(grid.userFilledSectionCandidates));
    sectionCandidates.forEach(sc => {
        let section = Globals.sections!.get(sc.sectionId)!;
        newSquares.forEach((sq, i) => {
            if (sectionCandidateLetterAt(section, sc.sectionString, squareKey(sq)) !== chosenEntry[i])
                grid.userFilledSectionCandidates.delete(sectionCandidateKey(section, grid));
        });
    });
}
