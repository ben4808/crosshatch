import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { getAllCrosses } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { sectionCandidateKey } from "./section";
import { deepClone, getSectionCandidatesFromKeys, getSquaresForWord, isWordFull, mapKeys } from "./util";
import Globals from './windowService';

export function processAndInsertChosenEntry(node: FillNode, contentType?: ContentType) {
    if (contentType === undefined) contentType = ContentType.Autofill;
    if (!node.chosenEntry) return false;

    let grid = deepClone(node.startGrid) as GridState;
    let word = node.fillWord!;
    let wordSquares = getSquaresForWord(grid, word);
    let crosses = getAllCrosses(grid, word);

    wordSquares.forEach((sq, i) => {
        sq.content = node.chosenEntry!.word[i];
        if ([ContentType.Autofill, ContentType.ChosenSection, ContentType.HoverChosenWord].includes(sq.contentType))
            sq.contentType = contentType!;
    });
    grid.usedWords.set(getLettersFromSquares(wordSquares), true);
    node.iffyWordKey = node.chosenEntry!.iffyWordKey;

    if (contentType === ContentType.ChosenWord) {
        removeNonmatchingSectionCandidates(grid, wordSquares, node.chosenEntry!.word);
    }  

    crosses.forEach(cross => {
        let newSquares = getSquaresForWord(grid, cross);
        generateConstraintInfoForSquares(newSquares);

        if (isWordFull(newSquares)) {
            grid.usedWords.set(getLettersFromSquares(newSquares), true);
        }
    });
    
    node.endGrid = grid;
}

function removeNonmatchingSectionCandidates(grid: GridState, newSquares: GridSquare[], chosenEntry: string) {
    let sectionCandidates = getSectionCandidatesFromKeys(mapKeys(grid.userFilledSectionCandidates));
    sectionCandidates.forEach(sc => {
        let section = Globals.sections!.get(sc.sectionId)!;
        newSquares.forEach((sq, i) => {
            if (sc.grid.squares[sq.row][sq.col].content !== chosenEntry[i])
                grid.userFilledSectionCandidates.delete(sectionCandidateKey(section, grid));
        });
    });
}
