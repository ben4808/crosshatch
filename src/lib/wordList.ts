import { WordList } from "../models/WordList";
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
    let words = [] as string[];

    lines.forEach(line => {
        let tokens = line.trim().split(";");
        if (tokens.length > 2) return;
        if (!tokens[0].match(/^[A-Z]+$/)) return;

        let word = tokens[0];
        if (word.length >= 2 && word.length <= 15) {
            if (!known.has(word)) words.push(word);
            known.add(word);
        }
    });

    Globals.knownWords = known;
    return words;
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
