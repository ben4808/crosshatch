import { ContentType } from '../models/ContentType';
import { EntryCandidate } from '../models/EntryCandidate';
import { FillNode } from '../models/FillNode';
import { GridSquare } from '../models/GridSquare';
import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { QualityClass } from '../models/QualityClass';
import { Section } from '../models/Section';
import { WordDirection } from '../models/WordDirection';
import { generateConstraintInfoForSquares, getLettersFromSquares } from './grid';
import { PriorityQueue, priorityQueue } from './priorityQueue';
import { insertSectionCandidateIntoGrid } from './section';
import { deepClone, getSquaresForWord, wordLength, mapKeys, isWordFull, isUserFilled, 
    getWordAtSquare, otherDir, isWordEmpty, indexedWordListLookup, getRandomWordsOfLength, 
    wordKey, compareTuples, doesWordContainSquare } from './util';
import Globals from './windowService';

export function fillSectionWord() {
    let section = Globals.sections!.get(Globals.activeSectionId!)!;
    let selectedSectionsKey = Globals.selectedSectionIds!.sort().map(i => i.toString()).join(",");
    let fillQueue = section.fillQueues.get(selectedSectionsKey);
    if (!fillQueue) {
        let newFillQueue = priorityQueue<FillNode>();
        populateSeedNodes(newFillQueue, Globals.selectedSectionIds!);
        fillQueue = newFillQueue;
        section.fillQueues.set(selectedSectionsKey, fillQueue);
    }

    let score = processSectionNode(fillQueue!.peek()!, section);
    if (score === undefined) {
        
    }
}

function populateSeedNodes(fillQueue: PriorityQueue<FillNode>, selectedSectionIds: number[]) {
    let intersectingSectionIds = [] as number[];
    let activeSectionId = Globals.activeSectionId!;
    let activeSection = Globals.sections!.get(activeSectionId)!;
    selectedSectionIds.forEach(sid => {
        let otherSection = Globals.sections!.get(sid)!;
        if (sid !== activeSectionId && otherSection.candidates.length > 0 && doSectionsIntersect(sid, activeSectionId)) {
            intersectingSectionIds.push(sid);
        }
    });
    intersectingSectionIds.sort();

    if (intersectingSectionIds.length === 0) {
        fillQueue.insert(makeNewNode(Globals.puzzle!.grid, 0, false), 0);
        return;
    }

    let comboKey = intersectingSectionIds.map(x => x.toString()).join(",");
    let candidateCounts = intersectingSectionIds.map(i => Globals.sections!.get(i)!.candidates.length);
    let grid = Globals.puzzle!.grid;
    let newPermutations = getNewPermutations(candidateCounts, comboKey, activeSection);
    newPermutations.forEach(perm => {
        let node = makeNewNode(grid, 0, false);
        for (let i = 0; i < perm.length; i++) {
            let candidate = Globals.sections!.get(intersectingSectionIds[i])!.candidates[perm[i]];
            insertSectionCandidateIntoGrid(node.startGrid, candidate, activeSection);
        }
        fillQueue.insert(node, 0);
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

// returns score of best entryCandidate, or undefined if no viable options
export function processSectionNode(node: FillNode, section: Section): number | undefined {
    node.fillWord = selectWordToFill(node, section);

    populateAndScoreEntryCandidates(node);

    let viableCandidates = getViableCandidates(node);
    if(viableCandidates.length === 0) return undefined;

    node.chosenEntry = chooseEntryFromCandidates(viableCandidates);
    insertEntryIntoGrid(node.endGrid, node.fillWord!, node.chosenEntry);

    return node.entryCandidates[0].score!;
}

export function makeNewNode(grid: GridState, depth: number, isChainNode: boolean): FillNode {
    return {
        startGrid: deepClone(grid),
        endGrid: deepClone(grid),
        entryCandidates: [],
        depth: depth,
        isChainNode: isChainNode,
        backtracks: 0,
        madeUpWords: [],
    } as FillNode;
}

function selectWordToFill(node: FillNode, section: Section): GridWord | undefined {
    function priorityScore(wordKey: string): number {
        let word = grid.words.get(wordKey)!;
        let squares = getSquaresForWord(grid, word);
        let constraintScore = getWordConstraintScore(squares);
        if (section.stackWords.has(wordKey)) {
            return 1000 * wordLength(word) - constraintScore;
        }
        else {
            return 100 * wordLength(word) - constraintScore;
        }
    }

    let grid = node.startGrid;
    let wordScores = new Map<string, number>();
    mapKeys(section.words).forEach(key => {
        wordScores.set(key, priorityScore(key));
    });
    let prioritizedWordList = mapKeys(section.words).sort((a, b) => wordScores.get(a)! - wordScores.get(b)!);

    for (let key of prioritizedWordList) {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        if (!isWordFull(squares))
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
        let sum = sq.constraintInfo!.isCalculated ? sq.constraintInfo!.sumTotal : 1000;
        if (sum === 0) {
            foundZero = true;
            return;
        }
        total += Math.log2(sum + 1);
        unfilledSquareCount++;
    });

    return foundZero ? 0 : total / unfilledSquareCount;
}

function populateAndScoreEntryCandidates(node: FillNode) {
    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let crosses = getUnfilledCrosses(grid, node.fillWord!);
    if (crosses.length === 0) return;

    let oldLength = node.entryCandidates.length;
    while (true) {
        populateEntryCandidates(node);
        if (node.entryCandidates.length === oldLength) break;
        oldLength = node.entryCandidates.length;

        node.entryCandidates.filter(ec => ec.isViable).forEach(candidate => {
            let totalCrossScores = 0;
            let lowestCrossScore = 1e8;
            let isViable = true;
            crosses.forEach(cross => {
                if (!isViable) return;
                let squares = getSquaresForWord(grid, cross);
                let newSquares: GridSquare[] = deepClone(squares);
    
                let sqToReplace: GridSquare;
                let newVal: string;
                if (node.fillWord!.direction === WordDirection.Across) {
                    sqToReplace = newSquares.find(nsq => nsq.row === wordSquares[0].row)!;
                    newVal = candidate.word[sqToReplace.col - wordSquares[0].col];
                }
                else {
                    sqToReplace = newSquares.find(nsq => nsq.col === wordSquares[0].col)!;
                    newVal = candidate.word[sqToReplace.row - wordSquares[0].row];
                }
                sqToReplace.content = newVal;
    
                if (sqToReplace.constraintInfo && !sqToReplace.constraintInfo.viableLetters.has(newVal)) {
                    if (squares.length > 4 || node.madeUpWords.length > 0) {
                        isViable = false;
                        return;
                    }
                    else {
                        node.madeUpWords.push(wordKey(cross));
                    }
                }
                
                generateConstraintInfoForSquares(grid, newSquares);
                if (newSquares.find(sq => sq.constraintInfo!.isCalculated && sq.constraintInfo!.sumTotal === 0)) {
                    if (squares.length > 4 || node.madeUpWords.length > 0) {
                        isViable = false;
                        return;
                    }
                    else {
                        node.madeUpWords.push(wordKey(cross));
                    }
                }
                candidate.constraintSquaresForCrosses.push(newSquares);
    
                let crossScore = getWordConstraintScore(newSquares);
                totalCrossScores += crossScore;
                if (crossScore < lowestCrossScore) lowestCrossScore = crossScore;
            });
    
            if (!isViable) {
                candidate.score = 0;
                candidate.isViable = false;
                return;
            }
    
            candidate.score = calculateCandidateScore(candidate, totalCrossScores / crosses.length, lowestCrossScore);
        });

        // eslint-disable-next-line
        let viableCandidates = getViableCandidates(node);
        if (viableCandidates.length >= 10) break;
    }

    node.entryCandidates.sort((a, b) => b.score! - a.score!);
}

export function getUnfilledCrosses(grid: GridState, word: GridWord): GridWord[] {
    let squares = getSquaresForWord(grid, word);
    let crosses = squares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction)))
        .filter(w => w && !isWordFull(getSquaresForWord(grid, w)))
        .map(w => w!);
    return crosses.length > 0 ? crosses : [];
}

function populateEntryCandidates(node: FillNode) {
    let viableEntries = getViableCandidates(node);
    if (viableEntries.length >= 20) return;

    let entryMap = new Map<string, EntryCandidate>();
    node.entryCandidates.forEach(candidate => {
        entryMap.set(candidate.word, candidate);
    });

    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let fillOptions: string[];
    if (!isWordEmpty(wordSquares))
        fillOptions = indexedWordListLookup(grid, node.fillWord!).filter(x => !entryMap.has(x) && !grid.usedWords.has(x));
    else
        fillOptions = getRandomWordsOfLength(wordSquares.length).filter(x => !grid.usedWords.has(x));
    if (fillOptions.length === 0) return;

    fillOptions.sort((a, b) => Globals.qualityClasses!.get(b)! - Globals.qualityClasses!.get(a)!);

    for (let i = 0; i < 50; i++) {
        if (i >= fillOptions.length) break;
        let op = fillOptions[i];
        node.entryCandidates.push({
            word: op,
            minCrossEntries: 0,
            sumOfCrosses: 0,
            isViable: true,
            hasBeenChained: false,
            wasChainFailure: false,
            constraintSquaresForCrosses: [],
        });
    }
}

function calculateCandidateScore(candidate: EntryCandidate, averageCrossScore: number, lowestCrossScore: number): number {
    let rawScore = (averageCrossScore + (lowestCrossScore * 2)) / 3;

    let qualityClass = Globals.qualityClasses!.get(candidate.word);
    switch(qualityClass) {
        case QualityClass.Lively: return rawScore * 12;
        case QualityClass.Normal: return rawScore * 9;
        case QualityClass.Crosswordese: return rawScore * 3;
        case QualityClass.Iffy: return rawScore * 1;
    }

    return rawScore;
}

function getViableCandidates(node: FillNode): EntryCandidate[] {
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

function insertEntryIntoGrid(grid: GridState, word: GridWord, newEntry: EntryCandidate) {
    function processSquare() {
        if (crossIndex < crosses.length) {
            let cross = crosses[crossIndex];
            if (doesWordContainSquare(cross, curPos[0], curPos[1])) {
                let crossSquares = getSquaresForWord(grid, cross);
                let newCrossSquares = newEntry.constraintSquaresForCrosses[crossIndex];
                if (newCrossSquares.length > 0) {
                    crossSquares.forEach((sq, i) => {
                        grid.squares[sq.row][sq.col] = newEntry.constraintSquaresForCrosses[crossIndex][i];
                    });
                }

                let letters = getLettersFromSquares(newCrossSquares);
                if (!letters.includes(".")) grid.usedWords.set(letters, true);

                crossIndex++;
            }
        }
        
        let sq = grid.squares[curPos[0]][curPos[1]];
        sq.content = newEntry.word[wordIndex];
        sq.contentType = ContentType.Autofill;
        sq.constraintInfo = {
            isCalculated: true,
            sumTotal: 1,
            viableLetters: new Map<string, number>([[sq.content, 1]]),
        }
        wordIndex++;
    }

    let curPos = word.start;
    let wordIndex = 0;
    let crossIndex = 0;
    let crosses = getUnfilledCrosses(grid, word);
    while (!compareTuples(curPos, word.end)) {
        processSquare();

        curPos = word.direction === WordDirection.Across ?
            [curPos[0], curPos[1]+1] : [curPos[0]+1, curPos[1]];
    }
    processSquare();

    grid.usedWords.set(newEntry.word, true);
}
