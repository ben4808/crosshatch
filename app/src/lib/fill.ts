import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { WordDirection } from "../models/WordDirection";
import { average, compareTuples, getWordSquares, indexedWordListLookup } from "./util";
import Globals from './windowService';

export function fillWord(grid: GridState) {
    // let wl: IndexedWordList = Globals.wordList;

    // let wordToFill = getMostConstrainedWord(grid, wl);
    // if (!wordToFill) return;

    // let fillOptions = indexedWordListLookup(wl, grid, wordToFill);

    // fillOptions.forEach(op => {

    // });

    //let wordToFill = grid.words[mostContrainedKey];
    //let newValue = (optionsByWord.get(mostContrainedKey)||[])[0].entry;
    //insertEntryIntoGrid(grid, wordToFill, newValue);
}

function getMostConstrainedWord(grid: GridState, wl: IndexedWordList): GridWord | undefined {
    let words = grid.words;
    
    let mostConstrainedKey = -1;
    let mostConstrainedScore = 1e8;
    for (let i = 0; i < words.length; i++) {
        let squares = getWordSquares(grid, words[i]);
        if (!squares.find(x => x.fillContent)) continue;
        if (!squares.find(x => !x.fillContent)) continue;

        var constraintScore = getWordConstraintScore(squares);
        if (constraintScore >= 0 && constraintScore < mostConstrainedScore) {
            mostConstrainedKey = i;
            mostConstrainedScore = constraintScore;
        }
    }
    
    if (mostConstrainedKey === -1) return undefined;
    return words[mostConstrainedKey];
}

function getWordConstraintScore(squares: GridSquare[]): number {
    if(squares[0].constraintSum === -1) return -1;

    return average(squares.filter(x => !x.fillContent).map(x => x.constraintSum));
}

function insertEntryIntoGrid(grid: GridState, word: GridWord, newEntry: string) {
    let curPos = word.start;
    let curIndex = 0;
    while (!compareTuples(curPos, word.end)) {
        grid.squares[curPos[0]][curPos[1]].correctContent = newEntry[curIndex];
        grid.squares[curPos[0]][curPos[1]].fillContent = newEntry[curIndex];

        curPos = word.direction === WordDirection.Across ?
            [curPos[0], curPos[1]+1] : [curPos[0]+1, curPos[1]];
        curIndex++;
    }
    grid.squares[curPos[0]][curPos[1]].correctContent = newEntry[curIndex];
    grid.squares[curPos[0]][curPos[1]].fillContent = newEntry[curIndex];
}
