import { Entry } from "../models/Entry";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { IndexedWordList } from "../models/IndexedWordList";
import { WordDirection } from "../models/WordDirection";
import Globals from './windowService';

export function fill(grid: GridState) {
    let wl: IndexedWordList = Globals.wordList;

    let words = grid.words;
    let optionsByWord = new Map<number, Entry[]>();
    let mostContrainedKey = -1;
    for (let i = 0; i < words.length; i++) {
        if (!words[i].solverValue.includes("?")) continue;
        if (!words[i].solverValue.match(/[A-Z]/)) continue;

        let entries = getEntriesForWordValue(wl, words[i].solverValue);
        optionsByWord.set(i, entries);
        if (entries.length === 0) return;
        else if (mostContrainedKey === -1) mostContrainedKey = i;
        else if (entries.length < (optionsByWord.get(mostContrainedKey)||[]).length) mostContrainedKey = i;
    }
    if (optionsByWord.size === 0) return;

    let wordToFill = grid.words[mostContrainedKey];
    let newValue = (optionsByWord.get(mostContrainedKey)||[])[0].entry;
    insertEntryIntoGrid(grid, wordToFill, newValue);
}

function getEntriesForWordValue(wl: IndexedWordList, wordValue: string): Entry[] {
    let length = wordValue.length;

    let letters = [];
    for(let pos = 1; pos <= length; pos++) {
        let ltr = wordValue[pos-1];
        if (ltr !== "?") {
            letters.push([pos, ltr]);
        }
    }

    let possibles: Entry[] = [];
    for(let i = 0; i < letters.length; i+=2) {
        var key = i == letters.length-1 ? `${length},${letters[i][0]},${letters[i][1]}` : 
            `${length},${letters[i][0]},${letters[i][1]},${letters[i+1][0]},${letters[i+1][1]}`;
        let newPossibles = wl.buckets.get(key) || [];
        possibles = possibles.length === 0 ? newPossibles : intersectEntryLists(possibles, newPossibles);
    }

    return possibles;
}

function intersectEntryLists(list1: Entry[], list2: Entry[]): Entry[] {
    return list1.filter(value => list2.includes(value));
}

function insertEntryIntoGrid(grid: GridState, word: GridWord, newEntry: string) {
    let curPos = word.start;
    let curIndex = 0;
    while (!compareTuples(curPos, word.end)) {
        grid.squares[curPos[0]][curPos[1]].correctContent = newEntry[curIndex];
        grid.squares[curPos[0]][curPos[1]].solverContent = newEntry[curIndex];
        grid.squares[curPos[0]][curPos[1]].fillContent = newEntry[curIndex];

        curPos = word.direction == WordDirection.Across ?
            [curPos[0], curPos[1]+1] : [curPos[0]+1, curPos[1]];
        curIndex++;
    }
    grid.squares[curPos[0]][curPos[1]].correctContent = newEntry[curIndex];
    grid.squares[curPos[0]][curPos[1]].solverContent = newEntry[curIndex];
    grid.squares[curPos[0]][curPos[1]].fillContent = newEntry[curIndex];
}

function compareTuples(first: [number, number], second: [number, number]): boolean {
    return first[0] === second[0] && first[1] === second[1];
}