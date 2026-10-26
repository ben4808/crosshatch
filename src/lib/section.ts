import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { WordDirection } from "../models/WordDirection";
import { getAllCrosses } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { forAllGridSquares, getGrid, getSquaresForWord, getWordAtSquare, getSquareAtKey, isAcross, 
    isBlackSquare, mapKeys, squareKey, wordKey, wordLength, mapValues, isUserOrWordFilled, cloneGridForFill,
    letterBit } from "./util";
import { fillScore } from "./wordList";
import Globals from './windowService';

export function updateSectionFilters() {
    let sections = Globals.sections!;
    let grid = getGrid();
    sections.forEach(sec => {
        let sqKeys = mapKeys(sec.squares).sort();
        sec.candidates.forEach(can => {
            can.isFilteredOut = false;
            for (let i = 0; i < sqKeys.length; i++) {
                let gridSq = getSquareAtKey(grid, sqKeys[i]);
                if (isUserOrWordFilled(gridSq) && can.sectionString[i] !== gridSq.content)
                    can.isFilteredOut = true;
            }
        });
    });
}

interface SectionLayout {
    squares: Map<string, boolean>;
    /** Square coordinates in sectionString order (sorted square keys). */
    coords: [number, number][];
    positionByKey: Map<string, number>;
}

const sectionLayouts = new WeakMap<Section, SectionLayout>();

function getSectionLayout(section: Section): SectionLayout {
    let layout = sectionLayouts.get(section);
    if (layout && layout.squares === section.squares) return layout;
    let keys = mapKeys(section.squares).sort();
    let coords = keys.map(key => {
        let tokens = key.substring(1, key.length - 1).split(",");
        return [+tokens[0], +tokens[1]] as [number, number];
    });
    layout = { squares: section.squares, coords, positionByKey: new Map(keys.map((key, i) => [key, i])) };
    sectionLayouts.set(section, layout);
    return layout;
}

/** Section square coordinates in sectionString order. */
export function getSectionSquareCoords(section: Section): [number, number][] {
    return getSectionLayout(section).coords;
}

const sectionWordLists = new WeakMap<Section, { words: Map<string, GridWord>; list: GridWord[] }>();

/** The section's words resolved against grid.words (cached per section and word map). */
export function getSectionWordList(grid: GridState, section: Section): GridWord[] {
    let cached = sectionWordLists.get(section);
    if (cached && cached.words === grid.words) return cached.list;
    let list = mapKeys(section.words).map(key => grid.words.get(key)!).filter(w => w);
    sectionWordLists.set(section, { words: grid.words, list });
    return list;
}

export function getSectionString(grid: GridState, section: Section): string {
    let coords = getSectionLayout(section).coords;
    let ret = "";
    for (let i = 0; i < coords.length; i++) {
        let content = grid.squares[coords[i][0]][coords[i][1]].content;
        ret += content ? content : "-";
    }
    return ret;
}

/** Letter at sqKey within a candidate's sectionString (sorted-key order). */
export function sectionCandidateLetterAt(section: Section, sectionString: string, sqKey: string): string {
    let i = getSectionLayout(section).positionByKey.get(sqKey);
    return i !== undefined ? sectionString[i] : "";
}

/** Longest-stack (or longest) word letters from a stored sectionString. */
export function entryFromSectionString(section: Section, sectionString: string, word: GridWord): string {
    let grid = getGrid();
    let squares = getSquaresForWord(grid, word);
    return squares.map(sq => sectionCandidateLetterAt(section, sectionString, squareKey(sq))).join("");
}

/** All complete fill entries (A–Z) used by a section candidate. */
export function entriesFromSectionString(section: Section, sectionString: string): string[] {
    let grid = getGrid();
    let seen = new Set<string>();
    let entries: string[] = [];
    section.words.forEach((_, key) => {
        let word = grid.words.get(key);
        if (!word) return;
        let entry = entryFromSectionString(section, sectionString, word);
        if (!entry || /[^A-Z]/.test(entry) || seen.has(entry)) return;
        seen.add(entry);
        entries.push(entry);
    });
    entries.sort();
    return entries;
}

// returns whether it was a success
export function insertSectionCandidateIntoGrid(grid: GridState, candidate: SectionCandidate, contentType?: ContentType): boolean {
    if (contentType === undefined) contentType = ContentType.ChosenSection;
    let newGrid = cloneGridForFill(grid);
    let section = Globals.sections!.get(candidate.sectionId)!;
    let foundDiscrepancy = false;
    let keys = mapKeys(section.squares).sort();
    for (let i = 0; i < keys.length; i++) {
        let sq = getSquareAtKey(newGrid, keys[i]);
        let content = candidate.sectionString[i];
        if (isUserOrWordFilled(sq) && sq.content! !== content)
            foundDiscrepancy = true;
        sq.content = content;
        sq.viableMask = content && content !== "-" ? letterBit(content) : undefined;
        if (!isUserOrWordFilled(sq)) {
            sq.contentType = [ContentType.HoverChosenSection, ContentType.Autofill].includes(contentType!) ? 
                ContentType.Autofill : ContentType.ChosenSection;
        }
    }
    if (foundDiscrepancy) return false;
    else {
        forAllGridSquares(newGrid, newSq => {
            grid.squares[newSq.row][newSq.col] = newSq;
        });
    }

    section.words.forEach((_, key) => {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        grid.usedWords.set(getLettersFromSquares(squares), true);
    });

    section.neighboringCrosses.forEach((_, key) => {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        generateConstraintInfoForSquares(squares);
    });

    grid.userFilledSectionCandidates.set(candidate.sectionString, true);
    return true;
}

export function generateGridSections(grid: GridState): Map<number, Section> {
    function iterateSection(section: Section, grid: GridState, sq: GridSquare, usedSquares: Map<string, boolean>) {
        section.openSquareCount++;
        usedSquares.set(squareKey(sq), true);

        getNeighboringSquares(grid, sq).forEach(neighbor => {
            if (!usedSquares.has(squareKey(neighbor)) && isOpenSquare(grid, neighbor)) {
                iterateSection(section, grid, neighbor, usedSquares);
            }

            [WordDirection.Across, WordDirection.Down].forEach(dir => {
                let word = getWordAtSquare(grid, neighbor.row, neighbor.col, dir)!;
                if (word !== undefined && !section.words.has(wordKey(word))) {
                    section.words.set(wordKey(word), true);
                    let squares = getSquaresForWord(grid, word);
                    squares.forEach(wsq => {
                        section.squares.set(squareKey(wsq), true);
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
        if (!usedSquares.has(squareKey(sq)) && isOpenSquare(grid, sq)) {
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
        section.stackWords = new Map<string, boolean>();

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

    // populate neighboringCrosses
    sections.forEach(section => {
        section.words.forEach((_, key) => {
            let word = grid.words.get(key)!;
            let crosses = getAllCrosses(grid, word);
            crosses.forEach(cross => {
                let crossKey = wordKey(cross);
                if (!section.words.has(crossKey))
                    section.neighboringCrosses.set(crossKey, true);
            });
        });
    });

    // wordOrder kept as a simple longest-first list (MRV selects dynamically during fill)
    sections.forEach(section => {
        section.wordOrder = mapKeys(section.words)
            .map(wKey => grid.words.get(wKey)!)
            .sort((a, b) => {
                if (wordLength(a) !== wordLength(b)) return wordLength(b) - wordLength(a);
                return a.direction === WordDirection.Across ? a.start[0] - b.start[0] : a.start[1] - b.start[1];
            })
            .map(w => wordKey(w));
    });

    // calculate connections
    sections.forEach(section => {
        sections.forEach((sec, id) => {
            if (id === section.id) return;
            if (mapKeys(sec.words).find(wk => section.words.has(wk)))
                section.connections.set(id, true);
        });
    });

    return sections;
}

export function calculateSectionOrder(sections: Section[]): number[] {
    return sections.sort((a, b) => {
        if (a.id === 0) return -1;
        if (b.id === 0) return 1;
        if (a.connections.size !== b.connections.size) return b.connections.size - a.connections.size;
        return b.squares.size - a.squares.size;
    }).map(sec => sec.id);
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
    return newSectionCandidateFromGrid(node.endGrid, section);
}

export function newSectionCandidateFromGrid(grid: GridState, section: Section): SectionCandidate {
    let entries: string[] = [];
    getSectionWordList(grid, section).forEach(word => {
        let entry = getLettersFromSquares(getSquaresForWord(grid, word));
        if (/^[A-Z]+$/.test(entry)) entries.push(entry);
    });
    return {
        sectionId: section.id,
        sectionString: getSectionString(grid, section),
        score: fillScore(entries),
        isFilteredOut: false,
    };
}

/** Sum of entry scores for a stored sectionString (main thread only). */
export function sectionCandidateScore(section: Section, sectionString: string): number {
    let grid = getGrid();
    let entries: string[] = [];
    section.words.forEach((_, key) => {
        let word = grid.words.get(key);
        if (!word) return;
        let entry = entryFromSectionString(section, sectionString, word);
        if (/^[A-Z]+$/.test(entry)) entries.push(entry);
    });
    return fillScore(entries);
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
    return n <= 26 ? natoAlphabet[String.fromCharCode(n+64)] : "Section " + n.toString();
}

export function sectionCandidateKey(section: Section, grid: GridState): string {
    return getSectionLayout(section).coords.map(([row, col]) => grid.squares[row][col].content!).join("");
}

export function makeNewSection(id: number): Section {
    return {
        id: id,
        openSquareCount: 0,
        squares: new Map<string, boolean>(),
        words: new Map<string, boolean>(),
        stackWords: new Map<string, boolean>(),
        wordOrder: [],
        neighboringCrosses: new Map<string, boolean>(),
        candidates: new Map<string, SectionCandidate>(),
        connections: new Map<number, boolean>(),
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

export function getSelectedSections(): Section[] {
    if (Globals.selectedSectionIds!.size === 0) return [Globals.sections!.get(0)!];
    return mapKeys(Globals.selectedSectionIds!).sort().map(id => Globals.sections!.get(id)!);
}

export function getSelectedSectionCandidates(): SectionCandidate[] {
    let ret = [] as SectionCandidate[];
    Globals.sections!.forEach((section, _) => {
        Globals.selectedSectionCandidateKeys!.forEach((scKey, _) => {
            if (section.candidates.has(scKey))
                ret.push(section.candidates.get(scKey)!);
        });
    });
    return ret;
}

export function getSelectedSectionCandidatesWithWord(wordKey: string): SectionCandidate[] {
    let ret = [] as SectionCandidate[];
    getSelectedSectionCandidates().forEach(sc => {
        let section = Globals.sections!.get(sc.sectionId)!;
        if (section.words.has(wordKey))
            ret.push(sc);
    });
    return ret;
}

export function getSelectedSectionCandidatesWithSquare(squareKey: string): SectionCandidate[] {
    let ret = [] as SectionCandidate[];
    getSelectedSectionCandidates().forEach(sc => {
        let section = Globals.sections!.get(sc.sectionId)!;
        if (section.squares.has(squareKey))
            ret.push(sc);
    });
    return ret;
}

export function getSectionsWithSelectedCandidate(): Section[] {
    return getSelectedSectionCandidates().map(sc => getSectionWithCandidate(sc));
}

export function getSectionWithCandidate(sc: SectionCandidate): Section {
    return Globals.sections!.get(sc.sectionId)!;
}

export function getUnfilteredSectionCandidates(section: Section): SectionCandidate[] {
    return mapValues(section.candidates).filter(sc => !sc.isFilteredOut);
}

export function getSectionsWithWord(word: GridWord): Section[] {
    return mapValues(Globals.sections!).filter(sec => sec.id > 0 && sec.words.has(wordKey(word)));
}
