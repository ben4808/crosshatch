import {
    DESIRABILITY_NORMAL,
    GETTABLE_MAYBE,
    decodeDesirability,
    decodeGettableNess,
} from "../lib/crosswordListRatings";
import { IndexedWordList } from "../models/IndexedWordList";
import { installFillFilter, rebuildWordIndex } from "../lib/wordList";
import Globals from "../lib/windowService";
import { decryptCrosswordList } from "./chacha20";

/**
 * Served by the dev server (see src/setupProxy.js), which reads
 * C:\Users\ben_z\Desktop\crossword_lists\list.enc from disk. Browsers can't open that path directly.
 */
const LOCAL_LIST_URL = "/magic-list/list.enc";
const REMOTE_LIST_URL = "https://magic-crossword.s3.us-west-2.amazonaws.com/list.enc";

let loadPromise: Promise<void> | undefined;
/**
 * The packed index of the whole list. A fill temporarily swaps Globals.wordList for a
 * restricted dictionary, so the full one is kept here to restore it from.
 */
let fullWordIndex: IndexedWordList | undefined;

export function getFullWordIndex(): IndexedWordList | undefined {
    return fullWordIndex;
}

export function isRunningLocally(): boolean {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function isWordListLoaded(): boolean {
    return !!Globals.wordList && !!Globals.knownWords && Globals.knownWords.size > 0;
}

/** Loads (once) and decrypts the crossword list into the shared word-list globals. */
export function ensureMagicWordList(): Promise<void> {
    if (isWordListLoaded()) return Promise.resolve();
    if (!loadPromise) {
        loadPromise = loadWordList().catch(err => {
            // Allow a later attempt to retry after a failure.
            loadPromise = undefined;
            throw err;
        });
    }
    return loadPromise;
}

async function loadWordList() {
    const url = isRunningLocally() ? LOCAL_LIST_URL : REMOTE_LIST_URL;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Couldn't load the word list (${response.status}).`);
    const encrypted = new Uint8Array(await response.arrayBuffer());
    parseList(decryptCrosswordList(encrypted));
}

/** Row format: entry,gettableness,desirability */
function parseList(text: string) {
    const known = new Set<string>();
    const gettable = new Map<string, string>();
    const desirability = new Map<string, string>();

    const lines = text.split("\n");
    for (const rawLine of lines) {
        const line = rawLine.replace(/^\uFEFF/, "").trim();
        if (!line) continue;

        const tokens = line.split(",");
        const entry = tokens[0].trim().toUpperCase();
        if (entry === "ENTRY") continue; // header row
        if (!/^[A-Z]+$/.test(entry) || entry.length < 2 || entry.length > 15) continue;

        known.add(entry);
        // Unset gettableness defaults to Maybe Gettable, matching the extractor.
        gettable.set(entry, decodeGettableNess(tokens[1]) ?? GETTABLE_MAYBE);
        desirability.set(entry, decodeDesirability(tokens[2]) ?? DESIRABILITY_NORMAL);
    }

    if (known.size === 0) throw new Error("The word list was empty or couldn't be decrypted.");

    Globals.knownWords = known;
    Globals.wordGettable = gettable;
    Globals.wordDesirability = desirability;
    Globals.wordAbbr = new Set<string>();
    Globals.wordSensitive = new Set<string>();
    Globals.wordCrosswordese = new Set<string>();
    Globals.wordOverused = new Set<string>();
    Globals.wordRegionalism = new Set<string>();
    // Rebuilds the Likely Gettable set from the new ratings.
    installFillFilter(undefined);
    rebuildWordIndex();
    fullWordIndex = Globals.wordList;
}
