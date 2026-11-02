import { Cells, slotsFromCells } from "./magicFill";

/**
 * AcrossLite .puz writer, following cruzi-scraper/src/lib/puzFiles.ts generatePuzFile.
 * Magic grids are single letters with no rebus or circled squares, so those extra
 * sections are omitted; checksums match the scraper for that case.
 * https://code.google.com/archive/p/puz/wikis/FileFormat.wiki
 */

export interface MagicPuzInput {
    cells: Cells;
    /** Clue text keyed by slot key ("1A", "1D", ...). */
    clues: Record<string, string>;
    title?: string;
    author?: string;
    copyright?: string;
    notes?: string;
}

export function generateMagicPuzFile(input: MagicPuzInput): Blob {
    const cells = input.cells;
    const height = cells.length;
    const width = cells[0]?.length ?? 0;
    const slots = slotsFromCells(cells);
    const clues = new Map(slots.map(slot => [slot.key, toPuzString(input.clues[slot.key] || "")]));
    const title = toPuzString(input.title ?? "Magic Crossword");
    const author = toPuzString(input.author ?? "");
    const copyright = toPuzString(input.copyright ?? "");
    const notes = toPuzString(input.notes ?? "");

    const bytes = new Uint8Array(128_000);
    insertString(bytes, "ACROSS&DOWN\0", 0x02);
    insertString(bytes, "1.3\0", 0x18);

    insertNumber(bytes, width, 0x2c, 1);
    insertNumber(bytes, height, 0x2d, 1);
    insertNumber(bytes, clues.size, 0x2e, 2);
    insertNumber(bytes, 1, 0x30, 2);
    insertNumber(bytes, 0, 0x32, 2);

    let pos = 0x34;
    const solutionPos = pos;
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const cell = cells[row]?.[col];
            const char = cell === null || cell === undefined ? "." : cell ? cell[0] : " ";
            insertString(bytes, char, pos);
            pos++;
        }
    }
    const gridPos = pos;
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const cell = cells[row][col];
            insertString(bytes, cell === null ? "." : "-", pos);
            pos++;
        }
    }

    const titlePos = pos;
    insertString(bytes, title + "\0", pos);
    pos += title.length + 1;
    const authorPos = pos;
    insertString(bytes, author + "\0", pos);
    pos += author.length + 1;
    const copyrightPos = pos;
    insertString(bytes, copyright + "\0", pos);
    pos += copyright.length + 1;

    const sortedKeys = sortEntryKeysForPuz(Array.from(clues.keys()));
    const cluesPos = pos;
    sortedKeys.forEach(key => {
        const clue = clues.get(key)!;
        insertString(bytes, clue + "\0", pos);
        pos += clue.length + 1;
    });

    insertString(bytes, notes + "\0", pos);
    pos += notes.length + 1;

    let c_cib = cksum_region(bytes, 0x2c, 8, 0);
    let cksum = c_cib;
    const squaresTotal = width * height;
    cksum = cksum_region(bytes, solutionPos, squaresTotal, cksum);
    cksum = cksum_region(bytes, gridPos, squaresTotal, cksum);
    if (title.length > 0) cksum = cksum_region(bytes, titlePos, title.length + 1, cksum);
    if (author.length > 0) cksum = cksum_region(bytes, authorPos, author.length + 1, cksum);
    if (copyright.length > 0) cksum = cksum_region(bytes, copyrightPos, copyright.length + 1, cksum);
    let cluePos = cluesPos;
    for (let i = 0; i < sortedKeys.length; i++) {
        const clue = clues.get(sortedKeys[i])!;
        cksum = cksum_region(bytes, cluePos, clue.length, cksum);
        cluePos += clue.length + 1;
    }
    insertNumber(bytes, c_cib, 0x0e, 2);
    insertNumber(bytes, cksum, 0x00, 2);

    const c_sol = cksum_region(bytes, solutionPos, squaresTotal, 0);
    const c_grid = cksum_region(bytes, gridPos, squaresTotal, 0);
    let c_part = 0;
    if (title.length > 0) c_part = cksum_region(bytes, titlePos, title.length + 1, c_part);
    if (author.length > 0) c_part = cksum_region(bytes, authorPos, author.length + 1, c_part);
    if (copyright.length > 0) c_part = cksum_region(bytes, copyrightPos, copyright.length + 1, c_part);
    cluePos = cluesPos;
    for (let i = 0; i < sortedKeys.length; i++) {
        const clue = clues.get(sortedKeys[i])!;
        c_part = cksum_region(bytes, cluePos, clue.length, c_part);
        cluePos += clue.length + 1;
    }
    insertNumber(bytes, 0x49 ^ (c_cib & 0xFF), 0x10, 1);
    insertNumber(bytes, 0x43 ^ (c_sol & 0xFF), 0x11, 1);
    insertNumber(bytes, 0x48 ^ (c_grid & 0xFF), 0x12, 1);
    insertNumber(bytes, 0x45 ^ (c_part & 0xFF), 0x13, 1);
    insertNumber(bytes, 0x41 ^ ((c_cib & 0xFF00) >> 8), 0x14, 1);
    insertNumber(bytes, 0x54 ^ ((c_sol & 0xFF00) >> 8), 0x15, 1);
    insertNumber(bytes, 0x45 ^ ((c_grid & 0xFF00) >> 8), 0x16, 1);
    insertNumber(bytes, 0x44 ^ ((c_part & 0xFF00) >> 8), 0x17, 1);

    return new Blob([bytes.slice(0, pos)], { type: "application/octet-stream; charset=ISO-8859-1" });
}

// http://www.keiranking.com/phil/
function cksum_region(bytes: Uint8Array, startPos: number, len: number, cksum: number) {
    for (let i = 0; i < len; i++) {
        cksum = (cksum >> 1) | ((cksum & 1) << 15);
        cksum = (cksum + bytes[startPos + i]) & 0xffff;
    }
    return cksum;
}

const WINDOWS_1252_UNICODE_TO_BYTE: Record<number, number> = {
    0x20ac: 0x80,
    0x201a: 0x82,
    0x0192: 0x83,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x02c6: 0x88,
    0x2030: 0x89,
    0x0160: 0x8a,
    0x2039: 0x8b,
    0x0152: 0x8c,
    0x017d: 0x8e,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2013: 0x96,
    0x2014: 0x97,
    0x02dc: 0x98,
    0x2122: 0x99,
    0x0161: 0x9a,
    0x203a: 0x9b,
    0x0153: 0x9c,
    0x017e: 0x9e,
    0x0178: 0x9f,
};

/** One JS char per PUZ byte, so checksum lengths match the scraper. */
function toPuzString(str: string): string {
    let out = "";
    for (const ch of str) {
        const c = ch.codePointAt(0)!;
        if (c <= 0xff || c in WINDOWS_1252_UNICODE_TO_BYTE) out += ch;
        else out += "?";
    }
    return out;
}

function insertString(bytes: Uint8Array, str: string, pos: number) {
    for (const ch of str) {
        const c = ch.codePointAt(0)!;
        if (c <= 0xff) {
            bytes[pos++] = c;
        } else if (c in WINDOWS_1252_UNICODE_TO_BYTE) {
            bytes[pos++] = WINDOWS_1252_UNICODE_TO_BYTE[c];
        } else {
            bytes[pos++] = "?".charCodeAt(0);
        }
    }
}

function insertNumber(bytes: Uint8Array, n: number, pos: number, size: number) {
    for (let index = size - 1; index >= 0; --index) {
        bytes[pos] = n % 256;
        n = n >> 8;
        pos++;
    }
}

function sortEntryKeysForPuz(entryKeys: string[]): string[] {
    return entryKeys.slice().sort((a, b) => {
        const aTokens = [a.slice(0, -1), a.slice(-1)];
        const bTokens = [b.slice(0, -1), b.slice(-1)];
        if (aTokens[0] !== bTokens[0]) return +aTokens[0] - +bTokens[0];
        return aTokens[1] < bTokens[1] ? -1 : 1;
    });
}
