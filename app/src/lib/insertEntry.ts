import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { WordDirection } from "../models/WordDirection";
import { getAllCrosses } from "./fill";
import { getLettersFromSquares } from "./grid";
import { sectionCandidateKey } from "./section";
import { deepClone, getSectionCandidatesFromKeys, getSquaresForWord, getUserFilledSectionCandidates, 
    getWordAtSquare, isUserOrWordFilled, isWordFull, mapKeys, otherDir, squareKey, wordKey } from "./util";
import Globals from './windowService';

export function processAndInsertChosenEntry(node: FillNode, contentType?: ContentType) {
    if (contentType === undefined) contentType = ContentType.Autofill;
    if (!node.chosenEntry) return false;

    let grid = deepClone(node.startGrid) as GridState;
    let word = node.fillWord!;
    let wordSquares = getSquaresForWord(grid, word);
    let crosses = getAllCrosses(grid, word);

    // for user word on top on another
    if (isWordFull(wordSquares)) {
        let existingPattern = getLettersFromSquares(wordSquares);
        grid.usedWords.delete(existingPattern);
    }

    removeNonmatchingSectionCandidates(grid, wordSquares, node.chosenEntry!.word);
    if (contentType === ContentType.ChosenWord)
        removeNonmatchingUserWords(grid, wordSquares, word, node.fillWord!.direction);

    // unchecked squares
    wordSquares.forEach((sq, i) => {
        if ((word.direction === WordDirection.Across && !crosses.find(c => c.start[1] === sq.col)) ||
            (word.direction === WordDirection.Down && !crosses.find(c => c.start[0] === sq.row))) {
            sq.content = node.chosenEntry!.word[i]; // contentType set farther down
        }
    });

    crosses.forEach(cross => {
        let newSquares = node.chosenEntry!.crossSquares.get(wordKey(cross))!;
        for(let i = 0; i < newSquares.length; i++) {
            let newSq = newSquares[i];
            grid.squares[newSq.row][newSq.col] = newSq;
        }
        if (isWordFull(newSquares)) {
            grid.usedWords.set(getLettersFromSquares(newSquares), true);
        }
    });

    wordSquares = getSquaresForWord(grid, word);
    wordSquares.forEach(sq => {
        if ([ContentType.Autofill, ContentType.ChosenSection].includes(sq.contentType))
            sq.contentType = contentType!;
    });
    grid.usedWords.set(getLettersFromSquares(wordSquares), true);
    node.endGrid = grid;
    node.iffyWordKey = node.chosenEntry!.iffyWordKey;
}

function removeNonmatchingUserWords(grid: GridState, newSquares: GridSquare[], chosenWord: GridWord, fillDir: WordDirection) {
    let sc = getUserFilledSectionCandidates(grid)
        .find(x => Globals.sections!.get(x.sectionId)!.squares.has(squareKey(newSquares[0])));

    newSquares.forEach(sq => {
        let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(fillDir))!;
        let crossSquares = getSquaresForWord(grid, cross);
        if (cross === chosenWord) return;
        crossSquares.forEach(crossSq => {
            let crossCross = getWordAtSquare(grid, crossSq.row, crossSq.col, fillDir);
            if (!crossCross || crossSquares.find(csq => !isUserOrWordFilled(csq))) {
                if (sc) {
                    sq.content = sc.grid.squares[sq.row][sq.col].content;
                    sq.contentType = ContentType.ChosenSection;
                }
                else {
                    sq.content = undefined;
                    sq.contentType = ContentType.Autofill;
                }
            }
        });
    });
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