/**
 * ChaCha20 stream cipher (RFC 8439 layout: 32-bit block counter, 96-bit nonce).
 *
 * Node's `createCipheriv('chacha20', key, iv)` takes a 16-byte IV made of a 4-byte
 * little-endian counter followed by the 12-byte nonce. The crossword list is encrypted
 * with an all-zero IV, so counter 0 and a zero nonce reproduce its keystream exactly.
 * Encryption and decryption are the same operation.
 */

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function rotl(value: number, bits: number): number {
    return (value << bits) | (value >>> (32 - bits));
}

function quarterRound(s: Uint32Array, a: number, b: number, c: number, d: number) {
    s[a] += s[b]; s[d] = rotl(s[d] ^ s[a], 16);
    s[c] += s[d]; s[b] = rotl(s[b] ^ s[c], 12);
    s[a] += s[b]; s[d] = rotl(s[d] ^ s[a], 8);
    s[c] += s[d]; s[b] = rotl(s[b] ^ s[c], 7);
}

function readWordLE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export function chacha20Xor(
    data: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array = new Uint8Array(12),
    counter: number = 0,
): Uint8Array {
    if (key.length !== 32) throw new Error("ChaCha20 key must be 32 bytes.");
    if (nonce.length !== 12) throw new Error("ChaCha20 nonce must be 12 bytes.");

    const state = new Uint32Array(16);
    for (let i = 0; i < 4; i++) state[i] = SIGMA[i];
    for (let i = 0; i < 8; i++) state[4 + i] = readWordLE(key, i * 4);
    state[12] = counter >>> 0;
    for (let i = 0; i < 3; i++) state[13 + i] = readWordLE(nonce, i * 4);

    const working = new Uint32Array(16);
    const out = new Uint8Array(data.length);

    for (let offset = 0; offset < data.length; offset += 64) {
        working.set(state);
        for (let round = 0; round < 10; round++) {
            quarterRound(working, 0, 4, 8, 12);
            quarterRound(working, 1, 5, 9, 13);
            quarterRound(working, 2, 6, 10, 14);
            quarterRound(working, 3, 7, 11, 15);
            quarterRound(working, 0, 5, 10, 15);
            quarterRound(working, 1, 6, 11, 12);
            quarterRound(working, 2, 7, 8, 13);
            quarterRound(working, 3, 4, 9, 14);
        }

        const blockEnd = Math.min(64, data.length - offset);
        for (let i = 0; i < blockEnd; i++) {
            const word = (working[i >> 2] + state[i >> 2]) >>> 0;
            const keystreamByte = (word >>> ((i & 3) * 8)) & 0xff;
            out[offset + i] = data[offset + i] ^ keystreamByte;
        }

        state[12] = (state[12] + 1) >>> 0;
    }

    return out;
}

/** UTF-8 encode a passphrase and zero-pad it to a 32-byte ChaCha20 key. */
export function keyFromPassphrase(passphrase: string): Uint8Array {
    const key = new Uint8Array(32);
    const bytes = new TextEncoder().encode(passphrase);
    key.set(bytes.subarray(0, 32));
    return key;
}

export const CROSSWORD_LIST_KEY = "LH6dMILZXzc";

export function looksLikeCrosswordCsv(bytes: Uint8Array): boolean {
    const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 64)).replace(/^\uFEFF/, "").trimStart();
    return head.toLowerCase().startsWith("entry");
}

export function decryptCrosswordList(bytes: Uint8Array): string {
    return new TextDecoder("utf-8").decode(chacha20Xor(bytes, keyFromPassphrase(CROSSWORD_LIST_KEY)));
}
