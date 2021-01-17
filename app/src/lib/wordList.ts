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

export function load5sMainList() {
    loadWordList("5s Main", "http://localhost/classifier/5s_main.txt", parse5sMainList).then((wordList) => {
        Globals.wordList = wordList;
        console.log("Word List loaded");
    });
}

export function loadMainPlusBroda() {
    loadWordList("Main Plus Broda", "http://localhost/classifier/mainPlusBroda.txt", parse5sMainList).then((wordList) => {
        Globals.wordList = wordList;
        console.log("Word List loaded");
    });
}

function parse5sMainList(lines: string[]): string[] {
    let map = new Map<string, QualityClass>();
    let words = [] as string[];

    lines.forEach(line => {
        let tokens = line.trim().split(";");
        if (tokens.length > 2) return;

        let score = +tokens[1];
        let qualityClass = score >= 60 ? QualityClass.Lively :
                           score >= 50 ? QualityClass.Normal :
                           score >= 40 ? QualityClass.Crosswordese : QualityClass.Iffy;
        let word = tokens[0];
        if (qualityClass !== QualityClass.Iffy //&& qualityClass !== QualityClass.Crosswordese // && qualityClass !== QualityClass.Iffy && qualityClass !== QualityClass.Normal
                && word.length >= 2 && word.length <= 15 && word.match(/^[A-Z]+$/) && !map.has(tokens[0])) {
                    map.set(tokens[0], qualityClass);
                    words.push(tokens[0]);
                }
    });

    Globals.qualityClasses = map;

    return words;
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
        if (qualityClass !== QualityClass.NotAThing// && qualityClass !== QualityClass.Iffy && qualityClass !== QualityClass.Normal
                && word.length >= 2 && word.length <= 15 && word.match(/^[A-Z]+$/) && !map.has(tokens[0])) {
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
    var t5 = new Date().getTime();
    console.log((t5 - startTime) + " Finished indexing");

    return ret;
}

export function queryIndexedWordList(pattern: string): string[] {
    let wl = Globals.wordList!;
    let words = [] as string[];
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
        let pos1 = letters[0][0];
        let pos2 = letters[1][0];
        let val1 = letters[0][1];
        let val2 = letters[1][1];
        words = wl.buckets.twoVal[length-2][pos1-1][pos2-(pos1+1)][val1.charCodeAt(0)-65][val2.charCodeAt(0)-65];

        for (let i = 2; i < letters.length; i++) {
            words = words.filter(w => w[letters[i][0]-1] === letters[i][1]);
        }
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
