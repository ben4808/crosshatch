import { PackedWordIndex } from "../lib/sharedWordIndex";

/** Word list query index. Backed by a packed SharedArrayBuffer (or ArrayBuffer fallback). */
export type IndexedWordList = PackedWordIndex;
