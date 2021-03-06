import { ContentType } from "../models/ContentType";
import { GridWord } from "../models/GridWord";
import { Puzzle } from "../models/Puzzle";
import { SquareType } from "../models/SquareType";
import { WordDirection } from "../models/WordDirection";
import { createNewGrid, populateWords } from "./grid";
import { deepClone, getGrid, mapValues, newPuzzle, wordKey } from "./util";
import Globals from '../lib/windowService';

// https://code.google.com/archive/p/puz/wikis/FileFormat.wiki

export async function loadPuzFile(url: string): Promise<Puzzle | undefined> {
    let response = await fetch(url);
    let data: Blob = await response.blob();

    return processPuzData(data);
}

export async function processPuzData(data: Blob): Promise<Puzzle | undefined> {
    let magicString = await data.slice(0x02, 0x0e).text();
    if (magicString !== "ACROSS&DOWN\0") return undefined;

    let width = new Uint8Array(await data.slice(0x2c, 0x2d).arrayBuffer())[0];
    let height = new Uint8Array(await data.slice(0x2d, 0x2e).arrayBuffer())[0];

    let puzzle = newPuzzle();
    let restOfFile = await blobToText(await data.slice(0x34, data.size));
    let grid = createNewGrid(width, height);

    let i = 0;
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            let curChar = restOfFile[i];
            let square = grid.squares[row][col];
            if (curChar === ".")
                square.type = SquareType.Black;
            if (curChar === "-") {} // no data entered
            if (curChar.match(/[A-Z]/)) {
                square.content = curChar;
                square.contentType = ContentType.User;
            }
            i++;
        }
    }
    i *= 2; // skip over user progress

    populateWords(grid);
    
    [puzzle.title, i] = getNextString(restOfFile, i);
    [puzzle.author, i] = getNextString(restOfFile, i);
    [puzzle.copyright, i] = getNextString(restOfFile, i);

    let sortedWords = sortWordsForPuz(mapValues(grid.words));
    sortedWords.forEach(word => {
        let clue = "";
        [clue, i] = getNextString(restOfFile, i);
        let key = wordKey(word);
        puzzle.clues.set(key, clue);
    });

    [puzzle.notes, i] = getNextString(restOfFile, i);

    let rebusSquareMappings = new Map<string, number>();
    let rebusValues = new Map<number, string>();

    while (i < restOfFile.length) {
        let sectionType = restOfFile.slice(i, i+4);
        i += 4;
        let dlI = 0x34 + i;
        let dataLength = new Uint16Array(await data.slice(dlI, dlI+2).arrayBuffer())[0];
        i += 2;
        i += 2; // skip checksum

        if (sectionType === "GRBS") { // rebus grid
            let secI = 0x34 + i;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    let n = new Uint8Array(await data.slice(secI, secI + 1).arrayBuffer())[0];
                    secI++;
                    if (n > 0) {
                        rebusSquareMappings.set(`${row},${col}`, n-1);
                    }
                }
            }
        }
        if (sectionType === "RTBL") { // rebus values
            let valuesStr = restOfFile.slice(i, i + dataLength);
            let valueStrs = valuesStr.split(";");
            valueStrs.forEach(str => {
                let tokens = str.split(":");
                let n = +tokens[0].trim();
                let val = tokens[1];
                if (n > 0) rebusValues.set(n, val);
            });
        }
        if (sectionType === "GEXT") { // extra flags
            let secI = 0x34 + i;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    let n = new Uint8Array(await data.slice(secI, secI + 1).arrayBuffer())[0];
                    secI++;
                    if (n & 0x80) {
                        grid.squares[row][col].isCircled = true;
                    }
                }
            }
        }

        i += dataLength + 1;
    }

    if (rebusSquareMappings.size > 0) {
        rebusSquareMappings.forEach((v, k) => {
            let tokens = k.split(",");
            let square = grid.squares[+tokens[0]][+tokens[1]];
            square.content = rebusValues.get(v)![0]; // TODO: Use full value when we have rebus support
            square.contentType = ContentType.User;
        });
    }

    Globals.activeGrid = grid;
    return puzzle;
}

async function blobToText(blob: Blob): Promise<string> {
    let arr = Array.from(new Uint8Array(await blob.arrayBuffer()));
    return arr.map(x => String.fromCharCode(x)).join("");
}

function getNextString(data: string, i: number): [string, number] {
    let ret = "";
    while(data[i] !== "\0") {
        ret += data[i];
        i++;
    }
    i++;
    return [ret.trim(), i];
}

export function generatePuzFile(puzzle: Puzzle): Blob {
    let grid = getGrid();
    let bytes = new Uint8Array(128_000);
    insertString(bytes, "ACROSS&DOWN\0", 0x02);
    insertString(bytes, "1.3\0", 0x18);

    insertNumber(bytes, grid.width, 0x2c, 1);
    insertNumber(bytes, grid.height, 0x2d, 1);
    insertNumber(bytes, grid.words.size, 0x2e, 2);
    insertNumber(bytes, 1, 0x30, 2);
    insertNumber(bytes, 0, 0x32, 2);

    let pos = 0x34;
    let solutionPos = pos;
    let areCircledSquares = false;
    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            let sq = grid.squares[row][col];
            let char = sq.type === SquareType.Black ? "." : sq.content ? sq.content : " ";
            insertString(bytes, char, pos);
            pos++;

            if (sq.isCircled) areCircledSquares = true;
        }
    }
    let gridPos = pos;
    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            let sq = grid.squares[row][col];
            let char = sq.type === SquareType.Black ? "." : "-";
            insertString(bytes, char, pos);
            pos++;
        }
    }

    let titlePos = pos;
    insertString(bytes, puzzle.title + "\0", pos);
    pos += puzzle.title.length + 1;
    let authorPos = pos;
    insertString(bytes, puzzle.author + "\0", pos);
    pos += puzzle.author.length + 1;
    let copyrightPos = pos;
    insertString(bytes, puzzle.copyright + "\0", pos);
    pos += puzzle.copyright.length + 1;

    let orderedClues = [] as string[];
    let sortedWords = sortWordsForPuz(mapValues(grid.words));
    sortedWords.forEach(word => {
        let key = wordKey(word);
        orderedClues.push(puzzle.clues.get(key)! || "");
    });

    let cluesPos = pos;
    orderedClues.forEach(oc => {
        insertString(bytes, oc + "\0", pos);
        pos += oc.length + 1;
    });

    insertString(bytes, puzzle.notes + "\0", pos);
    pos += puzzle.notes.length + 1;

    if (areCircledSquares) {
        let sectionSize = grid.width * grid.height;
        insertString(bytes, "GEXT", pos);
        pos += 4;
        insertNumber(bytes, sectionSize, pos, 2);
        pos += 2;
        let checksumPos = pos;
        pos += 2;
        for (let row = 0; row < grid.height; row++) {
            for (let col = 0; col < grid.width; col++) {
                let sq = grid.squares[row][col];
                insertNumber(bytes, sq.isCircled ? 0x80 : 0, pos, 1);
                pos++;
            }
        }
        insertString(bytes, "\0", pos);
        pos++;

        let cksum = cksum_region(bytes, checksumPos + 2, sectionSize, 0);
        insertNumber(bytes, cksum, checksumPos, 2);
    }

    let c_cib = cksum_region(bytes, 0x2c, 8, 0);
    let cksum = c_cib;
    let squaresTotal = grid.width*grid.height;
    cksum = cksum_region(bytes, solutionPos, squaresTotal, cksum);
    cksum = cksum_region(bytes, gridPos, squaresTotal, cksum);
    if (puzzle.title.length > 0) cksum = cksum_region(bytes, titlePos, puzzle.title.length+1, cksum);
    if (puzzle.author.length > 0) cksum = cksum_region(bytes, authorPos, puzzle.author.length+1, cksum);
    if (puzzle.copyright.length > 0) cksum = cksum_region(bytes, copyrightPos, puzzle.copyright.length+1, cksum);
    let cluePos = cluesPos;
    for(let i = 0; i < orderedClues.length; i++) {
        let clue = orderedClues[i];
        cksum = cksum_region(bytes, cluePos, clue.length, cksum);
        cluePos += clue.length+1;
    }
    insertNumber(bytes, c_cib, 0x0e, 2);
    insertNumber(bytes, cksum, 0x00, 2);

    let c_sol = cksum_region(bytes, solutionPos, squaresTotal, 0);
    let c_grid = cksum_region(bytes, gridPos, squaresTotal, 0);
    let c_part = 0;
    if (puzzle.title.length > 0) c_part = cksum_region(bytes, titlePos, puzzle.title.length+1, c_part);
    if (puzzle.author.length > 0) c_part= cksum_region(bytes, authorPos, puzzle.author.length+1, c_part);
    if (puzzle.copyright.length > 0) c_part = cksum_region(bytes, copyrightPos, puzzle.copyright.length+1, c_part);
    cluePos = cluesPos;
    for(let i = 0; i < orderedClues.length; i++) {
        let clue = orderedClues[i];
        c_part = cksum_region(bytes, cluePos, clue.length, c_part);
        cluePos += clue.length+1;
    }
    insertNumber(bytes, 0x49 ^ (c_cib & 0xFF), 0x10, 1);
    insertNumber(bytes, 0x43 ^ (c_sol & 0xFF), 0x11, 1);
    insertNumber(bytes, 0x48 ^ (c_grid & 0xFF), 0x12, 1);
    insertNumber(bytes, 0x45 ^ (c_part & 0xFF), 0x13, 1);
    insertNumber(bytes, 0x41 ^ ((c_cib & 0xFF00) >> 8), 0x14, 1);
    insertNumber(bytes, 0x54 ^ ((c_sol & 0xFF00) >> 8), 0x15, 1);
    insertNumber(bytes, 0x45 ^ ((c_grid & 0xFF00) >> 8), 0x16, 1);
    insertNumber(bytes, 0x44 ^ ((c_part & 0xFF00) >> 8), 0x17, 1);

    let finalArray = bytes.slice(0, pos);
    return new Blob([finalArray], {type: "application/octet-stream; charset=ISO-8859-1"});
}

// http://www.keiranking.com/phil/
function cksum_region(bytes: Uint8Array, startPos: number, len: number, cksum: number) {
    for (let i = 0; i < len; i++) {
        cksum = (cksum >> 1) | ((cksum & 1) << 15);
        cksum = (cksum + bytes[startPos + i]) & 0xffff;
    }
    
    return cksum; 
}

function insertString(bytes: Uint8Array, str: string, pos: number) {
    for (let i = 0; i < str.length; i++) {
        bytes[pos] = str[i].charCodeAt(0);
        pos++;
    }
}

function insertNumber(bytes: Uint8Array, n: number, pos: number, size: number) {
    for (var index = size-1; index >= 0; --index) {
      bytes[pos] = n % 256;
      n = n >> 8;
      pos++;
    }
}

function sortWordsForPuz(words: GridWord[]): GridWord[] {
    let sortedWords = (deepClone(words) as GridWord[]).sort((a, b) => {
        if (a.start[0] !== b.start[0]) return a.start[0] - b.start[0];
        if (a.start[1] !== b.start[1]) return a.start[1] - b.start[1];
        return a.direction === WordDirection.Across ? -1 : 1;
    });
    return sortedWords;
}
