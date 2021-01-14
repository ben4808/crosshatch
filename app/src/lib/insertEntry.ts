import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { SectionCandidate } from "../models/SectionCandidate";
import { WordDirection } from "../models/WordDirection";
import { getChangedCrosses, getPositionOfCross, getUnfilledCrosses } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { sectionCandidateKey } from "./section";
import { deepClone, getSectionCandidatesFromKeys, getSquaresForWord, getWordAtSquare, isUserOrWordFilled, 
    isWordFull, mapKeys, otherDir, wordKey } from "./util";
import Globals from './windowService';

export function processAndInsertChosenEntry(node: FillNode, contentType?: ContentType): boolean {
    if (contentType === undefined) contentType = ContentType.Autofill;
    if (!node.chosenEntry) return false;

    let grid = deepClone(node.startGrid) as GridState;
    let word = node.fillWord!;
    let chosenEntry = node.chosenEntry!;
    let wordSquares = getSquaresForWord(grid, word);
    if (isWordFull(wordSquares)) {
        let existingPattern = getLettersFromSquares(wordSquares);
        grid.usedWords.delete(existingPattern);
    }
    let newCrossSquares = [] as GridSquare[][];
    let crosses = getUnfilledCrosses(grid, word);
    crosses = crosses.concat(getChangedCrosses(grid, word, node.chosenEntry!.word));

    let sectionCandidates = getSectionCandidatesFromKeys(mapKeys(grid.userFilledSectionCandidates));
    sectionCandidates.forEach(sc => {
        let section = Globals.sections!.get(sc.sectionId)!;
        wordSquares.forEach((sq, i) => {
            if (sc.grid.squares[sq.row][sq.col].content !== node.chosenEntry!.word[i])
                grid.userFilledSectionCandidates.delete(sectionCandidateKey(section, grid));
        });
    });

    let foundZero = !!node.iffyWordKey;
    let zeroCrossKey = undefined as string | undefined;

    // unchecked squares
    wordSquares.forEach((sq, i) => {
        if ((word.direction === WordDirection.Across && !crosses.find(c => c.start[1] === sq.col)) ||
            (word.direction === WordDirection.Down && !crosses.find(c => c.start[0] === sq.row))) {
            sq.content = chosenEntry.word[i];
        }
    });

    crosses.forEach(cross => {
        let crossKey = wordKey(cross);
        let crossSquares = getSquaresForWord(grid, cross);
        let crossPos = getPositionOfCross(wordSquares, crossSquares, word.direction);
        let newSquares = deepClone(crossSquares) as GridSquare[];
        let newCharPos = word.direction === WordDirection.Across ?
            wordSquares.findIndex(sq => sq.col === cross.start[1])! :
            wordSquares.findIndex(sq => sq.row === cross.start[0])!;
        if (contentType !== ContentType.Autofill)
            removeNonmatchingUserWords(grid, newSquares[crossPos], chosenEntry.word[newCharPos], 
                word.direction, sectionCandidates.length > 0 ? sectionCandidates[0] : undefined, contentType!);
        newSquares[crossPos].content = chosenEntry.word[newCharPos];
        generateConstraintInfoForSquares(grid, newSquares);
        newCrossSquares.push(newSquares);

        newSquares.forEach(sq => {
            if (crossKey !== node.iffyWordKey && sq.constraintInfo!.isCalculated && sq.constraintInfo!.sumTotal === 0) {
                if (!foundZero && crossSquares.length < 5) {
                    foundZero = true;
                    zeroCrossKey = crossKey;
                }
                else return false;
            }
        });
    });

    crosses.forEach((cross, i) => {
        let crossSquares = getSquaresForWord(grid, cross);
        let newSquares = newCrossSquares[i];
        for(let j = 0; j < crossSquares.length; j++) {
            let crossSquare = crossSquares[j];
            grid.squares[crossSquare.row][crossSquare.col] = newSquares[j];
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
    if (zeroCrossKey) node.iffyWordKey = zeroCrossKey;
    return true;
}

function removeNonmatchingUserWords(grid: GridState, sq: GridSquare, newContent: string, 
        fillDir: WordDirection, sc: SectionCandidate | undefined, contentType: ContentType) {
    if (!sq.content || sq.content === newContent) return;
    
    if (sq.contentType === ContentType.ChosenWord) {
        let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(fillDir))!;
        let crossSquares = getSquaresForWord(grid, cross);
        crossSquares.forEach(crossSq => {
            if (crossSq === sq) return;

            let crossCross = getWordAtSquare(grid, crossSq.row, crossSq.col, fillDir);
            if (!crossCross || !crossSquares.find(csq => !isUserOrWordFilled(csq))) {
                if (sc)
                    sq.content = sc.grid.squares[sq.row][sq.col].content;
                else
                    sq.content = undefined;
                sq.contentType = contentType;
            }
        });
    }
}