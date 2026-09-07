import { WordList } from "../models/WordList";
import {
    DESIRABILITY_AVOID,
    DESIRABILITY_PREFER,
    GETTABLE_LIKELY,
    GETTABLE_MAYBE,
    GETTABLE_VERY,
    classifyDesirability,
    classifyGettableNess,
} from "./crosswordListRatings";
import {
    attachPackedWordIndex,
    buildPackedWordIndex,
    hasPackedWord,
    queryPackedWordList,
    queryPackedWordsByLength,
    wordIndexInitPayload,
    WordIndexInitPayload,
} from "./sharedWordIndex";
import Globals from './windowService';

export {
    DESIRABILITY_AVOID,
    DESIRABILITY_NORMAL,
    DESIRABILITY_PREFER,
    GETTABLE_LIKELY,
    GETTABLE_MAYBE,
    GETTABLE_NOT,
    GETTABLE_NOT_A_THING,
    GETTABLE_VERY,
} from "./crosswordListRatings";

export async function processWordListData(filename: string, data: Blob): Promise<WordList | undefined> {
    let lines = (await data.text()).split("\n");
    let words = parseWordList(lines);
    rebuildWordIndex();

    return {
        filename: filename,
        wordCount: words.length,
    } as WordList;
}

export async function loadWordListFromLocalhost(url: string) {
    var response = await fetch(url);
    const lines = (await response.text()).split('\n');
    let words = parseWordList(lines);
    rebuildWordIndex();
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
    let known = Globals.knownWords || new Set<string>();
    let gettable = Globals.wordGettable || new Map<string, string>();
    let desirability = Globals.wordDesirability || new Map<string, string>();
    let words = [] as string[];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].replace(/^\uFEFF/, "").trim();
        if (!line) continue;

        let tokens = splitCsvLine(line);
        if (tokens.length < 1) continue;

        let word = tokens[0].toUpperCase();
        if (i === 0 && word === "ENTRY") continue;
        if (!word.match(/^[A-Z]+$/)) continue;
        if (word.length < 2 || word.length > 15) continue;

        if (tokens.length >= 2 && tokens[1]) gettable.set(word, tokens[1].trim());
        if (tokens.length >= 3 && tokens[2]) desirability.set(word, tokens[2].trim());

        if (!known.has(word)) words.push(word);
        known.add(word);
    }

    Globals.knownWords = known;
    Globals.wordGettable = gettable;
    Globals.wordDesirability = desirability;
    rebuildLikelyGettableSet();
    return words;
}

export function applyCrosswordListRatings(
    fillWord: string,
    unityBucket: string | null | undefined,
    familiarityBucket: string | null | undefined,
    qualityBucket: string | null | undefined,
) {
    const word = fillWord.toUpperCase();
    if (!Globals.wordGettable) Globals.wordGettable = new Map<string, string>();
    if (!Globals.wordDesirability) Globals.wordDesirability = new Map<string, string>();
    Globals.wordGettable.set(word, classifyGettableNess(unityBucket, familiarityBucket));
    Globals.wordDesirability.set(word, classifyDesirability(qualityBucket));
    rebuildLikelyGettableSet();
}

export function removeCrosswordListWord(fillWord: string) {
    const word = fillWord.toUpperCase();
    Globals.knownWords?.delete(word);
    Globals.wordGettable?.delete(word);
    Globals.wordDesirability?.delete(word);
    rebuildLikelyGettableSet();
    rebuildWordIndex();
}

function rebuildLikelyGettableSet() {
    const set = new Set<string>();
    Globals.wordGettable?.forEach((value, word) => {
        if (value === GETTABLE_LIKELY) set.add(word);
    });
    Globals.likelyGettableSet = set;
}

export function wordsWithGettable(gettable: string): string[] {
    const out: string[] = [];
    Globals.wordGettable?.forEach((value, word) => {
        if (value === gettable) out.push(word);
    });
    return out;
}

export function pickRandomMaybePrefer5(): string | undefined {
    const candidates: string[] = [];
    const gettable = Globals.wordGettable;
    const desirability = Globals.wordDesirability;
    if (!gettable || !desirability) return undefined;

    gettable.forEach((value, word) => {
        if (word.length !== 5) return;
        if (value !== GETTABLE_MAYBE) return;
        if (desirability.get(word) !== DESIRABILITY_PREFER) return;
        candidates.push(word);
    });
    if (candidates.length === 0) return undefined;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export function isLikelyGettable(word: string): boolean {
    if (Globals.likelyGettableSet) return Globals.likelyGettableSet.has(word);
    return Globals.wordGettable?.get(word) === GETTABLE_LIKELY;
}

export function countLikelyGettableUsed(usedWords: Map<string, boolean>): number {
    let n = 0;
    usedWords.forEach((_, word) => {
        if (isLikelyGettable(word)) n++;
    });
    return n;
}

function isAvoidDesirability(word: string): boolean {
    return Globals.wordDesirability?.get(word) === DESIRABILITY_AVOID;
}

/** Whether `word` may be used as a new fill entry under the active Make 5x5 filter. */
export function isAllowedFillWord(word: string, usedWords?: Map<string, boolean>): boolean {
    const filter = Globals.fillFilter;
    if (!filter) return true;
    if (isAvoidDesirability(word)) return false;

    if (isLikelyGettable(word)) {
        if (filter.maxLikelyGettable <= 0) return false;
        if (!usedWords) return true;
        return countLikelyGettableUsed(usedWords) < filter.maxLikelyGettable;
    }

    const gettable = Globals.wordGettable?.get(word);
    if (gettable === GETTABLE_VERY || gettable === undefined) return true;
    return false;
}

export function wordsWithoutAvoid(words: string[]): string[] {
    return words.filter(word => !isAvoidDesirability(word));
}

export function installFillFilter(filter?: { maxLikelyGettable: number; likelyWords: string[] }) {
    Globals.fillFilter = filter;
    if (filter) {
        Globals.likelyGettableSet = new Set(filter.likelyWords);
    } else {
        rebuildLikelyGettableSet();
    }
}

function splitCsvLine(line: string): string[] {
    let fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        let ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            fields.push(current.trim());
            current = "";
        } else {
            current += ch;
        }
    }
    fields.push(current.trim());
    return fields;
}

/** Rebuild the packed shared index from Globals.knownWords. */
export function rebuildWordIndex() {
    const known = Globals.knownWords;
    if (!known || known.size === 0) {
        Globals.wordList = undefined;
        return;
    }
    Globals.wordList = buildPackedWordIndex(Array.from(known));
}

/** Attach a packed index received by a fill worker. */
export function installWordIndexFromPayload(payload: WordIndexInitPayload) {
    const index = attachPackedWordIndex(payload);
    Globals.wordList = index;
    // Workers look up membership via the packed index; no separate Set needed.
    Globals.knownWords = undefined;
}

export { buildPackedWordIndex };

export function getWordIndexInitPayload(): WordIndexInitPayload | undefined {
    if (!Globals.wordList) return undefined;
    return wordIndexInitPayload(Globals.wordList);
}

export function isKnownWord(word: string): boolean {
    if (Globals.knownWords) return Globals.knownWords.has(word);
    if (!Globals.wordList) return false;
    return hasPackedWord(Globals.wordList, word);
}

export function queryIndexedWordList(pattern: string): string[] {
    if (!Globals.wordList) return [];
    return queryPackedWordList(Globals.wordList, pattern);
}

/** All dictionary words of a given length. */
export function queryWordsByLength(length: number): string[] {
    if (!Globals.wordList) return [];
    return queryPackedWordsByLength(Globals.wordList, length);
}

export type { WordIndexInitPayload };
