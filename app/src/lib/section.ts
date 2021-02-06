import { ContentType } from "../models/ContentType";
import { FillNode } from "../models/FillNode";
import { GridSquare } from "../models/GridSquare";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { WordDirection } from "../models/WordDirection";
import { getUnfilledCrosses, getWordScore } from "./fill";
import { generateConstraintInfoForSquares, getLettersFromSquares } from "./grid";
import { forAllGridSquares, getEntryAtWordKey, getGrid, getSquaresForWord, getWordAtSquare, getSquareAtKey, isAcross, 
    isBlackSquare, mapKeys, squareKey, wordKey, wordLength, mapValues, isUserOrWordFilled, deepClone } from "./util";
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
                if (isUserOrWordFilled(gridSq) && canSq.content !== gridSq.content)
                    can.isFilteredOut = true;
            }
        });
    });
}

export function getSectionString(grid: GridState, section: Section): string {
    let ret = [] as string[];
    mapKeys(section.squares).sort().forEach(sqKey => {
        let sq = getSquareAtKey(grid, sqKey);
        let content = sq.content;
        ret.push(content ? content! : "-");
    });
    return ret.join("");
}

// returns whether it was a success
export function insertSectionCandidateIntoGrid(grid: GridState, candidate: SectionCandidate, 
    section: Section, contentType?: ContentType): boolean {
    let newGrid = deepClone(grid) as GridState;
    let foundDiscrepancy = false;
    section.squares.forEach((_, sqKey) => {
        let sq = getSquareAtKey(newGrid, sqKey);
        let candidateSq = getSquareAtKey(candidate.grid, sqKey);
        if (isUserOrWordFilled(sq) && sq.content! !== candidateSq.content!)
            foundDiscrepancy = true;
        sq.content = candidateSq.content;
        sq.viableLetters = [sq.content!];
        if (!isUserOrWordFilled(sq)) {
            sq.contentType = contentType === ContentType.HoverChosenSection ? ContentType.Autofill : ContentType.ChosenSection;
        }
    });
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

    grid.userFilledSectionCandidates.set(sectionCandidateKey(section, grid), true);
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
            let crosses = getUnfilledCrosses(grid, word);
            crosses.forEach(cross => {
                let crossKey = wordKey(cross);
                if (!section.words.has(crossKey))
                    section.neighboringCrosses.set(crossKey, true);
            });
        });
    });

    // calculate word order
    sections.forEach(section => {
        if (section.id === 0) {
            let wordOrder = [] as string[];
            let usedWords = new Map<string, boolean>();
            calculateSectionOrder(mapValues(sections)).forEach(id => {
                if (id === 0 && sections.size > 1) return;
                let secOrder = calculateWordOrder(grid, sections.get(id)!);
                wordOrder = wordOrder.concat(secOrder.filter(wk => !usedWords.has(wk)));
                secOrder.forEach(wk => {usedWords.set(wk, true);});
            });
            mapKeys(section.words).filter(wKey => !usedWords.has(wKey)).forEach(wk => {
                wordOrder.push(wk);
            });
            section.wordOrder = wordOrder;
            return;
        }

        section.wordOrder = calculateWordOrder(grid, section);
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
        return b.openSquareCount - a.openSquareCount;
    }).map(sec => sec.id);
}

function calculateWordOrder(grid: GridState, section: Section): string[] {
    function wordsSort(a: GridWord, b: GridWord): number {
        if (wordLength(a) !== wordLength(b)) return wordLength(b) - wordLength(a);
        return a.direction === WordDirection.Across ? a.start[0] - b.start[0] : a.start[1] - b.start[1];
    }

    function iterateWordGroup(group: GridWord[]) {
        if (group.length === 0) return;
        if (group.length === 1) {
            wordOrder.push(wordKey(group[0]));
            usedWords.set(wordKey(group[0]), true);
            return;
        }

        let centerIndex = Math.floor((rowOrCol(group[group.length-1]) - rowOrCol(group[0])) / 2);
        wordOrder.push(wordKey(group[centerIndex]));
        usedWords.set(wordKey(group[centerIndex]), true);
        iterateWordGroup(group.slice(0, centerIndex));
        iterateWordGroup(group.slice(centerIndex + 1));
    }

    let wordOrder = [] as string[];
    let usedWords = new Map<string, boolean>();

    // stack words
    if (section.stackWords.size > 0) {
        let acrossSortedStackWords = mapKeys(section.stackWords).map(wKey => grid.words.get(wKey)!)
            .filter(word => word.direction === WordDirection.Across).sort(wordsSort);
        let downSortedStackWords = mapKeys(section.stackWords).map(wKey => grid.words.get(wKey)!)
            .filter(word => word.direction === WordDirection.Down).sort(wordsSort);
        let longestStack = downSortedStackWords.length === 0 ? acrossSortedStackWords :
            acrossSortedStackWords.length === 0 ? downSortedStackWords :
            wordLength(acrossSortedStackWords[0]) >= wordLength(downSortedStackWords[0]) ? acrossSortedStackWords :
            downSortedStackWords;
        let otherStack = longestStack === acrossSortedStackWords ? downSortedStackWords : acrossSortedStackWords;
        [longestStack, otherStack].forEach(stack => {
            for (let i = 0; i < stack.length; i++) {
                let word = stack[i];
                let length = wordLength(word);
                let curGroup = [word];
                let prevRowOrCol = rowOrCol(word);
                for (let j = i+1; j < stack.length && wordLength(stack[j]) === length; j++) {
                    let newWord = stack[j];
                    let newRowOrCol = rowOrCol(newWord);
                    if (newRowOrCol - prevRowOrCol === 1) {
                        curGroup.push(newWord);
                        prevRowOrCol = newRowOrCol;
                        i++;
                    }
                    else break;
                }
    
                iterateWordGroup(curGroup);
            }
        });
    }

    // restOfWords
    let remainingWords = mapKeys(section.words).filter(wKey => !usedWords.has(wKey))
        .map(wKey => grid.words.get(wKey)!).sort(wordsSort);
    remainingWords.forEach(word => {
        wordOrder.push(wordKey(word));
    });

    return wordOrder;
}

function rowOrCol(word: GridWord): number {
    return word.direction === WordDirection.Across ? word.start[0] : word.start[1];
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
        sectionId: section.id,
        grid: grid,
        score: calculateSectionCandidateScore(grid, section),
        iffyEntry: node.iffyWordKey ? getEntryAtWordKey(grid, node.iffyWordKey) : undefined,
        isFilteredOut: false,
    } as SectionCandidate;
}

export function calculateSectionCandidateScore(grid: GridState, section: Section): number {
    let total = 0;
    let foundIffy = false;
    section.words.forEach((_, wordKey) => {
        let word = grid.words.get(wordKey)!;
        let squares = getSquaresForWord(grid, word);
        let str = getLettersFromSquares(squares);
        let score = getWordScore(str);
        if (score < 3) foundIffy = true;
        total += score;
    });

    if (!foundIffy) total *= 10;
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
    return n <= 26 ? natoAlphabet[String.fromCharCode(n+64)] : "Section " + n.toString();
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
        wordOrder: [],
        neighboringCrosses: new Map<string, boolean>(),
        candidates: new Map<string, SectionCandidate>(),
        connections: new Map<number, boolean>(),
        comboPermsQueue: [],
        comboPermsUsed: new Map<string, boolean>(),
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
