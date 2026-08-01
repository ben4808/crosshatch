/** Packed word-list index stored in SharedArrayBuffer (or ArrayBuffer fallback). */

const MIN_LEN = 2;
const MAX_LEN = 15;
const LEN_COUNT = MAX_LEN - MIN_LEN + 1; // 14
const LETTERS = 26;

/** oneVal slots: for each length L, L positions × 26 letters. */
export const ONE_KEY_COUNT = (() => {
    let n = 0;
    for (let L = MIN_LEN; L <= MAX_LEN; L++) n += L * LETTERS;
    return n;
})();

/** twoVal slots: for each length L, C(L,2) position pairs × 26 × 26. */
export const TWO_KEY_COUNT = (() => {
    let n = 0;
    for (let L = MIN_LEN; L <= MAX_LEN; L++) n += ((L * (L - 1)) / 2) * LETTERS * LETTERS;
    return n;
})();

const oneKeyOffsetByLength: number[] = (() => {
    const offsets: number[] = [];
    let o = 0;
    for (let L = MIN_LEN; L <= MAX_LEN; L++) {
        offsets.push(o);
        o += L * LETTERS;
    }
    return offsets;
})();

const twoKeyOffsetByLength: number[] = (() => {
    const offsets: number[] = [];
    let o = 0;
    for (let L = MIN_LEN; L <= MAX_LEN; L++) {
        offsets.push(o);
        o += ((L * (L - 1)) / 2) * LETTERS * LETTERS;
    }
    return offsets;
})();

export interface WordIndexBuffers {
    wordChars: SharedArrayBuffer | ArrayBuffer;
    wordOffsets: SharedArrayBuffer | ArrayBuffer;
    byLengthStart: SharedArrayBuffer | ArrayBuffer;
    byLengthCount: SharedArrayBuffer | ArrayBuffer;
    oneStarts: SharedArrayBuffer | ArrayBuffer;
    oneCounts: SharedArrayBuffer | ArrayBuffer;
    oneWordIds: SharedArrayBuffer | ArrayBuffer;
    twoStarts: SharedArrayBuffer | ArrayBuffer;
    twoCounts: SharedArrayBuffer | ArrayBuffer;
    twoWordIds: SharedArrayBuffer | ArrayBuffer;
}

/** Serializable payload posted to workers (views rebuilt on attach). */
export interface WordIndexInitPayload {
    wordCount: number;
    isShared: boolean;
    buffers: WordIndexBuffers;
}

export interface PackedWordIndex extends WordIndexInitPayload {
    wordChars: Uint8Array;
    wordOffsets: Uint32Array;
    byLengthStart: Uint32Array;
    byLengthCount: Uint32Array;
    oneStarts: Uint32Array;
    oneCounts: Uint32Array;
    oneWordIds: Uint32Array;
    twoStarts: Uint32Array;
    twoCounts: Uint32Array;
    twoWordIds: Uint32Array;
    /** Per-realm lazy decode cache (not shared across workers). */
    wordCache: (string | undefined)[];
}

const EMPTY: string[] = [];

export function canUseSharedArrayBuffer(): boolean {
    return typeof SharedArrayBuffer !== "undefined"
        && typeof crossOriginIsolated !== "undefined"
        && crossOriginIsolated === true;
}

function alloc(byteLength: number, useShared: boolean): SharedArrayBuffer | ArrayBuffer {
    if (useShared) {
        try {
            return new SharedArrayBuffer(byteLength);
        } catch {
            // fall through
        }
    }
    return new ArrayBuffer(byteLength);
}

function letterCode(ch: string): number {
    return ch.charCodeAt(0) - 65; // A=0 … Z=25
}

export function oneKeyIndex(length: number, pos: number, letter: number): number {
    return oneKeyOffsetByLength[length - MIN_LEN] + (pos - 1) * LETTERS + letter;
}

/** pos1 < pos2, both 1-based; letter codes 0-25. */
export function twoKeyIndex(
    length: number,
    pos1: number,
    pos2: number,
    ch1: number,
    ch2: number,
): number {
    // pairIndex among (i,j) with 1 <= i < j <= length
    const i = pos1 - 1;
    const j = pos2 - 1;
    const pairIndex = (i * (2 * length - i - 1)) / 2 + (j - i - 1);
    return twoKeyOffsetByLength[length - MIN_LEN]
        + pairIndex * LETTERS * LETTERS
        + ch1 * LETTERS
        + ch2;
}

function attachViews(payload: WordIndexInitPayload): PackedWordIndex {
    return {
        ...payload,
        wordChars: new Uint8Array(payload.buffers.wordChars),
        wordOffsets: new Uint32Array(payload.buffers.wordOffsets),
        byLengthStart: new Uint32Array(payload.buffers.byLengthStart),
        byLengthCount: new Uint32Array(payload.buffers.byLengthCount),
        oneStarts: new Uint32Array(payload.buffers.oneStarts),
        oneCounts: new Uint32Array(payload.buffers.oneCounts),
        oneWordIds: new Uint32Array(payload.buffers.oneWordIds),
        twoStarts: new Uint32Array(payload.buffers.twoStarts),
        twoCounts: new Uint32Array(payload.buffers.twoCounts),
        twoWordIds: new Uint32Array(payload.buffers.twoWordIds),
        wordCache: new Array(payload.wordCount),
    };
}

/** Rebuild typed views + local decode cache from a posted payload. */
export function attachPackedWordIndex(payload: WordIndexInitPayload): PackedWordIndex {
    return attachViews(payload);
}

export function getWordString(index: PackedWordIndex, wordId: number): string {
    let s = index.wordCache[wordId];
    if (s !== undefined) return s;
    const start = index.wordOffsets[wordId];
    const end = index.wordOffsets[wordId + 1];
    const chars = index.wordChars;
    let out = "";
    for (let i = start; i < end; i++) {
        out += String.fromCharCode(65 + chars[i]);
    }
    index.wordCache[wordId] = out;
    return out;
}

function compareToString(index: PackedWordIndex, wordId: number, word: string): number {
    const start = index.wordOffsets[wordId];
    const len = index.wordOffsets[wordId + 1] - start;
    for (let i = 0; i < len; i++) {
        const d = index.wordChars[start + i] - letterCode(word[i]);
        if (d !== 0) return d;
    }
    return 0;
}

export function hasPackedWord(index: PackedWordIndex, word: string): boolean {
    const L = word.length;
    if (L < MIN_LEN || L > MAX_LEN) return false;
    const li = L - MIN_LEN;
    let lo = index.byLengthStart[li];
    let hi = lo + index.byLengthCount[li] - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const cmp = compareToString(index, mid, word);
        if (cmp === 0) return true;
        if (cmp < 0) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}

function wordHasLetter(index: PackedWordIndex, wordId: number, pos1based: number, letter: number): boolean {
    return index.wordChars[index.wordOffsets[wordId] + pos1based - 1] === letter;
}

function decodeBucket(index: PackedWordIndex, ids: Uint32Array, start: number, count: number): string[] {
    if (count === 0) return EMPTY;
    const out = new Array<string>(count);
    for (let i = 0; i < count; i++) {
        out[i] = getWordString(index, ids[start + i]);
    }
    return out;
}

function filterBucket(
    index: PackedWordIndex,
    ids: Uint32Array,
    start: number,
    count: number,
    letters: [number, string][],
    skipA: number,
    skipB: number,
): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const id = ids[start + i];
        let ok = true;
        for (let li = 0; li < letters.length; li++) {
            const pos = letters[li][0];
            if (pos === skipA || pos === skipB) continue;
            if (!wordHasLetter(index, id, pos, letterCode(letters[li][1]))) {
                ok = false;
                break;
            }
        }
        if (ok) out.push(getWordString(index, id));
    }
    return out;
}

/** Pattern query over the packed index (same semantics as the old Map buckets). */
export function queryPackedWordList(index: PackedWordIndex, pattern: string): string[] {
    if (pattern.length > MAX_LEN || pattern.length < MIN_LEN) return EMPTY;

    const letters: [number, string][] = [];
    const length = pattern.length;
    for (let i = 0; i < length; i++) {
        if (pattern[i] !== "-") letters.push([i + 1, pattern[i]]);
    }

    if (letters.length === 0) {
        return EMPTY;
    }

    if (letters.length === length) {
        return hasPackedWord(index, pattern) ? [pattern] : EMPTY;
    }

    if (letters.length === 1) {
        const pos = letters[0][0];
        const ch = letterCode(letters[0][1]);
        const key = oneKeyIndex(length, pos, ch);
        return decodeBucket(index, index.oneWordIds, index.oneStarts[key], index.oneCounts[key]);
    }

    let pos1: number;
    let pos2: number;
    let val1: number;
    let val2: number;

    if (letters.length === 2) {
        pos1 = letters[0][0];
        pos2 = letters[1][0];
        val1 = letterCode(letters[0][1]);
        val2 = letterCode(letters[1][1]);
    } else {
        let bestSize = Infinity;
        let bestI = 0;
        let bestJ = 1;
        for (let i = 0; i < letters.length; i++) {
            for (let j = i + 1; j < letters.length; j++) {
                const p1 = letters[i][0];
                const p2 = letters[j][0];
                const key = twoKeyIndex(
                    length, p1, p2, letterCode(letters[i][1]), letterCode(letters[j][1]),
                );
                const size = index.twoCounts[key];
                if (size < bestSize) {
                    bestSize = size;
                    bestI = i;
                    bestJ = j;
                }
            }
        }
        pos1 = letters[bestI][0];
        pos2 = letters[bestJ][0];
        val1 = letterCode(letters[bestI][1]);
        val2 = letterCode(letters[bestJ][1]);
    }

    const key = twoKeyIndex(length, pos1, pos2, val1, val2);
    const start = index.twoStarts[key];
    const count = index.twoCounts[key];
    if (letters.length === 2) {
        return decodeBucket(index, index.twoWordIds, start, count);
    }
    return filterBucket(index, index.twoWordIds, start, count, letters, pos1, pos2);
}

export function queryPackedWordsByLength(index: PackedWordIndex, length: number): string[] {
    if (length < MIN_LEN || length > MAX_LEN) return EMPTY;
    const li = length - MIN_LEN;
    const start = index.byLengthStart[li];
    const count = index.byLengthCount[li];
    if (count === 0) return EMPTY;
    const out = new Array<string>(count);
    for (let i = 0; i < count; i++) {
        out[i] = getWordString(index, start + i);
    }
    return out;
}

/**
 * Build a packed index from a flat word list. Words should be A-Z only, length 2–15.
 * Uses SharedArrayBuffer when cross-origin isolated; otherwise ArrayBuffer.
 */
export function buildPackedWordIndex(words: string[]): PackedWordIndex {
    const useShared = canUseSharedArrayBuffer();

    // Group + sort by length for binary search and contiguous byLength ranges.
    const byLen: string[][] = [];
    for (let i = 0; i < LEN_COUNT; i++) byLen.push([]);
    for (const w of words) {
        if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
        byLen[w.length - MIN_LEN].push(w);
    }
    for (let i = 0; i < LEN_COUNT; i++) byLen[i].sort();

    let wordCount = 0;
    let charCount = 0;
    for (let i = 0; i < LEN_COUNT; i++) {
        wordCount += byLen[i].length;
        charCount += byLen[i].length * (i + MIN_LEN);
    }

    // Temporary JS bucket lists to count / fill.
    const oneBuckets: number[][] = new Array(ONE_KEY_COUNT);
    const twoBuckets: number[][] = new Array(TWO_KEY_COUNT);
    for (let i = 0; i < ONE_KEY_COUNT; i++) oneBuckets[i] = [];
    for (let i = 0; i < TWO_KEY_COUNT; i++) twoBuckets[i] = [];

    const wordCharsBuf = alloc(charCount, useShared);
    const wordOffsetsBuf = alloc((wordCount + 1) * 4, useShared);
    const byLengthStartBuf = alloc(LEN_COUNT * 4, useShared);
    const byLengthCountBuf = alloc(LEN_COUNT * 4, useShared);

    const wordChars = new Uint8Array(wordCharsBuf);
    const wordOffsets = new Uint32Array(wordOffsetsBuf);
    const byLengthStart = new Uint32Array(byLengthStartBuf);
    const byLengthCount = new Uint32Array(byLengthCountBuf);

    let wordId = 0;
    let charAt = 0;
    for (let li = 0; li < LEN_COUNT; li++) {
        const L = li + MIN_LEN;
        const group = byLen[li];
        byLengthStart[li] = wordId;
        byLengthCount[li] = group.length;

        for (let gi = 0; gi < group.length; gi++) {
            const word = group[gi];
            wordOffsets[wordId] = charAt;
            for (let p = 0; p < L; p++) {
                const code = letterCode(word[p]);
                wordChars[charAt++] = code;
                oneBuckets[oneKeyIndex(L, p + 1, code)].push(wordId);
            }
            for (let p1 = 1; p1 < L; p1++) {
                const c1 = letterCode(word[p1 - 1]);
                for (let p2 = p1 + 1; p2 <= L; p2++) {
                    const c2 = letterCode(word[p2 - 1]);
                    twoBuckets[twoKeyIndex(L, p1, p2, c1, c2)].push(wordId);
                }
            }
            wordId++;
        }
    }
    wordOffsets[wordCount] = charAt;

    let oneIdCount = 0;
    let twoIdCount = 0;
    for (let i = 0; i < ONE_KEY_COUNT; i++) oneIdCount += oneBuckets[i].length;
    for (let i = 0; i < TWO_KEY_COUNT; i++) twoIdCount += twoBuckets[i].length;

    const oneStartsBuf = alloc(ONE_KEY_COUNT * 4, useShared);
    const oneCountsBuf = alloc(ONE_KEY_COUNT * 4, useShared);
    const oneWordIdsBuf = alloc(oneIdCount * 4, useShared);
    const twoStartsBuf = alloc(TWO_KEY_COUNT * 4, useShared);
    const twoCountsBuf = alloc(TWO_KEY_COUNT * 4, useShared);
    const twoWordIdsBuf = alloc(twoIdCount * 4, useShared);

    const oneStarts = new Uint32Array(oneStartsBuf);
    const oneCounts = new Uint32Array(oneCountsBuf);
    const oneWordIds = new Uint32Array(oneWordIdsBuf);
    const twoStarts = new Uint32Array(twoStartsBuf);
    const twoCounts = new Uint32Array(twoCountsBuf);
    const twoWordIds = new Uint32Array(twoWordIdsBuf);

    let oAt = 0;
    for (let i = 0; i < ONE_KEY_COUNT; i++) {
        const b = oneBuckets[i];
        oneStarts[i] = oAt;
        oneCounts[i] = b.length;
        for (let j = 0; j < b.length; j++) oneWordIds[oAt++] = b[j];
    }

    let tAt = 0;
    for (let i = 0; i < TWO_KEY_COUNT; i++) {
        const b = twoBuckets[i];
        twoStarts[i] = tAt;
        twoCounts[i] = b.length;
        for (let j = 0; j < b.length; j++) twoWordIds[tAt++] = b[j];
    }

    const isShared = useShared && wordCharsBuf instanceof SharedArrayBuffer;
    const buffers: WordIndexBuffers = {
        wordChars: wordCharsBuf,
        wordOffsets: wordOffsetsBuf,
        byLengthStart: byLengthStartBuf,
        byLengthCount: byLengthCountBuf,
        oneStarts: oneStartsBuf,
        oneCounts: oneCountsBuf,
        oneWordIds: oneWordIdsBuf,
        twoStarts: twoStartsBuf,
        twoCounts: twoCountsBuf,
        twoWordIds: twoWordIdsBuf,
    };

    return {
        wordCount,
        isShared,
        buffers,
        wordChars,
        wordOffsets,
        byLengthStart,
        byLengthCount,
        oneStarts,
        oneCounts,
        oneWordIds,
        twoStarts,
        twoCounts,
        twoWordIds,
        wordCache: new Array(wordCount),
    };
}

/** Payload safe to postMessage to workers (SharedArrayBuffer is shared by reference). */
export function wordIndexInitPayload(index: PackedWordIndex): WordIndexInitPayload {
    return {
        wordCount: index.wordCount,
        isShared: index.isShared,
        buffers: index.buffers,
    };
}
