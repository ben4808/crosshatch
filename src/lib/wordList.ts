import { FillFilter } from "../models/FillFilter";
import { WordList } from "../models/WordList";
import {
    DESIRABILITY_AVOID,
    DESIRABILITY_PREFER,
    GETTABLE_LIKELY,
    GETTABLE_MAYBE,
    classifyDesirability,
    classifyGettableNess,
} from "./crosswordListRatings";
import {
    attachPackedWordIndex,
    buildPackedWordIndex,
    findPackedWordId,
    getWordString,
    hasPackedWord,
    PackedWordIndex,
    queryPackedWordList,
    queryPackedWordsByLength,
    scanPackedSlot,
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

/** Maybe Gettable entries with Prefer desirability (fill seed words). */
export function maybePreferWords(): string[] {
    const out: string[] = [];
    const desirability = Globals.wordDesirability;
    Globals.wordGettable?.forEach((value, word) => {
        if (value === GETTABLE_MAYBE && desirability?.get(word) === DESIRABILITY_PREFER) out.push(word);
    });
    return out;
}

let fillSeedSet = new Set<string>();
let fillExemptSet = new Set<string>();

export function isLikelyGettable(word: string): boolean {
    if (Globals.likelyGettableSet) return Globals.likelyGettableSet.has(word);
    return Globals.wordGettable?.get(word) === GETTABLE_LIKELY;
}

/** Whether a used `word` counts toward the active fill's Likely Gettable quota. */
export function countsTowardLikelyQuota(word: string): boolean {
    return !fillExemptSet.has(word) && isLikelyGettable(word);
}

export function countLikelyGettableUsed(usedWords: Map<string, boolean>): number {
    let n = 0;
    usedWords.forEach((_, word) => {
        if (countsTowardLikelyQuota(word)) n++;
    });
    return n;
}

function isAvoidDesirability(word: string): boolean {
    return Globals.wordDesirability?.get(word) === DESIRABILITY_AVOID;
}

/**
 * Whether `word` may be placed by the active fill outside the seed slot.
 * The fill dictionary is already limited to Very / Likely / seed words.
 */
export function isAllowedFillWord(word: string, likelyUsedCount?: number): boolean {
    const filter = Globals.fillFilter;
    if (!filter) return true;
    if (fillSeedSet.has(word)) return false;

    if (isLikelyGettable(word)) {
        if (filter.maxLikelyGettable <= 0) return false;
        if (likelyUsedCount === undefined) return true;
        return likelyUsedCount < filter.maxLikelyGettable;
    }
    return true;
}

const FLAG_LIKELY = 1;
const FLAG_SEED = 2;

let wordFlags: Uint8Array | undefined;
let wordFlagsIndex: PackedWordIndex | undefined;
let wordFlagsFilter: FillFilter | undefined;

function getWordFlags(index: PackedWordIndex, filter: FillFilter): Uint8Array {
    if (wordFlags && wordFlagsIndex === index && wordFlagsFilter === filter) return wordFlags;
    const flags = new Uint8Array(index.wordCount);
    const mark = (words: Iterable<string>, bit: number) => {
        for (const word of words) {
            const id = findPackedWordId(index, word);
            if (id >= 0) flags[id] |= bit;
        }
    };
    mark(Globals.likelyGettableSet ?? filter.likelyWords, FLAG_LIKELY);
    mark(fillSeedSet, FLAG_SEED);
    wordFlags = flags;
    wordFlagsIndex = index;
    wordFlagsFilter = filter;
    return flags;
}

/**
 * Id-based equivalent of isAllowedFillWord for the current index and fill filter.
 * Returns undefined when every word is allowed (no filter active).
 */
export function fillWordIdFilter(likelyUsedCount: number): ((id: number) => boolean) | undefined {
    const filter = Globals.fillFilter;
    const index = Globals.wordList;
    if (!filter || !index) return undefined;
    const flags = getWordFlags(index, filter);
    const likelyAllowed = filter.maxLikelyGettable > 0 && likelyUsedCount < filter.maxLikelyGettable;
    return id => {
        const f = flags[id];
        if (f & FLAG_SEED) return false;
        if (f & FLAG_LIKELY) return likelyAllowed;
        return true;
    };
}

/** Whether the Likely Gettable quota is full, so no further Likely entries are allowed. */
export function isLikelyQuotaFull(likelyUsedCount: number): boolean {
    const filter = Globals.fillFilter;
    return !!filter && likelyUsedCount >= filter.maxLikelyGettable;
}

export function isFillSeedWord(word: string): boolean {
    return fillSeedSet.has(word);
}

export function wordsWithoutAvoid(words: string[]): string[] {
    return words.filter(word => !isAvoidDesirability(word));
}

export function installFillFilter(filter?: FillFilter) {
    if (filter && filter === Globals.fillFilter) return;
    Globals.fillFilter = filter;
    fillSeedSet = new Set(filter?.seedWords ?? []);
    fillExemptSet = new Set(filter?.exemptWords ?? []);
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
    // During a fill the packed index holds the restricted fill dictionary.
    if (Globals.knownWords && !Globals.fillFilter) return Globals.knownWords.has(word);
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

/** Visit ids of dictionary words fitting per-position letter masks; see scanPackedSlot. */
export function scanWordIds(masks: ArrayLike<number>, visit: (id: number) => boolean | void): boolean {
    if (!Globals.wordList) return false;
    return scanPackedSlot(Globals.wordList, masks, visit);
}

export function wordIdOf(word: string): number {
    if (!Globals.wordList) return -1;
    return findPackedWordId(Globals.wordList, word);
}

export function wordOfId(id: number): string {
    return getWordString(Globals.wordList!, id);
}

export type { WordIndexInitPayload };
