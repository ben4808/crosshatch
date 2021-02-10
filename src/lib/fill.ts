import { ContentType } from '../models/ContentType';
import { EntryCandidate } from '../models/EntryCandidate';
import { FillNode } from '../models/FillNode';
import { GridSquare } from '../models/GridSquare';
import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { QualityClass } from '../models/QualityClass';
import { Section } from '../models/Section';
import { WordDirection } from '../models/WordDirection';
import { populateAndScoreEntryCandidates } from './entryCandidates';
import { processAndInsertChosenEntry } from './insertEntry';
import { PriorityQueue, priorityQueue } from './priorityQueue';
import { getSectionString, getSectionsWithWord, insertSectionCandidateIntoGrid, newSectionCandidate } from './section';
import { deepClone, getSquaresForWord, mapKeys, isWordFull, 
    getWordAtSquare, otherDir, mapValues, getSection, getGrid, wordKey } from './util';
import Globals from './windowService';

export function fillSectionWord(): boolean {
    let section = getSection();
    let fillQueue = section.fillQueue;
    if (!fillQueue) {
        let newFillQueue = priorityQueue<FillNode>();
        populateSeedNodes(newFillQueue);
        fillQueue = newFillQueue;
        section.fillQueue = newFillQueue;
    }

    let node = fillQueue.peek()!;
    if (!node) {
        populateSeedNodes(fillQueue);
        node = fillQueue.peek()!;
        if (!node) {
            return false;
        }
    }
    while (node.needsNewPriority || node.shouldBeDeleted) {
        node.needsNewPriority = false;
        fillQueue.pop();
        if (!node.shouldBeDeleted) fillQueue.insert(node, calculateNodePriority(node));
        node = fillQueue.peek()!;
        if (!node) return false;
    }
    while (node.isChainNode && node.chainId! !== Globals.curChainId!) {
        fillQueue.pop();
        node = fillQueue.peek()!;
        if (!node) return false;
    }

    if (!node.isChainNode && Globals.activeGrid !== node.startGrid) {
        Globals.activeGrid = node.startGrid;
        return true;
    }

    let success = processSectionNode(node, section);
    if (success) {
        let sectionString = getSectionString(node.endGrid, section);
        // is section filled?
        if (!sectionString.includes("-")) {
            let newSecCandidateFound = false;
            if (!section.candidates.has(sectionString)) {
                let newCandidate = newSectionCandidate(node, section);
                section.candidates.set(sectionString, newCandidate);
                Globals.activeGrid = node.endGrid;
                newSecCandidateFound = true;
            }
            
            invalidateChainNode(node, newSecCandidateFound);
            fillQueue.pop();
            return true;
        }

        Globals.activeGrid = node.endGrid;
        let newNode = makeNewNode(node.endGrid, node.depth + 1, true, node);
        
        if (section.id === 0) {
            let nextFillWord = selectWordToFill(node, getSection());
            let curSections = getSectionsWithWord(node.fillWord!);
            let nextSections = getSectionsWithWord(nextFillWord!);
            if (curSections.length > 0 && !curSections.find(cs => nextSections.find(ns => ns.id === cs.id))) {
                newNode = makeNewNode(node.endGrid, node.depth + 1, false, node, true);
                Globals.curChainId!++;
            }
        }
        
        fillQueue.insert(newNode, calculateNodePriority(newNode));
    }
    else {
        fillQueue.pop();
        if (node.isChainNode) invalidateChainNode(node);
        fillSectionWord();
    }

    Globals.selectedWordNode = undefined;
    return true;
}

function invalidateChainNode(node: FillNode, newSecCandidateFound?: boolean) {
    if (newSecCandidateFound === undefined) newSecCandidateFound = false;

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
        if (parent.parent && !parent.parent.isChainNode) {
            parent.isChainNode = false;
            parent.needsNewPriority = true;
            Globals.curChainId!++;
        }
            
        invalidateChainNode(parent);
    }

    if (newSecCandidateFound) {
        if (node.iffyWordKey && node.chainBaseNode!.chainIffyCandidates < 24) {
            node.chainBaseNode!.chainIffyCandidates++;
            return;
        }
        else if (!node.iffyWordKey && node.chainBaseNode!.chainGoodCandidates < 4) {
            node.chainBaseNode!.chainGoodCandidates++;
            return;
        }

        let curNode = parent;
        while (curNode.parent && (curNode.parent.isChainNode || curNode.parent.isSectionBase)) {
            if (curNode.isSectionBase) curNode.shouldBeDeleted = true;
            curNode = curNode.parent!;
        }
        curNode.isChainNode = false;
        curNode.needsNewPriority = true;
        Globals.curChainId!++;
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
    else if (node.isSectionBase)
        situationScore = (10000 + node.depth) * 10000;
    else
        situationScore = (10000 - node.depth) * 10000;

    return wordScore + situationScore;
}

function populateSeedNodes(fillQueue: PriorityQueue<FillNode>) {
    let grid = getGrid();
    let selectedSectionIds = [Globals.activeSectionId!]; //Globals.selectedSectionIds!.size > 0 ? mapKeys(Globals.selectedSectionIds!) : [0];
    let activeSection = getSection();
    let connectionIds = mapKeys(activeSection.connections)
        .filter(id => selectedSectionIds.includes(id) && Globals.sections!.get(id)!.selectedCandidate === undefined
            && Globals.sections!.get(id)!.candidates.size > 0)
        .sort();
    let candidateCounts = connectionIds.map(i => Globals.sections!.get(i)!.candidates.size);
    
    getNewPermutations(candidateCounts, activeSection);
    activeSection.comboPermsQueue.forEach(perm => {
        let node = makeNewNode(grid, 0, false, undefined);
        if (perm[0] === -1) {
            fillQueue.insert(node, calculateNodePriority(node));
            return;
        }
        let wasSuccess = true;
        for (let i = 0; i < perm.length; i++) {
            let sortedCandidates = mapValues(Globals.sections!.get(connectionIds[i])!.candidates)
                .sort((a, b) => b.score - a.score);
            let candidate = sortedCandidates[perm[i]];
            if (!insertSectionCandidateIntoGrid(node.startGrid, candidate, ContentType.Autofill))
                wasSuccess = false;
        }
        if (wasSuccess)
            fillQueue.insert(node, calculateNodePriority(node));
    });
}

function getNewPermutations(candidateCounts: number[], section: Section) {
    function comboKey(perm: number[]): string {
        return "[" + perm.map(n => n.toString()).join(",") + "]";
    }

    if (section.comboPermsUsed.size > 0 && section.comboPermsQueue.length > 0 && section.comboPermsQueue[0][0] === -1)
        section.comboPermsQueue.shift();
    if (section.comboPermsUsed.size > 0 && section.comboPermsQueue.length === 0) return;

    if (candidateCounts.length === 0) {
        let defaultCombo = [-1];
        section.comboPermsQueue = [defaultCombo];
        section.comboPermsUsed.set(comboKey(defaultCombo), true);
        return;
    }

    if (section.comboPermsUsed.size === 0) {
        let allOnes = [] as number[];
        for(let i = 0; i < candidateCounts.length; i++) allOnes.push(1);
        section.comboPermsQueue = [allOnes];
        section.comboPermsUsed.set(comboKey(allOnes), true);
        return;
    }

    while(true) {
        let perm = section.comboPermsQueue.shift()!;
        if (!perm) break;
        let foundNew = false;

        for(let i = 0; i < perm.length; i++) {
            if (perm[i] === candidateCounts[i] - 1) continue;
    
            let newPerm = deepClone(perm);
            newPerm[i]++;
            let newPermKey = comboKey(newPerm);
            if (section.comboPermsUsed.has(newPermKey)) continue;

            section.comboPermsUsed.set(newPermKey, true);
            foundNew = true;
            section.comboPermsQueue.push(newPerm);
        }

        if (foundNew) break;
    }
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

export function makeNewNode(grid: GridState, depth: number, isChainNode: boolean, parent: FillNode | undefined, 
    isSectionBase?: boolean): FillNode {
    return {
        startGrid: deepClone(grid),
        endGrid: deepClone(grid),
        entryCandidates: [],
        depth: depth,
        isChainNode: isChainNode,
        isSectionBase: !!isSectionBase,
        backtracks: 0,
        parent: parent,
        chainBaseNode: isChainNode ? (parent!.isChainNode ? parent!.chainBaseNode : parent!) : undefined,
        needsNewPriority: false,
        shouldBeDeleted: false,
        anchorSquareKeys: [],
        anchorCombosLeft: [],
        viableLetterCounts: new Map<string, Map<string, number>>(),
        iffyWordKey: parent ? parent.iffyWordKey : undefined,
        chainGoodCandidates: parent ? parent.chainGoodCandidates : 0,
        chainIffyCandidates: parent ? parent.chainIffyCandidates : 0,
        chainId: Globals.curChainId!,
        topCrossScore: 0,
        topMinCrossScore: 0,
    } as FillNode;
}

function selectWordToFill(node: FillNode, section: Section): GridWord | undefined {
    let grid = node.startGrid;

    for (let key of section.wordOrder) {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        if (wordKey(word) !== node.iffyWordKey && !isWordFull(squares))
            return word;
    }

    return undefined;
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
    let topScore = candidates[0].score!;
    let total = 0;
    candidates.forEach(c => {
        total += Math.pow(c.score / topScore, 4);
    });

    let roll = Math.random() * total;
    let runningTotal = 0;
    for (let can of candidates) {
        runningTotal += Math.pow(can.score / topScore, 4);
        if (runningTotal >= roll)
            return can;
    }

    return candidates[0];
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
