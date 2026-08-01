import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { FillSearchState, FillTrailOp } from "../models/FillSearchState";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { getUnfilledCrosses } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { sectionCandidateKey, sectionCandidateLetterAt } from "./section";
import { cloneGridForFill, getSectionCandidatesFromKeys, getSquaresForWord, isWordFull, mapKeys, letterBit, squareKey } from "./util";
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
 * Trail-aware placement for autofill search. Pushes undo ops before mutating.
 * Returns claimed words, or undefined on failure (trail restored to mark).
 */
export function placeEntryWithTrail(
    state: FillSearchState,
    word: GridWord,
    entryWord: string,
    contentType: ContentType = ContentType.Autofill,
): string[] | undefined {
    let mark = state.trail.length;
    let claimed = placeEntryOnGrid(state.grid, word, entryWord, contentType, state.trail);
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
            sq.content = op.content;
            sq.contentType = op.contentType;
            sq.viableMask = op.viableMask;
        } else {
            grid.usedWords.delete(op.word);
        }
    }
}

function pushSquareTrail(trail: FillTrailOp[] | undefined, sq: GridSquare) {
    if (!trail) return;
    trail.push({
        kind: "sq",
        row: sq.row,
        col: sq.col,
        content: sq.content,
        contentType: sq.contentType,
        viableMask: sq.viableMask,
    });
}

function placeEntryOnGrid(
    grid: GridState,
    word: GridWord,
    entryWord: string,
    contentType: ContentType,
    trail?: FillTrailOp[],
): string[] | undefined {
    let wordSquares = getSquaresForWord(grid, word);

    if (grid.usedWords.has(entryWord)) {
        return undefined;
    }

    let crosses = getUnfilledCrosses(grid, word);
    let claimed = [entryWord];

    for (let i = 0; i < wordSquares.length; i++) {
        let sq = wordSquares[i];
        pushSquareTrail(trail, sq);
        sq.content = entryWord[i];
        sq.viableMask = letterBit(entryWord[i]);
        if ([ContentType.Autofill, ContentType.ChosenSection, ContentType.HoverChosenWord].includes(sq.contentType))
            sq.contentType = contentType;
    }

    if (trail) {
        trail.push({ kind: "used", word: entryWord });
    }
    grid.usedWords.set(entryWord, true);

    if (contentType === ContentType.ChosenWord) {
        removeNonmatchingSectionCandidates(grid, wordSquares, entryWord);
    }

    for (let cross of crosses) {
        let newSquares = getSquaresForWord(grid, cross);
        if (trail) {
            for (let sq of newSquares) {
                if (!sq.content) pushSquareTrail(trail, sq);
            }
        }
        generateConstraintInfoForSquares(newSquares);

        if (isWordFull(newSquares)) {
            let letters = getLettersFromSquares(newSquares);
            if (grid.usedWords.has(letters)) {
                return undefined;
            }
            if (trail) trail.push({ kind: "used", word: letters });
            grid.usedWords.set(letters, true);
            claimed.push(letters);
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
