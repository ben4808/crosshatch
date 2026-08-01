import { GridState } from '../models/GridState';
import { GridWord } from '../models/GridWord';
import { Section } from '../models/Section';
import { FillFrame, FillSearchState } from '../models/FillSearchState';
import { FillNode } from '../models/FillNode';
import { ContentType } from '../models/ContentType';
import { EntryCandidate } from '../models/EntryCandidate';
import { SectionCandidate } from '../models/SectionCandidate';
import { buildEntryCandidates, estimateWordOpenness, forwardCheckSection } from './entryCandidates';
import { placeEntryWithTrail, undoFillTrailTo } from './insertEntry';
import { getSectionString, newSectionCandidateFromGrid } from './section';
import { cloneGridForFill, getSquaresForWord, mapKeys, isWordFull,
    getWordAtSquare, otherDir, getSection, getGrid } from './util';

const STEPS_PER_SLICE = 250;

type FillFoundHandler = (sectionString: string, candidate: SectionCandidate) => void;
let fillFoundHandler: FillFoundHandler | undefined;

export type FillStepResult = "continue" | "found" | "done";

/**
 * One step of depth-first autofill on a single mutable working grid.
 * Uses a trail for undo so siblings don't require per-candidate clones.
 * Does not update the visible active grid — callers collect fills from section.candidates.
 * @returns false when the search stack is empty (no more work).
 */
export function fillSectionWord(): boolean {
    return fillSectionWordStep() !== "done";
}

/** Like fillSectionWord, but distinguishes a newly discovered complete fill. */
export function fillSectionWordStep(): FillStepResult {
    let section = getSection();
    let state = section.fillState;
    if (!state) {
        state = createFillSearchState(getGrid());
        section.fillState = state;
    }

    let stack = state.stack;
    if (stack.length === 0) return "done";

    let frame = stack[stack.length - 1];

    // Returning from a finished child: undo the placement that spawned it.
    if (frame.livePlacementMark !== undefined) {
        undoFillTrailTo(state, frame.livePlacementMark);
        frame.livePlacementMark = undefined;
    }

    if (!frame.fillWord) {
        frame.fillWord = selectWordToFill(state.grid, section);
        if (!frame.fillWord) {
            stack.pop();
            return "continue";
        }
    }

    if (frame.entryCandidates.length === 0 && frame.candidateIndex === 0) {
        let squares = getSquaresForWord(state.grid, frame.fillWord);
        frame.entryCandidates = buildEntryCandidates(state.grid, frame.fillWord, squares, false);
        if (frame.entryCandidates.length === 0) {
            stack.pop();
            return "continue";
        }
    }

    if (frame.candidateIndex >= frame.entryCandidates.length) {
        stack.pop();
        return "continue";
    }

    let entry = frame.entryCandidates[frame.candidateIndex++];
    let mark = state.trail.length;
    let claimed = placeEntryWithTrail(state, frame.fillWord, entry.word, ContentType.Autofill);

    if (!claimed) {
        return "continue";
    }

    let sectionString = getSectionString(state.grid, section);
    if (!sectionString.includes("-")) {
        let found = false;
        if (forwardCheckSection(state.grid, section)) {
            let candidate = newSectionCandidateFromGrid(state.grid, section);
            if (fillFoundHandler) {
                // Worker path: main thread owns storage; avoid duplicating here.
                fillFoundHandler(sectionString, candidate);
            } else if (!section.candidates.has(sectionString)) {
                section.candidates.set(sectionString, candidate);
            }
            found = true;
        }
        undoFillTrailTo(state, mark);
        return found ? "found" : "continue";
    }

    if (forwardCheckSection(state.grid, section, claimed)) {
        frame.livePlacementMark = mark;
        stack.push(makeEmptyFrame(frame.depth + 1));
    } else {
        undoFillTrailTo(state, mark);
    }

    return "continue";
}

/**
 * Run fill steps until the search stack is empty or shouldCancel() is true.
 * Yields to the event loop between slices so cancel messages can be processed,
 * and immediately after each discovered fill so workers can report it promptly.
 */
export function runFillUntilIdle(
    shouldCancel: () => boolean,
    onFound?: FillFoundHandler,
): Promise<void> {
    fillFoundHandler = onFound;
    return new Promise(resolve => {
        function finish() {
            fillFoundHandler = undefined;
            resolve();
        }

        function slice() {
            if (shouldCancel()) {
                finish();
                return;
            }
            for (let i = 0; i < STEPS_PER_SLICE; i++) {
                const result = fillSectionWordStep();
                if (result === "done") {
                    finish();
                    return;
                }
                if (shouldCancel()) {
                    finish();
                    return;
                }
                // Yield right away so postMessage("found") can be delivered/processed
                // instead of sitting until the worker finishes its search space.
                if (result === "found") {
                    setTimeout(slice, 0);
                    return;
                }
            }
            setTimeout(slice, 0);
        }

        slice();
    });
}

export function createFillSearchState(baseGrid: GridState): FillSearchState {
    return {
        grid: cloneGridForFill(baseGrid),
        stack: [makeEmptyFrame(0)],
        trail: [],
    };
}

/** Seed the root frame with a prebuilt candidate slice (for parallel workers). */
export function createRootFillSearchState(
    baseGrid: GridState,
    fillWord: GridWord,
    entryCandidates: EntryCandidate[],
): FillSearchState {
    return {
        grid: cloneGridForFill(baseGrid),
        stack: [{
            fillWord,
            entryCandidates,
            candidateIndex: 0,
            depth: 0,
        }],
        trail: [],
    };
}

function makeEmptyFrame(depth: number): FillFrame {
    return {
        entryCandidates: [],
        candidateIndex: 0,
        depth,
    };
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

    for (let key of mapKeys(section.words)) {
        let word = grid.words.get(key)!;
        let squares = getSquaresForWord(grid, word);
        if (isWordFull(squares)) continue;

        let cost = estimateWordOpenness(squares, grid.usedWords);
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
