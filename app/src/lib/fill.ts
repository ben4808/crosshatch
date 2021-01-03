import { ContentType } from '../models/ContentType';
import { EntryCandidate } from '../models/EntryCandidate';
import { FillNode } from '../models/FillNode';
import { GridSquare } from '../models/GridSquare';
import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { QualityClass } from '../models/QualityClass';
import { Section } from '../models/Section';
import { SectionCandidate } from '../models/SectionCandidate';
import { WordDirection } from '../models/WordDirection';
import { generateConstraintInfoForSquares, getLettersFromSquares } from './grid';
import { PriorityQueue, priorityQueue } from './priorityQueue';
import { getSectionString, getSelectedSectionsKey, insertSectionCandidateIntoGrid, newSectionCandidate, sectionCandidateKey } from './section';
import { deepClone, getSquaresForWord, wordLength, mapKeys, isWordFull, isUserFilled, 
    getWordAtSquare, otherDir, squareKey, isPartOfMadeUpWord, wordKey, mapValues, getSectionCandidatesFromKeys, getSection, getGrid, getSquareAtKey } from './util';
import Globals from './windowService';
import { queryIndexedWordList } from './wordList';

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
        prevCandidate.wasChainFailure = true;
        parent.backtracks++;
    }
    else {
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
    node.fillWord = selectWordToFill(node, section);

    while (true) {
        populateAndScoreEntryCandidates(node, false);

        let eligibleCandidates = getEligibleCandidates(node);
        if(eligibleCandidates.length === 0) return false;

        node.chosenEntry = chooseEntryFromCandidates(eligibleCandidates);
        if (processAndInsertChosenEntry(node))
            break;
    }

    return true;
}

export function processAndInsertChosenEntry(node: FillNode, contentType?: ContentType): boolean {
    if (contentType === undefined) contentType = ContentType.Autofill;
    if (!node.chosenEntry) return false;

    let grid = deepClone(node.startGrid) as GridState;
    let word = node.fillWord!;
    let chosenEntry = node.chosenEntry!;
    let wordSquares = getSquaresForWord(grid, word);
    let newCrossSquares = [] as GridSquare[][];
    let crosses = getUnfilledCrosses(grid, word);
    crosses.concat(getChangedCrosses(grid, word, node.chosenEntry!.word));

    let sectionCandidates = getSectionCandidatesFromKeys(mapKeys(grid.userFilledSectionCandidates));
    sectionCandidates.forEach(sc => {
        let section = Globals.sections!.get(sc.sectionId)!;
        wordSquares.forEach((sq, i) => {
            if (sc.grid.squares[sq.row][sq.col].content !== node.chosenEntry!.word[i])
                grid.userFilledSectionCandidates.delete(sectionCandidateKey(section, grid));
        });
    });

    let foundZero = !!node.iffyWordKey;
    let zeroCrossKey = undefined as string | undefined;

    // unchecked squares
    wordSquares.forEach((sq, i) => {
        if ((word.direction === WordDirection.Across && !crosses.find(c => c.start[1] === sq.col)) ||
            (word.direction === WordDirection.Down && !crosses.find(c => c.start[0] === sq.row))) {
            sq.content = chosenEntry.word[i];
        }
    });

    crosses.forEach(cross => {
        let crossKey = wordKey(cross);
        let crossSquares = getSquaresForWord(grid, cross);
        let crossPos = getPositionOfCross(wordSquares, crossSquares, word.direction);
        let newSquares = deepClone(crossSquares) as GridSquare[];
        let newCharPos = word.direction === WordDirection.Across ?
            wordSquares.findIndex(sq => sq.col === cross.start[1])! :
            wordSquares.findIndex(sq => sq.row === cross.start[0])!;
        if (contentType !== ContentType.Autofill)
            removeNonmatchingUserWords(grid, newSquares[crossPos], chosenEntry.word[newCharPos], 
                word.direction, sectionCandidates.length > 0 ? sectionCandidates[0] : undefined, contentType!);
        newSquares[crossPos].content = chosenEntry.word[newCharPos];
        newSquares[crossPos].contentType = contentType!;
        generateConstraintInfoForSquares(grid, newSquares);
        newCrossSquares.push(newSquares);

        newSquares.forEach(sq => {
            if (crossKey !== node.iffyWordKey && sq.constraintInfo!.isCalculated && sq.constraintInfo!.sumTotal === 0) {
                if (!foundZero && crossSquares.length < 5) {
                    foundZero = true;
                    zeroCrossKey = crossKey;
                }
                else return false;
            }
        });
    });

    crosses.forEach((cross, i) => {
        let crossSquares = getSquaresForWord(grid, cross);
        let newSquares = newCrossSquares[i];
        for(let j = 0; j < crossSquares.length; j++) {
            let crossSquare = crossSquares[j];
            grid.squares[crossSquare.row][crossSquare.col] = newSquares[j];
        }
        if (isWordFull(crossSquares)) {
            grid.usedWords.set(getLettersFromSquares(crossSquares), true);
        }
    });

    wordSquares = getSquaresForWord(grid, word);
    grid.usedWords.set(getLettersFromSquares(wordSquares), true);
    if (contentType === ContentType.ChosenWord)
        grid.userFilledWordKeys.set(wordKey(word), true);
    node.endGrid = grid;
    if (zeroCrossKey) node.iffyWordKey = zeroCrossKey;
    return true;
}

function removeNonmatchingUserWords(grid: GridState, sq: GridSquare, newContent: string, 
        fillDir: WordDirection, sc: SectionCandidate | undefined, contentType: ContentType) {
    if (!sq.content || sq.content === newContent) return;
    
    if (sq.contentType === ContentType.ChosenWord) {
        let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(fillDir))!;
        let crossSquares = getSquaresForWord(grid, cross);
        crossSquares.forEach(crossSq => {
            if (crossSq === sq) return;

            let crossCross = getWordAtSquare(grid, crossSq.row, crossSq.col, fillDir);
            if (!crossCross || !grid.userFilledWordKeys.has(wordKey(crossCross))) {
                if (sc)
                    sq.content = sc.grid.squares[sq.row][sq.col].content;
                else
                    sq.content = undefined;
                sq.contentType = contentType;
            }
        });
    }
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
    let prioritizedWordList = mapKeys(section.words).sort((a, b) => wordScores.get(b)! - wordScores.get(a)!);

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
        let sum = (sq.constraintInfo && sq.constraintInfo.isCalculated) ? sq.constraintInfo!.sumTotal : 1000;
        if (sum === 0) {
            foundZero = true;
            return;
        }
        total += Math.log2(sum + 1);
        unfilledSquareCount++;
    });

    return (foundZero || unfilledSquareCount === 0) ? 0 : total / unfilledSquareCount;
}

export function populateAndScoreEntryCandidates(node: FillNode, processAllCandidates: boolean) {
    if (node.anchorSquareKeys.length === 0)
        populateFillWordAnchors(node);

    while(true) {
        processAnchorCombo(node);
        let eligibleCandidates = getEligibleCandidates(node);
        if (node.anchorCombosLeft.length === 0) break;
        if (!processAllCandidates && eligibleCandidates.length >= 20) break;
        if (processAllCandidates && eligibleCandidates.length >= 250) break;
    }

    node.entryCandidates.sort((a, b) => b.score! - a.score!);
}

function populateFillWordAnchors(node: FillNode) {
    let grid = node.startGrid;
    let wordSquares = getSquaresForWord(grid, node.fillWord!);
    let dir = node.fillWord!.direction;

    let filledSquares = wordSquares.filter(sq => sq.content && !sq.isEmptyForManualFill);
    let unfilledSquares = wordSquares.filter(sq => !sq.content || sq.isEmptyForManualFill);
    // <squareKey, <letter, count>>
    node.viableLetterCounts = new Map<string, Map<string, number>>();
    node.anchorSquareKeys = [];
    node.anchorCombosLeft = [];
    let anchorKeyCounts = [] as [string, number][];

    filledSquares.forEach(sq => {
        node.viableLetterCounts.set(squareKey(sq), new Map<string, number>([[sq.content!, 1]]),);
        if (anchorKeyCounts.length < 2)
            anchorKeyCounts.push([squareKey(sq), 1]);
    });

    unfilledSquares.forEach(sq => {
        let crossCounts = new Map<string, number>();
        let viableLetterScore = 0;
        let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(dir))!;
        if (cross === undefined) return; // unchecked square
        let crossSquares = getSquaresForWord(grid, cross);
        let pattern = getLettersFromSquares(crossSquares);
        let pos = getPositionOfCross(wordSquares, crossSquares, dir);

        for(let i = 65; i <= 90; i++) {
            let newChar = String.fromCharCode(i);
            let newPattern = pattern.substring(0, pos) + newChar + pattern.substring(pos + 1);
            let queryResults = queryIndexedWordList(newPattern);
            if (queryResults.length > 0) {
                let letterScore = 0;
                if (queryResults.length > 10) {
                    letterScore = queryResults.length * 0.7;
                }
                else {
                    for (let j = 0; j < queryResults.length; j++) {
                        letterScore += getWordScore(queryResults[j]);
                    }
                }
               
                viableLetterScore += letterScore / queryResults.length / 9;
                crossCounts.set(newChar, letterScore);
            }
        }

        if (viableLetterScore > 0) {
            if (anchorKeyCounts.length < 2)
                anchorKeyCounts.push([squareKey(sq), viableLetterScore]);
            else if (viableLetterScore < anchorKeyCounts[1][1]) {
                anchorKeyCounts[1] = [squareKey(sq), viableLetterScore];
                anchorKeyCounts = anchorKeyCounts.sort((a, b) => a[1] - b[1]);
            }
        }

        node.viableLetterCounts.set(squareKey(sq), crossCounts);
    });

    if (anchorKeyCounts.length < 2) return;
    node.anchorSquareKeys = [anchorKeyCounts[0][0], anchorKeyCounts[1][0]];
    generateAnchorCombos(node);
}

function getPositionOfCross(wordSquares: GridSquare[], crossSquares: GridSquare[], dir: WordDirection): number {
    return dir === WordDirection.Across ? 
            wordSquares[0].row - crossSquares[0].row : 
            wordSquares[0].col - crossSquares[0].col;
}

function generateAnchorCombos(node: FillNode) {
    let grid = node.startGrid;
    let counts1 = node.viableLetterCounts.get(node.anchorSquareKeys[0])!;
    let counts2 = node.viableLetterCounts.get(node.anchorSquareKeys[1])!;
    let userFilled1 = isUserFilled(getSquareAtKey(grid, node.anchorSquareKeys[0]));
    let userFilled2 = isUserFilled(getSquareAtKey(grid, node.anchorSquareKeys[1]));
    let anchor1Letters = mapKeys(counts1);
    let anchor2Letters = mapKeys(counts2);
    let fullAlphabet = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];
    for (var key1 of userFilled1 ? anchor1Letters : fullAlphabet) {
        for (var key2 of userFilled2 ? anchor2Letters : fullAlphabet) {
            node.anchorCombosLeft.push([key1, key2]);
        }
    }
    node.anchorCombosLeft = node.anchorCombosLeft.sort((a, b) => {
        let countA1 = counts1.get(a[0]) || 0;
        let countA2 = counts2.get(a[1]) || 0;
        let countB1 = counts1.get(b[0]) || 0;
        let countB2 = counts2.get(b[1]) || 0;
        return (countA1 * countA2) - (countB1 * countB2);
    });
}

function processAnchorCombo(node: FillNode) {
    if (node.anchorCombosLeft.length === 0) return;

    let grid = node.startGrid;
    let combo = node.anchorCombosLeft.pop()!;
    let wordSquares = deepClone(getSquaresForWord(grid, node.fillWord!)) as GridSquare[];
    let square1 = wordSquares.find(sq => squareKey(sq) === node.anchorSquareKeys[0])!;
    let square2 = wordSquares.find(sq => squareKey(sq) === node.anchorSquareKeys[1])!;
    square1.content = combo[0];
    square2.content = combo[1];
    let pattern = getLettersFromSquares(wordSquares);
    let entries = queryIndexedWordList(pattern);
    let existingMadeUpSqKey = squareKey(wordSquares.find(sq => isPartOfMadeUpWord(sq)));

    entries.forEach(entry => {
        let letterCountsTotal = 0;
        let containsZeroSquare = false;
        let isUnviable = false;
        let madeUpSqKey = existingMadeUpSqKey;
        let madeUpWord = undefined as string | undefined;
        wordSquares.forEach((sq, i) => {
            let sqKey = squareKey(sq);
            let letterCounts = node.viableLetterCounts.get(sqKey)!;
            if (!letterCounts) return;
            let cross = getWordAtSquare(grid, sq.row, sq.col, otherDir(node.fillWord!.direction))!;

            if (!letterCounts.has(entry[i])) {
                containsZeroSquare = true;
                if (wordLength(cross) < 5 && (!madeUpSqKey || sqKey === madeUpSqKey)) {
                    madeUpSqKey = sqKey;
                    let crossSquares = getSquaresForWord(grid, cross);
                    let crossPos = getPositionOfCross(wordSquares, crossSquares, node.fillWord!.direction);
                    let crossPattern = getLettersFromSquares(crossSquares);
                    madeUpWord = crossPattern.substring(0, crossPos) + entry[i] + crossPattern.substring(crossPos + 1);
                }
                else isUnviable = true;
            }
            else {
                letterCountsTotal += letterCounts.get(entry[i])!;
            }

            if (grid.usedWords.has(entry))
                isUnviable = true;
        });

        node.entryCandidates.push({
            word: entry,
            score: isUnviable ? 0 : calculateEntryCandidateScore(entry, letterCountsTotal, containsZeroSquare),
            isViable: !isUnviable,
            hasBeenChained: false,
            wasChainFailure: false,
            madeUpSqKey: madeUpSqKey,
            madeUpWord: madeUpWord,
        } as EntryCandidate);
    });
}

function calculateEntryCandidateScore(entry: string, letterCountsTotal: number, containsZeroSquare: boolean): number {
    let ret = letterCountsTotal * (!containsZeroSquare ? getWordScore(entry) : 1);
    return ret;
}

export function getUnfilledCrosses(grid: GridState, word: GridWord): GridWord[] {
    let squares = getSquaresForWord(grid, word);
    let crosses = squares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction)))
        .filter(w => w && !isWordFull(getSquaresForWord(grid, w)))
        .map(w => w!);
    return crosses.length > 0 ? crosses : [];
}

export function getChangedCrosses(grid: GridState, word: GridWord, newEntry: string): GridWord[] {
    let squares = getSquaresForWord(grid, word);
    let crosses = squares
        .filter((sq, i) => sq.content && sq.content !== newEntry[i])
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction)))
        .map(w => w!);
    return crosses.length > 0 ? crosses : [];
}

function getEligibleCandidates(node: FillNode): EntryCandidate[] {
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
