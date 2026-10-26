import { GridSquare } from '../models/GridSquare';
import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { Section } from '../models/Section';
import { FillFrame, FillSearchState } from '../models/FillSearchState';
import { FillNode } from '../models/FillNode';
import { ContentType } from '../models/ContentType';
import { EntryCandidate } from '../models/EntryCandidate';
import { SectionCandidate } from '../models/SectionCandidate';
import { addDepthsBelow, clearFrom, DepthSet, depthSetWidthFor, maxDepth, newDepthSet, unionInto } from './depthSet';
import { buildEntryCandidates, estimateWordOpenness, ForwardCheckFailure, forwardCheckSection } from './entryCandidates';
import { addClaimCulprits, addSquareCulprits, placeEntryWithTrail, undoFillTrailTo } from './insertEntry';
import { getSectionSquareCoords, getSectionWordList, newSectionCandidateFromGrid } from './section';
import { findPackedWordId } from './sharedWordIndex';
import { cloneGridForFill, getSquaresForWord, isWordFull,
    getWordAtSquare, otherDir, getSection, getGrid, shuffleArray } from './util';
import { countExtraUsed, countLikelyGettableUsed } from './wordList';
import Globals from './windowService';

/** Run steps for about this long before yielding to the event loop. */
const SLICE_MS = 12;
/** Steps before the first randomized restart; each restart multiplies the budget. */
const INITIAL_RUN_BUDGET = 2000;
const RUN_BUDGET_GROWTH = 2;

export type FillStepResult = "continue" | "found" | "done";

type FillFoundHandler = (candidate: SectionCandidate) => void;

/**
 * One step of depth-first autofill on a single mutable working grid.
 * Uses a trail for undo so siblings don't require per-candidate clones.
 * Does not update the visible active grid — callers collect fills from section.candidates.
 * @returns false when the search stack is empty (no more work).
 */
export function fillSectionWord(): boolean {
    return fillSectionWordStep() !== "done";
}

/**
 * Like fillSectionWord, but distinguishes a newly discovered complete fill.
 * New fills go to onFound when given, otherwise into section.candidates.
 *
 * Candidates are tried in random order with periodic restarts (growing budget), and
 * dead ends backjump to the deepest frame that explains them (conflict-directed
 * backjumping) instead of retrying unrelated shallower choices. A run that empties the
 * stack within its budget has exhausted the search space.
 */
export function fillSectionWordStep(section: Section = getSection(), onFound?: FillFoundHandler): FillStepResult {
    let state = section.fillState;
    if (!state) {
        state = createFillSearchState(getGrid(), section);
        section.fillState = state;
    }

    let stack = state.stack;
    if (stack.length === 0) return "done";
    if (++state.runSteps > state.runBudget) restartSearch(state);

    let grid = state.grid;
    let frame = stack[stack.length - 1];

    // Returning from a finished child: undo the placement that spawned it.
    if (frame.livePlacementMark !== undefined) {
        undoFillTrailTo(state, frame.livePlacementMark);
        frame.livePlacementMark = undefined;
    }

    if (!frame.fillWord) {
        frame.fillWord = selectWordToFill(grid, section);
        if (!frame.fillWord) {
            addDepthsBelow(frame.conflict, frame.depth);
            exhaustFrame(state);
            return "continue";
        }
    }

    if (!frame.built) {
        frame.built = true;
        let squares = getSquaresForWord(grid, frame.fillWord);
        frame.entryCandidates = buildEntryCandidates(grid, frame.fillWord, squares, false);
        shuffleArray(frame.entryCandidates);
        addCandidateCulprits(state, frame, squares);
    }

    if (frame.candidateIndex >= frame.entryCandidates.length) {
        exhaustFrame(state);
        return "continue";
    }

    let entry = frame.entryCandidates[frame.candidateIndex++];
    let mark = state.trail.length;
    let claimed = placeEntryWithTrail(state, frame.fillWord, entry.word, ContentType.Autofill, frame.depth);

    if (!claimed) {
        addFrameConflict(frame, state.failure);
        return "continue";
    }

    if (state.openCount === 0) {
        let result: FillStepResult = "continue";
        let failure = forwardCheckSection(grid, section);
        if (!failure) {
            for (let f of stack) f.hadSolution = true;
            let candidate = newSectionCandidateFromGrid(grid, section);
            if (!state.reportedFills.has(candidate.sectionString)) {
                state.reportedFills.add(candidate.sectionString);
                if (onFound) {
                    onFound(candidate);
                } else if (!section.candidates.has(candidate.sectionString)) {
                    section.candidates.set(candidate.sectionString, candidate);
                }
                result = "found";
            }
        } else {
            explainForwardCheckFailure(state, failure);
            addFrameConflict(frame, state.failure);
        }
        undoFillTrailTo(state, mark);
        return result;
    }

    let failure = forwardCheckSection(grid, section, claimed);
    if (!failure) {
        frame.livePlacementMark = mark;
        stack.push(makeEmptyFrame(state, frame.depth + 1));
    } else {
        explainForwardCheckFailure(state, failure);
        addFrameConflict(frame, state.failure);
        undoFillTrailTo(state, mark);
    }

    return "continue";
}

function addFrameConflict(frame: FillFrame, culprits: DepthSet) {
    unionInto(frame.conflict, culprits);
    clearFrom(frame.conflict, frame.depth);
}

/** Frames that pruned this frame's candidate list: its squares, its crosses, and used words. */
function addCandidateCulprits(state: FillSearchState, frame: FillFrame, squares: GridSquare[]) {
    let lengths = new Set<number>([squares.length]);
    for (let sq of squares) addSquareCulprits(state, frame.conflict, sq);
    for (let cross of getUnfilledCrosses(state.grid, frame.fillWord!)) {
        let crossSquares = getSquaresForWord(state.grid, cross);
        lengths.add(crossSquares.length);
        for (let sq of crossSquares) addSquareCulprits(state, frame.conflict, sq);
    }
    addClaimCulprits(state, frame.conflict, lengths);
    clearFrom(frame.conflict, frame.depth);
}

function explainForwardCheckFailure(state: FillSearchState, failure: ForwardCheckFailure) {
    state.failure.fill(0);
    let lengths = new Set<number>();
    for (let word of failure.words) {
        let squares = getSquaresForWord(state.grid, word);
        lengths.add(squares.length);
        for (let sq of squares) addSquareCulprits(state, state.failure, sq);
    }
    if (!failure.duplicate) addClaimCulprits(state, state.failure, lengths);
}

/**
 * Pop an exhausted frame and backjump to the deepest frame in its conflict set
 * (merging the conflict into it). Frames whose subtree produced a fill backtrack
 * chronologically, and a jump never skips past such a frame.
 */
function exhaustFrame(state: FillSearchState) {
    let stack = state.stack;
    let frame = stack.pop()!;
    if (stack.length === 0) return;

    let target: number;
    if (frame.hadSolution) {
        target = frame.depth - 1;
    } else {
        target = maxDepth(frame.conflict);
        for (let i = stack.length - 1; i > target; i--) {
            if (stack[i].hadSolution) {
                target = i;
                break;
            }
        }
    }

    if (target < 0) {
        // The failure doesn't depend on any placement: nothing left to find.
        stack.length = 0;
        return;
    }

    while (stack.length - 1 > target) stack.pop();
    if (!frame.hadSolution) addFrameConflict(stack[target], frame.conflict);
}

function restartSearch(state: FillSearchState) {
    undoFillTrailTo(state, 0);
    state.stack.length = 0;
    state.stack.push(makeRootFrame(state));
    state.runSteps = 0;
    state.runBudget *= RUN_BUDGET_GROWTH;
}

let yieldChannel: MessageChannel | undefined;
const yieldQueue: (() => void)[] = [];

/** Yield to the event loop without setTimeout's nested-timer clamping. */
function yieldToEventLoop(fn: () => void) {
    if (typeof MessageChannel === "undefined") {
        setTimeout(fn, 0);
        return;
    }
    if (!yieldChannel) {
        yieldChannel = new MessageChannel();
        yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();
    }
    yieldQueue.push(fn);
    yieldChannel.port2.postMessage(null);
}

/**
 * Run fill steps until the search stack is empty or shouldCancel() is true.
 * Works in time slices, yielding between them so cancel messages can be processed.
 * Fills found during a slice are reported together at the end of the slice.
 */
export function runFillUntilIdle(
    section: Section,
    shouldCancel: () => boolean,
    onFound?: (fills: SectionCandidate[]) => void,
): Promise<void> {
    return new Promise(resolve => {
        const found: SectionCandidate[] = [];
        const collect = onFound ? (candidate: SectionCandidate) => { found.push(candidate); } : undefined;
        const flush = () => {
            if (found.length > 0) onFound!(found.splice(0));
        };

        function slice() {
            if (shouldCancel()) {
                resolve();
                return;
            }
            const deadline = performance.now() + SLICE_MS;
            for (let i = 1; ; i++) {
                if (fillSectionWordStep(section, collect) === "done") {
                    flush();
                    resolve();
                    return;
                }
                if ((i & 63) === 0 && performance.now() >= deadline) break;
            }
            flush();
            yieldToEventLoop(slice);
        }

        slice();
    });
}

function initSearchState(baseGrid: GridState, section: Section): FillSearchState {
    const grid = cloneGridForFill(baseGrid);
    grid.squaresCache = new Map();
    grid.crossesCache = new Map();
    const index = Globals.wordList;
    if (index) {
        const ids = new Uint8Array(index.wordCount);
        grid.usedWords.forEach((_, word) => {
            const id = findPackedWordId(index, word);
            if (id >= 0) ids[id] = 1;
        });
        grid.usedWordIds = ids;
        grid.usedWordIdsIndex = index;
    }
    grid.likelyUsedCount = countLikelyGettableUsed(grid.usedWords);
    grid.extraUsedCount = countExtraUsed(grid.usedWords);

    let openCount = 0;
    for (const [row, col] of getSectionSquareCoords(section)) {
        if (!grid.squares[row][col].content) openCount++;
    }

    const depthSetWidth = depthSetWidthFor(section.words.size + 1);
    return {
        grid,
        stack: [],
        trail: [],
        openCount,
        depthSetWidth,
        squareCulprits: new Uint32Array(grid.width * grid.height * depthSetWidth),
        claims: new Map(),
        failure: newDepthSet(depthSetWidth),
        runSteps: 0,
        runBudget: INITIAL_RUN_BUDGET,
        reportedFills: new Set(),
    };
}

export function createFillSearchState(baseGrid: GridState, section: Section = getSection()): FillSearchState {
    const state = initSearchState(baseGrid, section);
    state.stack.push(makeRootFrame(state));
    return state;
}

/** Seed the root frame with a prebuilt candidate slice (for parallel workers). */
export function createRootFillSearchState(
    baseGrid: GridState,
    section: Section,
    fillWord: GridWord,
    entryCandidates: EntryCandidate[],
): FillSearchState {
    const state = initSearchState(baseGrid, section);
    state.rootWord = fillWord;
    state.rootCandidates = entryCandidates;
    state.stack.push(makeRootFrame(state));
    return state;
}

function makeEmptyFrame(state: FillSearchState, depth: number): FillFrame {
    return {
        entryCandidates: [],
        built: false,
        candidateIndex: 0,
        depth,
        conflict: newDepthSet(state.depthSetWidth),
        hadSolution: false,
    };
}

function makeRootFrame(state: FillSearchState): FillFrame {
    const frame = makeEmptyFrame(state, 0);
    if (state.rootWord && state.rootCandidates) {
        frame.fillWord = state.rootWord;
        frame.entryCandidates = state.rootCandidates.slice();
        shuffleArray(frame.entryCandidates);
        frame.built = true;
    }
    return frame;
}

/** Manual-fill helper: still uses an isolated cloned node. */
export function makeNewNode(grid: GridState, depth: number): FillNode {
    const cloned = cloneGridForFill(grid);
    return {
        startGrid: cloned,
        endGrid: cloned,
        entryCandidates: [],
        candidateIndex: 0,
        depth: depth,
    } as FillNode;
}

/**
 * Most-constrained-variable: pick the unfilled section word with the fewest options.
 * Ties break toward the word with the most unfilled crosses (degree heuristic)
 * so a failed placement prunes more of the search tree.
 */
export function selectWordToFill(grid: GridState, section: Section): GridWord | undefined {
    let best: GridWord | undefined;
    let bestCost = Infinity;
    let bestDegree = -1;

    for (let word of getSectionWordList(grid, section)) {
        let squares = getSquaresForWord(grid, word);
        if (isWordFull(squares)) continue;

        let cost = estimateWordOpenness(grid, squares);
        if (cost > bestCost) continue;

        let degree = getUnfilledCrosses(grid, word).length;
        if (cost < bestCost || (cost === bestCost && degree > bestDegree)) {
            bestCost = cost;
            bestDegree = degree;
            best = word;
            if (cost === 0) return word;
        }
    }

    return best;
}

export function getAllCrosses(grid: GridState, word: GridWord): GridWord[] {
    let cache = grid.crossesCache;
    let hit = cache?.get(word);
    if (hit) return hit;

    let squares = getSquaresForWord(grid, word);
    let crosses = squares
        .map(sq => getWordAtSquare(grid, sq.row, sq.col, otherDir(word.direction)))
        .filter(w => w).map(w => w!);
    if (cache) cache.set(word, crosses);
    return crosses;
}

export function getUnfilledCrosses(grid: GridState, word: GridWord): GridWord[] {
    return getAllCrosses(grid, word).filter(w => !isWordFull(getSquaresForWord(grid, w)));
}
