/** Set of search depths as a fixed-width bitset (32 depths per word). */
export type DepthSet = Uint32Array;

export function newDepthSet(width: number): DepthSet {
    return new Uint32Array(width);
}

export function depthSetWidthFor(maxDepth: number): number {
    return Math.max(1, Math.ceil((maxDepth + 1) / 32));
}

export function addDepth(set: DepthSet, depth: number) {
    if (depth < 0) return;
    set[depth >> 5] |= 1 << (depth & 31);
}

/** Add every depth in [0, limit). */
export function addDepthsBelow(set: DepthSet, limit: number) {
    for (let w = 0; w < set.length; w++) {
        const lo = w * 32;
        if (lo >= limit) break;
        const n = limit - lo;
        set[w] |= n >= 32 ? 0xffffffff : (1 << n) - 1;
    }
}

export function unionInto(dst: DepthSet, src: DepthSet, srcOffset = 0) {
    for (let w = 0; w < dst.length; w++) dst[w] |= src[srcOffset + w];
}

/** Remove every depth >= limit. */
export function clearFrom(set: DepthSet, limit: number) {
    for (let w = 0; w < set.length; w++) {
        const lo = w * 32;
        if (lo >= limit) set[w] = 0;
        else if (limit - lo < 32) set[w] &= (1 << (limit - lo)) - 1;
    }
}

/** Highest depth in the set, or -1 if empty. */
export function maxDepth(set: DepthSet): number {
    for (let w = set.length - 1; w >= 0; w--) {
        const bits = set[w];
        if (bits) return w * 32 + 31 - Math.clz32(bits);
    }
    return -1;
}
