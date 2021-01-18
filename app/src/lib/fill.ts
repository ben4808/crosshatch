import { EntryCandidate } from '../models/EntryCandidate';
import { FillNode } from '../models/FillNode';
import { GridSquare } from '../models/GridSquare';
import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { QualityClass } from '../models/QualityClass';
import { Section } from '../models/Section';
import { WordDirection } from '../models/WordDirection';
import { populateAndScoreEntryCandidates } from './entryCandidates';
import { getLettersFromSquares } from './grid';
import { processAndInsertChosenEntry } from './insertEntry';
import { PriorityQueue, priorityQueue } from './priorityQueue';
import { getSectionString, getSelectedSectionsKey, insertSectionCandidateIntoGrid, newSectionCandidate } from './section';
import { deepClone, getSquaresForWord, wordLength, mapKeys, isWordFull, isUserFilled, 
    getWordAtSquare, otherDir, mapValues, getSection, getGrid, wordKey } from './util';
import Globals from './windowService';

export function fillSectionWord(): boolean {
    let section = getSection();
    let selectedSectionsKey = getSelectedSectionsKey();
    let fillQueue = section.fillQueues.get(selectedSectionsKey);
    if (!fillQueue) {
        let newFillQueue = priorityQueue<FillNode>();
        populateSeedNodes(newFillQueue);
        fillQueue = newFillQueue;
        section.fillQueues.set(selectedSectionsKey, fillQueue);
    }

    let node = fillQueue.peek()!;
    if (!node) return false;
    while (node.needsNewPriority) {
        node.needsNewPriority = false;
        fillQueue.pop();
        fillQueue.insert(node, calculateNodePriority(node));
        node = fillQueue.peek()!;
        if (!node) return false;
    }

    let success = processSectionNode(node, section);
    if (success) {
        let sectionString = getSectionString(node.endGrid, section);
        // is section filled?
        if (!sectionString.includes("-") && !section.candidates.has(sectionString)) {
            let newCandidate = newSectionCandidate(node, section);
            section.candidates.set(sectionString, newCandidate);
            Globals.activeGrid = node.endGrid;
            invalidateChainNode(node);
            fillQueue.pop();
            return true;
        }

        Globals.activeGrid = node.endGrid;
        let newNode = makeNewNode(node.endGrid, node.depth + 1, true, node);
        fillQueue.insert(newNode, calculateNodePriority(newNode));
    }
    else {
        fillQueue.pop();
        if (node.isChainNode) invalidateChainNode(node);
        fillSectionWord();
    }

    return true;
}

function invalidateChainNode(node: FillNode) {
    let parent = node.parent!;
    if (!parent) return;

    let prevCandidate = parent.chosenEntry!;
    if (parent.isChainNode) {
        if (prevCandidate)
            prevCandidate.wasChainFailure = true;
        parent.backtracks++;
    }
    else {
        if (prevCandidate)
            prevCandidate.hasBeenChained = true;
    }

    parent.chosenEntry = undefined;
    parent.iffyWordKey = parent.parent ? parent.parent.iffyWordKey : undefined;
    parent.endGrid = deepClone(parent.startGrid);

    if (parent.backtracks >= 3) {
        parent.isChainNode = false;
        parent.needsNewPriority = true;
        invalidateChainNode(parent);
    }
}

function calculateNodePriority(node: FillNode): number {
    let grid = node.startGrid;
    let wordScore = 0;
    grid.usedWords.forEach((_, word) => {
        wordScore += getWordScore(word);
    });

    let situationScore: number;
    if (node.isChainNode)
        situationScore = 1e8 + 10000*(node.depth+1);
    else
        situationScore = (10000 - node.depth) * 10000;

    return wordScore + situationScore;
}

function populateSeedNodes(fillQueue: PriorityQueue<FillNode>) {
    let grid = getGrid();
    let selectedSectionIds = Globals.selectedSectionIds!.size > 0 ? mapKeys(Globals.selectedSectionIds!) : [0];
    let intersectingSectionIds = [] as number[];
    let activeSectionId = Globals.activeSectionId!;
    let activeSection = getSection();
    selectedSectionIds.forEach(sid => {
        let otherSection = Globals.sections!.get(sid)!;
        if (sid !== activeSectionId && otherSection.candidates.size > 0 && doSectionsIntersect(sid, activeSectionId)) {
            intersectingSectionIds.push(sid);
        }
    });
    intersectingSectionIds.sort();

    if (intersectingSectionIds.length === 0) {
        let newNode = makeNewNode(grid, 0, false, undefined);
        fillQueue.insert(newNode, calculateNodePriority(newNode));
        return;
    }

    let comboKey = intersectingSectionIds.map(x => x.toString()).join(",");
    let candidateCounts = intersectingSectionIds.map(i => Globals.sections!.get(i)!.candidates.size);
    let newPermutations = getNewPermutations(candidateCounts, comboKey, activeSection);
    newPermutations.forEach(perm => {
        let node = makeNewNode(grid, 0, false, undefined);
        for (let i = 0; i < perm.length; i++) {
            let candidate = mapValues(Globals.sections!.get(intersectingSectionIds[i])!.candidates)[perm[i]];
            insertSectionCandidateIntoGrid(node.startGrid, candidate, activeSection);
        }
        fillQueue.insert(node, calculateNodePriority(node));
    });
}

function getNewPermutations(candidateCounts: number[], comboKey: string, section: Section): number[][] {
    function processPerm() {
        let perm = permsQueue.shift();
        if (!perm || newPerms.length >= 50) return;

        let permKey = perm.map(i => i.toString()).join(",");
        if (triedPerms.has(permKey)) return;

        triedPerms.set(permKey, true);
        newPerms.push(perm);

        for(let i = 0; i < perm.length; i++) {
            if (perm[i] === candidateCounts[i] - 1) continue;

            let newPerm = deepClone(perm);
            newPerm[i]++;
            permsQueue.push(newPerm);
        }

        processPerm();
    }

    let curIs = [] as number[];
    let newPerms = [] as number[][];
    for(let i = 0; i < candidateCounts.length; i++) curIs.push(1);
    let triedPerms = section.triedComboPerms.get(comboKey)!;
    let permsQueue = [curIs];

    processPerm();
    return newPerms;
}

function doSectionsIntersect(id1: number, id2: number) {
    let wordKeys1 = mapKeys(Globals.sections!.get(id1)!.words);
    let wordKeys2 = mapKeys(Globals.sections!.get(id2)!.words);

    return wordKeys1.find(w => wordKeys2.includes(w));
}

export function processSectionNode(node: FillNode, section: Section): boolean {
    if (!node.fillWord)
        node.fillWord = selectWordToFill(node, section);

    if (node.anchorSquareKeys.length === 0 || node.anchorCombosLeft.length > 0) {
        let areEligibleCandidates = populateAndScoreEntryCandidates(node, false);
        if (!areEligibleCandidates) return false;
    }

    let eligibleCandidates = getEligibleCandidates(node);
    if (eligibleCandidates.length > 0) {
        node.chosenEntry = chooseEntryFromCandidates(eligibleCandidates);
        processAndInsertChosenEntry(node);
        return true;
    }
    
    return false;
}

export function makeNewNode(grid: GridState, depth: number, isChainNode: boolean, parent: FillNode | undefined): FillNode {
    return {
        startGrid: deepClone(grid),
        endGrid: deepClone(grid),
        entryCandidates: [],
        depth: depth,
        isChainNode: isChainNode,
        backtracks: 0,
        madeUpWord: undefined,
        parent: parent,
        needsNewPriority: false,
        anchorSquareKeys: [],
        anchorCombosLeft: [],
        viableLetterCounts: new Map<string, Map<string, number>>(),
        iffyWordKey: parent ? parent.iffyWordKey : undefined,
    } as FillNode;
}

function selectWordToFill(node: FillNode, section: Section): GridWord | undefined {
    function priorityScore(wordKey: string): number {
        let word = grid.words.get(wordKey)!;
        let squares = getSquaresForWord(grid, word);
        let pattern = getLettersFromSquares(squares);
        let openLetters = pattern.length - pattern.replaceAll("-", "").length;
        let constraintScore = getWordConstraintScore(squares);
        if (section.stackWords.has(wordKey)) {
            return 1000 * wordLength(word) + 10*openLetters - constraintScore;
        }
        else {
            return 100 * wordLength(word) + 10*openLetters - constraintScore;
        }
    }

    let grid = node.startGrid;
    let wordScores = new Map<string, number>();
    mapKeys(section.words).forEach(key => {
        wordScores.set(key, priorityScore(key));
    });
    let prioritizedWordList = mapKeys(section.words).sort((a, b) => wordScores.get(b)! - wordScores.get(a)!);

    for (let key of prioritizedWordList) {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        if (wordKey(word) !== node.iffyWordKey && !isWordFull(squares))
            return word;
    }

    return undefined;
}

function getWordConstraintScore(squares: GridSquare[]): number {
    let total = 0;
    let unfilledSquareCount = 0;
    let foundZero = false;
    squares.forEach(sq => {
        if (isUserFilled(sq)) return;
        let sum = (sq.constraintInfo && sq.constraintInfo.isCalculated) ? sq.constraintInfo!.letterFillCount : 26;
        if (sum === 0) {
            foundZero = true;
            return;
        }
        total += Math.log2(sum + 1);
        unfilledSquareCount++;
    });

    return (foundZero || unfilledSquareCount === 0) ? 0 : total / unfilledSquareCount;
}

export function getPositionOfCross(wordSquares: GridSquare[], crossSquares: GridSquare[], dir: WordDirection): number {
    return dir === WordDirection.Across ? 
            wordSquares[0].row - crossSquares[0].row : 
            wordSquares[0].col - crossSquares[0].col;
}

export function getAllCrosses(grid: GridState, word: GridWord): GridWord[] {
    let squares = getSquaresForWord(grid, word);
    let crosses = squares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction)))
        .filter(w => w).map(w => w!);
    return crosses.length > 0 ? crosses : [];
}

export function getUnfilledCrosses(grid: GridState, word: GridWord): GridWord[] {
    let squares = getSquaresForWord(grid, word);
    let crosses = squares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction)))
        .filter(w => w && !isWordFull(getSquaresForWord(grid, w)))
        .map(w => w!);
    return crosses.length > 0 ? crosses : [];
}

export function getEligibleCandidates(node: FillNode): EntryCandidate[] {
    if (node.isChainNode) {
        return node.entryCandidates.filter(ec => ec.isViable && !ec.wasChainFailure);
    }
    else {
        return node.entryCandidates.filter(ec => ec.isViable && !ec.hasBeenChained);
    }
}

function chooseEntryFromCandidates(candidates: EntryCandidate[]): EntryCandidate {
    let weightedCandidates = deepClone(candidates) as EntryCandidate[];

    let topScore = weightedCandidates[0].score!;
    weightedCandidates.forEach(c => {
        c.score! = Math.pow(c.score! / topScore, 3);
    });

    let roll = Math.random();
    for (let i = weightedCandidates.length - 1; i >= 0; i--) {
        let score = weightedCandidates[i].score!;
        if (score >= roll)
            return candidates.find(c => c.word === weightedCandidates[i].word)!;
    }

    return candidates.find(c => c.word === weightedCandidates[0].word)!;
}

export function getWordScore(word: string): number {
    let qualityClass = Globals.qualityClasses!.get(word);
    if (!qualityClass) return 0;

    switch(qualityClass) {
        case QualityClass.Lively: return 12;
        case QualityClass.Normal: return 9;
        case QualityClass.Crosswordese: return 3;
        case QualityClass.Iffy: return 1;
    }
}
