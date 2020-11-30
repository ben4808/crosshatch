import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { WordDirection } from "../models/WordDirection";
import { WordKey } from "../models/WordKey";
import { priorityQueue } from "./priorityQueue";
import { forAllGridSquares, getSquaresForWord, getWordAtSquare, 
    isBlackSquare, isUserFilled, mapKeys, wordKey } from "./util";
import Globals from './windowService';

export function updateGlobalSections(newGrid: GridState) {
    function keysStr(section: Section): string {
        return Array.from(section.squares.keys()).sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])
            .map(k => `(${k[0]},${k[1]}`).join(",");
    }

    let curSections = Globals.sections!;
    let newSections = generateGridSections(newGrid);
    let curSectionsKeys = new Map<string, Section>();
    let newSectionNumbers = new Map<number, boolean>();
    curSections.forEach(sec => {
        curSectionsKeys.set(keysStr(sec), sec);
    });
    newSections.forEach(sec => {
        newSectionNumbers.set(sec.number, true);
    });
    for (let i = 0; i < newSections.length; i++) {
        let sec = newSections[i];
        let secKey = keysStr(sec);
        if (curSectionsKeys.has(secKey)) {
            let curSection = curSectionsKeys.get(secKey)!;
            curSection.candidates.forEach(can => {
                can.includedSections = can.includedSections.filter(x => newSectionNumbers.has(x));
            });
            newSections[i] = curSectionsKeys.get(secKey)!;
        }
    }

    Globals.sections = newSections;
}

export function updateGlobalSectionFilters(grid: GridState) {
    let sections = Globals.sections!;
    sections.forEach(sec => {
        sec.candidates.forEach(can => {
            let secSquares = mapKeys(sec.squares);
            can.isFilteredOut = false;
            for (let secSq of secSquares) {
                let gridSq = grid.squares[secSq[0]][secSq[1]];
                let canSq = can.grid.squares[secSq[0]][secSq[1]];
                if (isUserFilled(gridSq) && canSq.content !== gridSq.content)
                    can.isFilteredOut = true;
            }
        });
    });
}

export function generateGridSections(grid: GridState): Section[] {
    function iterateSection(section: Section, grid: GridState, sq: GridSquare, usedSquares: Map<string, boolean>) {
        section.openSquareCount++;
        usedSquares.set(`${sq.row},${sq.col}`, true);

        getNeighboringSquares(grid, sq).forEach(neighbor => {
            if (isOpenSquare(grid, neighbor) && !usedSquares.has(`${neighbor.row},${neighbor.col}`)) {
                iterateSection(section, grid, neighbor, usedSquares);
            }

            [WordDirection.Across, WordDirection.Down].forEach(dir => {
                let word = getWordAtSquare(grid, neighbor.row, neighbor.col, dir)!;
                if (!section.words.has(wordKey(word))) {
                    section.words.set(wordKey(word), true);
                    let squares = getSquaresForWord(grid, word);
                    squares.forEach(wsq => {
                        section.squares.set([wsq.row, wsq.col], true);
                    });
                }
            });
        });
    }

    let sections = [] as Section[];
    let usedSquares = new Map<string, boolean>();
    if (Globals.sectionI === undefined) Globals.sectionI = 1;
    let i = Globals.sectionI!;

    forAllGridSquares(grid, sq => {
        if (!usedSquares.has(`${sq.row},${sq.col}`) && isOpenSquare(grid, sq)) {
            let newSection = {
                number: i++,
                openSquareCount: 0,
                squares: new Map<[number, number], boolean>(),
                words: new Map<WordKey, boolean>(),
                candidates: new Map<number, SectionCandidate>(),
                fillQueue: priorityQueue<FillNode>(),
            } as Section;

            iterateSection(newSection, grid, sq, usedSquares);
            sections.push(newSection);
        }
    });

    Globals.sectionI = i;
    return sections.sort((a, b) => a.openSquareCount - b.openSquareCount);
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