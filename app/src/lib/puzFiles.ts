import { createNewGrid } from "../components/Grid/Grid";
import { Puzzle } from "../models/Puzzle";
import { SquareType } from "../models/SquareType";
import { populateWords } from "./grid";

export async function loadPuzFile(url: string): Promise<Puzzle | undefined> {
    let response = await fetch(url);
    let data: Blob = await response.blob();

    return processPuzData(data);
}

export async function processPuzData(data: Blob): Promise<Puzzle | undefined> {
    let magicString = await data.slice(0x02, 0x0e).text();
    if (magicString !== "ACROSS&DOWN\0") return undefined;

    //let overallChecksum = new Uint16Array(await data.slice(0x00, 0x02).arrayBuffer())[0];
    //let cibchecksum = new Uint16Array(await data.slice(0x0e, 0x10).arrayBuffer())[0];
    //let maskedLowChecksum = new Uint32Array(await data.slice(0x10, 0x14).arrayBuffer())[0];
    //let maskedHighChecksum = new Uint32Array(await data.slice(0x14, 0x18).arrayBuffer())[0];

    //let version = await data.slice(0x18, 0x1c).text();
    //let scrambledChecksum = new Uint16Array(await data.slice(0x1e, 0x20).arrayBuffer())[0];;
    let width = new Uint8Array(await data.slice(0x2c, 0x2d).arrayBuffer())[0];
    let height = new Uint8Array(await data.slice(0x2d, 0x2e).arrayBuffer())[0];
    let clueCount = new Uint16Array(await data.slice(0x2e, 0x30).arrayBuffer())[0];;
    //let scrambledTag = new Uint16Array(await data.slice(0x32, 0x34).arrayBuffer())[0];;

    let grid = createNewGrid(height, width);
    let restOfFile = await blobToText(await data.slice(0x34, data.size));

    let i = 0;
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            let curChar = restOfFile[i];
            let square = grid.squares[row][col];
            if (curChar === ".")
                square.type = SquareType.Black;
            if (curChar === "-") {} // no data entered
            if (curChar.match(/[A-Z]/)) {
                square.userContent = square.chosenFillContent = square.fillContent = curChar;
            }

            i++;
        }
    }
    i *= 2; // skip over user progress

    populateWords(grid);

    let puzzle = newPuzzle();
    puzzle.grid = grid;
    [puzzle.title, i] = getNextString(restOfFile, i);
    [puzzle.author, i] = getNextString(restOfFile, i);
    [puzzle.copyright, i] = getNextString(restOfFile, i);

    for (let clueI = 0; clueI < clueCount; clueI++) {
        let clue = "";
        [clue, i] = getNextString(restOfFile, i);
        puzzle.clues.push(clue);
    }

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
    return [ret, i];
}

function newPuzzle(): Puzzle {
    return {
        title: "",
        author: "",
        copyright: "",
        grid: undefined,
        clues: [],
    } as Puzzle;
}

export function generatePuzFile(puzzle: Puzzle): Blob {
    let grid = puzzle.grid!;
    let bytes = new Uint8Array(128_000);
    insertString(bytes, "ACROSS&DOWN\0", 0x02);
    insertString(bytes, "1.3\0", 0x18);

    insertNumber(bytes, grid.width, 0x2c, 1);
    insertNumber(bytes, grid.height, 0x2d, 1);
    insertNumber(bytes, grid.words.length, 0x2e, 2);
    insertNumber(bytes, 1, 0x30, 2);
    insertNumber(bytes, 0, 0x32, 2);

    let pos = 0x34;
    let solutionPos = pos;
    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            let sq = grid.squares[row][col];
            let char = sq.type === SquareType.Black ? "." : sq.userContent ? sq.userContent : "-";
            insertString(bytes, char, pos);
            pos++;
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

    let cluesPos = pos;
    puzzle.clues.forEach(clue => {
        insertString(bytes, clue + "\0", pos);
        pos += clue.length + 1;
    });

    insertString(bytes, "\0", pos);
    pos++;

    let c_cib = cksum_region(bytes, 0x2c, 8, 0);
    let cksum = c_cib; 
    let squaresTotal = grid.width*grid.height;
    cksum = cksum_region(bytes, solutionPos, squaresTotal, cksum); 
    cksum = cksum_region(bytes, gridPos, squaresTotal, cksum);
    if (puzzle.title.length > 0) cksum = cksum_region(bytes, titlePos, puzzle.title.length+1, cksum);
    if (puzzle.author.length > 0) cksum = cksum_region(bytes, authorPos, puzzle.author.length+1, cksum);
    if (puzzle.copyright.length > 0) cksum = cksum_region(bytes, copyrightPos, puzzle.copyright.length+1, cksum);
    let cluePos = cluesPos;
    for(let i = 0; i < puzzle.clues.length; i++) {
        let clue = puzzle.clues[i];
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
    for(let i = 0; i < puzzle.clues.length; i++) {
        let clue = puzzle.clues[i];
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

// https://code.google.com/archive/p/puz/wikis/FileFormat.wiki
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
