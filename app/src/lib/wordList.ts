import { IndexedWordList } from "../models/IndexedWordList";
import { QualityClass } from "../models/QualityClass";
import Globals from './windowService';

export function loadPhilList() {
    loadWordList("Phil", "http://localhost/phil_wordlist.txt", parsePhilWordlist).then((wordList) => {
        Globals.wordList = wordList;
        console.log("Word List loaded");
    });
}

function parsePhilWordlist(lines: string[]): string[] {
    let map = new Map<string, QualityClass>();
    let words = [] as string[];

    lines.forEach(line => {
        if (!line.match(/^[A-Z]/)) return;

        map.set(line, QualityClass.Normal);
        words.push(line);
    });

    Globals.qualityClasses = map;

    return words;
}

export function loadPeterBrodaList() {
    loadWordList("Peter Broda", "http://localhost/peter-broda-wordlist__scored.txt", parsePeterBrodaWordlist).then((wordList) => {
        Globals.wordList = wordList;
        console.log("Word List loaded");
    });
}

function parsePeterBrodaWordlist(lines: string[]): string[] {
    let map = new Map<string, QualityClass>();
    let words = [] as string[];

    lines.forEach(line => {
        let tokens = line.trim().split(";");
        let score = +tokens[1];
        let qualityClass = score >= 55 ? QualityClass.Lively :
                           score >= 50 ? QualityClass.Normal :
                           score >= 40 ? QualityClass.Iffy : QualityClass.NotAThing;
        let word = tokens[0];
        if (qualityClass !== QualityClass.NotAThing && qualityClass !== QualityClass.Iffy //&& qualityClass !== QualityClass.Normal
                && word.length >= 2 && word.length <= 15 && word.match(/^[A-Z]+$/)) {
                    map.set(tokens[0], qualityClass);
                    words.push(tokens[0]);
                }
    });

    Globals.qualityClasses = map;

    return words;
}

export async function loadWordList(source: string, url: string, parserFunc: (lines: string[]) => string[]): Promise<IndexedWordList> {
    var startTime = new Date().getTime();
    var response = await fetch(url);
    var t2 = new Date().getTime();
    console.log((t2 - startTime) + " File downloaded");
    const lines = (await response.text()).split('\n');
    var t3 = new Date().getTime();
    console.log((t3 - startTime) + " Read into memory");
    var entries = parserFunc(lines);
    var t4 = new Date().getTime();
    console.log((t4 - startTime) + " Parsed into entries");
    var ret: IndexedWordList = {
        source: source,
        buckets: indexWordList(entries),
    }
    populateLengthBuckets(entries);
    var t5 = new Date().getTime();
    console.log((t5 - startTime) + " Finished indexing");

    return ret;
}

export function queryIndexedWordList(wl: IndexedWordList, 
    length: number, pos1: number, val1: string, pos2?: number, val2?: string): string[] {
    let words: string[];
    if (pos2 && val2) {
        words = wl.buckets.twoVal[length-2][pos1-1][pos2-(pos1+1)][val1.charCodeAt(0)-65][val2.charCodeAt(0)-65];
    }
    else {
        words = wl.buckets.oneVal[length-2][pos1-1][val1.charCodeAt(0)-65];
    }

    return words;
}

function indexWordList(entries: string[]): any {
    let ret = {
        oneVal: [] as any[],
        twoVal: [] as any[],
    };

    for (let length = 2; length <= 15; length++) {
        ret.oneVal.push([] as any[]);
        for (let pos1 = 1; pos1 <= length; pos1++) {
            ret.oneVal[length-2].push([] as any[]);
            for (let ch1 = 65; ch1 <= 90; ch1++) {
                ret.oneVal[length-2][pos1-1].push([] as string[]);
            }
        }
    }

    for (let length = 2; length <= 15; length++) {
        ret.twoVal.push([] as any[]);
        for (let pos1 = 1; pos1 <= length-1; pos1++) {
            ret.twoVal[length-2].push([] as any[]);
            for (let pos2 = pos1+1; pos2 <= length; pos2++) {
                ret.twoVal[length-2][pos1-1].push([] as any[]);
                for (let ch1 = 65; ch1 <= 90; ch1++) {
                    ret.twoVal[length-2][pos1-1][pos2-(pos1+1)].push([] as any[]);
                    for (let ch2 = 65; ch2 <= 90; ch2++) {
                        ret.twoVal[length-2][pos1-1][pos2-(pos1+1)][ch1-65].push([] as string[]);
                    }
                }
            }
        }
    }

    entries.forEach(word => {
        // 1-position entries
        for (let pos1 = 1; pos1 <= word.length; pos1++) {
            ret.oneVal[word.length-2][pos1-1][word[pos1-1].charCodeAt(0)-65].push(word);
        }

        // 2-position entries
        for (let pos1 = 1; pos1 < word.length; pos1++) {
            for (let pos2 = pos1 + 1; pos2 <= word.length; pos2++) {
                ret.twoVal[word.length-2][pos1-1][pos2-(pos1+1)][word[pos1-1].charCodeAt(0)-65][word[pos2-1].charCodeAt(0)-65].push(word);
            }
        }
    });

    return ret;
}

function populateLengthBuckets(entries: string[]) {
    Globals.lengthBuckets = new Map<number, string[]>();
    for (let length = 2; length <= 15; length++) {
        Globals.lengthBuckets.set(length, []);
    }

    entries.forEach(word => {
        Globals.lengthBuckets!.get(word.length)!.push(word);
    });
}

