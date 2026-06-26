import { IndexedWordList } from "../models/IndexedWordList";
import { QualityClass } from "../models/QualityClass";
import { WordList } from "../models/WordList";
import Globals from './windowService';

export async function processWordListData(filename: string, data: Blob): Promise<WordList | undefined> {
    let lines = (await data.text()).split("\n");
    let words = parseWordList(lines);
    indexWordList(words, Globals.wordList);

    return {
        filename: filename,
        wordCount: words.length,
    } as WordList;
}

export async function loadWordListFromLocalhost(url: string) {
    var response = await fetch(url);
    const lines = (await response.text()).split('\n');
    let words = parseWordList(lines);
    indexWordList(words, Globals.wordList);
    let filenameTokens = url.split("/");
    let filename = filenameTokens[filenameTokens.length - 1];

    Globals.wordLists = [];
    Globals.wordLists!.push({
        filename: filename,
        wordCount: words.length,
    });

    console.log("Word List loaded");
}

function parseWordList(lines: string[]): string[] {
    let qcMap = Globals.qualityClasses || new Map<string, QualityClass>();
    let words = [] as string[];

    lines.forEach(line => {
        let tokens = line.trim().split(";");
        if (tokens.length > 2) return;
        if (!tokens[0].match(/^[A-Z]+$/)) return;

        let score = tokens.length === 2 ? +tokens[1] : 50;
        let qualityClass = score >= 100 ? QualityClass.Lively :
                           score >= 50 ? QualityClass.Normal :
                           QualityClass.Crosswordese;
        let word = tokens[0];
        if (word.length >= 2 && word.length <= 15) {
            if (!qcMap.has(word)) words.push(word);
            qcMap.set(word, qualityClass);
        }
    });

    Globals.qualityClasses = qcMap;

    return words;
}

export function queryIndexedWordList(pattern: string): string[] {
    let wl = Globals.wordList!;
    let words = [] as string[];
    if (pattern.length > 15) return words;
    let letters = [] as [number, string][];
    let length = pattern.length;
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] !== "-") {
            letters.push([i+1, pattern[i]]);
        }
    }

    if (letters.length === 1) {
        words = wl.buckets.oneVal[length-2][letters[0][0]-1][letters[0][1].charCodeAt(0)-65];
    }
    else if (letters.length === pattern.length) {
        words = Globals.qualityClasses?.has(pattern) ? [pattern] : [];
    }
    else if (letters.length > 1) {
        let pos1: number;
        let pos2: number;
        let val1: string;
        let val2: string;

        if (letters.length === 2) {
            pos1 = letters[0][0];
            pos2 = letters[1][0];
            val1 = letters[0][1];
            val2 = letters[1][1];
        } else {
            let bestSize = Infinity;
            let bestI = 0;
            let bestJ = 1;
            for (let i = 0; i < letters.length; i++) {
                for (let j = i + 1; j < letters.length; j++) {
                    const p1 = letters[i][0];
                    const p2 = letters[j][0];
                    const bucket = wl.buckets.twoVal[length-2][p1-1][p2-(p1+1)]
                        [letters[i][1].charCodeAt(0)-65][letters[j][1].charCodeAt(0)-65];
                    if (bucket.length < bestSize) {
                        bestSize = bucket.length;
                        bestI = i;
                        bestJ = j;
                    }
                }
            }
            pos1 = letters[bestI][0];
            pos2 = letters[bestJ][0];
            val1 = letters[bestI][1];
            val2 = letters[bestJ][1];
        }

        words = wl.buckets.twoVal[length-2][pos1-1][pos2-(pos1+1)][val1.charCodeAt(0)-65][val2.charCodeAt(0)-65];

        for (let i = 0; i < letters.length; i++) {
            if (letters[i][0] === pos1 || letters[i][0] === pos2) continue;
            words = words.filter(w => w[letters[i][0]-1] === letters[i][1]);
        }
    }

    return words;
}

function indexWordList(entries: string[], existingList?: IndexedWordList) {
    let buckets = existingList ? existingList.buckets : {
        oneVal: [] as any[],
        twoVal: [] as any[],
    };

    for (let length = 2; length <= 15; length++) {
        buckets.oneVal.push([] as any[]);
        for (let pos1 = 1; pos1 <= length; pos1++) {
            buckets.oneVal[length-2].push([] as any[]);
            for (let ch1 = 65; ch1 <= 90; ch1++) {
                buckets.oneVal[length-2][pos1-1].push([] as string[]);
            }
        }
    }

    for (let length = 2; length <= 15; length++) {
        buckets.twoVal.push([] as any[]);
        for (let pos1 = 1; pos1 <= length-1; pos1++) {
            buckets.twoVal[length-2].push([] as any[]);
            for (let pos2 = pos1+1; pos2 <= length; pos2++) {
                buckets.twoVal[length-2][pos1-1].push([] as any[]);
                for (let ch1 = 65; ch1 <= 90; ch1++) {
                    buckets.twoVal[length-2][pos1-1][pos2-(pos1+1)].push([] as any[]);
                    for (let ch2 = 65; ch2 <= 90; ch2++) {
                        buckets.twoVal[length-2][pos1-1][pos2-(pos1+1)][ch1-65].push([] as string[]);
                    }
                }
            }
        }
    }

    entries.forEach(word => {
        // 1-position entries
        for (let pos1 = 1; pos1 <= word.length; pos1++) {
            buckets.oneVal[word.length-2][pos1-1][word[pos1-1].charCodeAt(0)-65].push(word);
        }

        // 2-position entries
        for (let pos1 = 1; pos1 < word.length; pos1++) {
            for (let pos2 = pos1 + 1; pos2 <= word.length; pos2++) {
                buckets.twoVal[word.length-2][pos1-1][pos2-(pos1+1)][word[pos1-1].charCodeAt(0)-65][word[pos2-1].charCodeAt(0)-65].push(word);
            }
        }
    });

    Globals.wordList = { buckets: buckets } as IndexedWordList;
}
