import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { WordDirection } from "../models/WordDirection";
import { getUnfilledCrosses, getWordScore } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares, getSquareAtKey } from "./grid";
import { PriorityQueue } from "./priorityQueue";
import { forAllGridSquares, getEntryAtWordKey, getGrid, getSquaresForWord, getWordAtSquare, gridSquareAtKey, isAcross, 
    isBlackSquare, isUserFilled, mapKeys, squareKey, wordKey, wordLength } from "./util";
import Globals from './windowService';

export function updateSectionFilters() {
    let sections = Globals.sections!;
    let grid = getGrid();
    sections.forEach(sec => {
        sec.candidates.forEach((can, _) => {
            let sqKeys = mapKeys(sec.squares);
            can.isFilteredOut = false;
            for (let sqKey of sqKeys) {
                let gridSq = getSquareAtKey(grid, sqKey);
                let canSq = getSquareAtKey(can.grid, sqKey);
                if (isUserFilled(gridSq) && canSq.content !== gridSq.content)
                    can.isFilteredOut = true;
            }
        });
    });
}

export function getSectionString(grid: GridState, section: Section): string {
    let ret = [] as string[];
    mapKeys(section.squares).forEach(sq => {
        let rowCol = sq.split(",").map(x => +x);
        let content = grid.squares[rowCol[0]][rowCol[1]].content;
        ret.push(content ? content! : ".");
    });
    return ret.join("");
}

export function insertSectionCandidateIntoGrid(grid: GridState, candidate: SectionCandidate, section: Section) {
    section.squares.forEach((_, sqKey) => {
        let sq = gridSquareAtKey(grid, sqKey);
        let candidateSq = gridSquareAtKey(candidate.grid, sqKey);
        sq.content = candidateSq.content;
        sq.constraintInfo = {
            isCalculated: true,
            sumTotal: 1,
            viableLetters: new Map<string, number>([[sq.content!, 1]]),
        }
        if (!isUserFilled(sq)) {
            sq.contentType = ContentType.Autofill;
        }
    });

    section.words.forEach((_, key) => {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        grid.usedWords.set(getLettersFromSquares(squares), true);
    });

    section.unfilledCrosses.forEach((_, key) => {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        generateConstraintInfoForSquares(grid, squares);
    });
}

export function generateGridSections(grid: GridState): Map<number, Section> {
    function iterateSection(section: Section, grid: GridState, sq: GridSquare, usedSquares: Map<string, boolean>) {
        section.openSquareCount++;
        usedSquares.set(`${sq.row},${sq.col}`, true);

        getNeighboringSquares(grid, sq).forEach(neighbor => {
            if (!usedSquares.has(`${neighbor.row},${neighbor.col}`) && isOpenSquare(grid, neighbor)) {
                iterateSection(section, grid, neighbor, usedSquares);
            }

            [WordDirection.Across, WordDirection.Down].forEach(dir => {
                let word = getWordAtSquare(grid, neighbor.row, neighbor.col, dir)!;
                if (!section.words.has(wordKey(word))) {
                    section.words.set(wordKey(word), true);
                    let squares = getSquaresForWord(grid, word);
                    squares.forEach(wsq => {
                        section.squares.set(`${wsq.row},${wsq.col}`, true);
                    });
                }
            });
        });
    }

    let sections = new Map<number, Section>();
    let usedSquares = new Map<string, boolean>();
    let nextSectionId = 1;

    // add full grid section
    let fullSection = makeNewSection(0);
    forAllGridSquares(grid, sq => {
        if (!isBlackSquare(sq)) fullSection.squares.set(squareKey(sq), true);
    });
    grid.words.forEach(w => {
        fullSection.words.set(wordKey(w), true);
    });
    sections.set(0, fullSection);

    // populate sections
    forAllGridSquares(grid, sq => {
        if (!usedSquares.has(`${sq.row},${sq.col}`) && isOpenSquare(grid, sq)) {
            let newSection = makeNewSection(nextSectionId);
            iterateSection(newSection, grid, sq, usedSquares);
            if (newSection.openSquareCount === 1) return;
            sections.set(newSection.id, newSection);
            nextSectionId++;
        }
    });
    if (sections.size === 2) sections.delete(1);

    // populate stackWords
    sections.forEach(section => {
        section.words.forEach((_, key) => {
            if (section.stackWords.has(key)) return;

            let word = grid.words.get(key)!;
            let stackedNeighbors = mapKeys(section.words).filter(otherKey => {
                if (otherKey === key) return false;

                let otherWord = grid.words.get(otherKey)!;
                if (isAcross(word) && isAcross(otherWord) && Math.abs(word.start[0] - otherWord.start[0]) === 1) {
                    let intersectionCount = Math.min(word.end[1], otherWord.end[1]) - Math.max(word.start[1], otherWord.start[1]) + 1;
                    return intersectionCount >= 5;
                }
                if (!isAcross(word) && !isAcross(otherWord) && Math.abs(word.start[1] - otherWord.start[1]) === 1) {
                    let intersectionCount = Math.min(word.end[0], otherWord.end[0]) - Math.max(word.start[0], otherWord.start[0]) + 1;
                    return intersectionCount >= 5;
                }
                return false;
            }); 

            if (stackedNeighbors.length > 0) {
                section.stackWords.set(key, true);
                stackedNeighbors.forEach(sk => {
                    section.stackWords.set(sk, true);
                });
            }
        });
    });

    // populate unfilledCrosses
    sections.forEach(section => {
        section.words.forEach((_, key) => {
            let word = grid.words.get(key)!;
            let crosses = getUnfilledCrosses(grid, word);
            crosses.forEach(cross => {
                let crossKey = wordKey(cross);
                if (!section.words.has(crossKey))
                    section.unfilledCrosses.set(crossKey, true);
            });
        });
    });

    return sections;
}

function isOpenSquare(grid: GridState, sq: GridSquare): boolean {
    let neighbors = getNeighboringSquares(grid, sq);
    return neighbors.length === 8 && !neighbors.find(n => isBlackSquare(n));
}

function getNeighboringSquares(grid: GridState, sq: GridSquare): GridSquare[] {
    let ret = [] as GridSquare[];
    let nClear = sq.row > 0;
    let sClear = sq.row < grid.height-1;
    let wClear = sq.col > 0;
    let eClear = sq.col < grid.width-1;

    if (nClear && wClear) ret.push(grid.squares[sq.row-1][sq.col-1]);
    if (nClear) ret.push(grid.squares[sq.row-1][sq.col]);
    if (nClear && eClear) ret.push(grid.squares[sq.row-1][sq.col+1]);
    if (eClear) ret.push(grid.squares[sq.row][sq.col+1]);
    if (sClear && eClear) ret.push(grid.squares[sq.row+1][sq.col+1]);
    if (sClear) ret.push(grid.squares[sq.row+1][sq.col]);
    if (sClear && wClear) ret.push(grid.squares[sq.row+1][sq.col-1]);
    if (wClear) ret.push(grid.squares[sq.row][sq.col-1]);

    return ret;
}

export function newSectionCandidate(node: FillNode, section: Section): SectionCandidate {
    let grid = node.endGrid;
    return {
        grid: grid,
        score: calculateSectionCandidateScore(grid, section),
        iffyEntry: node.iffyWordKey ? getEntryAtWordKey(grid, node.iffyWordKey) : undefined,
        isFilteredOut: false,
    } as SectionCandidate;
}

export function calculateSectionCandidateScore(grid: GridState, section: Section): number {
    let total = 0;
    section.words.forEach((_, wordKey) => {
        let word = grid.words.get(wordKey)!;
        let squares = getSquaresForWord(grid, word);
        let str = getLettersFromSquares(squares);
        total += getWordScore(str);
    });

    return total / section.words.size;
}

const natoAlphabet = {
    "A": "Alfa",   "B": "Bravo",   "C": "Charlie",
    "D": "Delta",  "E": "Echo",    "F": "Foxtrot",
    "G": "Golf",   "H": "Hotel",   "I": "India",
    "J": "Juliett","K": "Kilo",    "L": "Lima",
    "M": "Mike",   "N": "November","O": "Oscar",
    "P": "Papa",   "Q": "Quebec",  "R": "Romeo",
    "S": "Sierra", "T": "Tango",   "U": "Uniform",
    "V": "Victor", "W": "Whiskey", "X": "X-ray",
    "Y": "Yankee", "Z": "Zulu"
} as any;

export function getPhoneticName(n: number): string {
    if (n === 0) return "Full Grid";
    return n <= 26 ? natoAlphabet[String.fromCharCode(n+65)] : "Section " + n.toString();
}

export function sectionCandidateKey(section: Section, grid: GridState): string {
    let keys = mapKeys(section.squares).sort();
    return keys.map(k => getSquareAtKey(grid, k).content!).join("");
}

export function makeNewSection(id: number): Section {
    return {
        id: id,
        openSquareCount: 0,
        squares: new Map<string, boolean>(),
        words: new Map<string, boolean>(),
        stackWords: new Map<string, boolean>(),
        unfilledCrosses: new Map<string, boolean>(),
        triedComboPerms: new Map<string, Map<string, boolean>>(),
        triedComboSquares: new Map<string, boolean>(),
        candidates: new Map<string, SectionCandidate>(),
        fillQueues: new Map<string, PriorityQueue<FillNode>>(),
    } as Section;
}

export function getLongestStackWord(section: Section): GridWord {
    function getLongest(wordKeys: string[]): GridWord {
        return wordKeys.map(w => grid.words.get(w)!).sort((a, b) => wordLength(b) - wordLength(a))[0];
    }

    let grid = getGrid();
    if (section.stackWords.size > 0)
        return getLongest(mapKeys(section.stackWords))
    else
        return getLongest(mapKeys(section.words));
}

export function getSelectedSectionsKey(): string {
    return mapKeys(Globals.selectedSectionIds!).sort().map(i => i.toString()).join(",");
}
