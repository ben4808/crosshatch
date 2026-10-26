import { EntryCandidate } from "./EntryCandidate";
import { GridState } from "./GridState";
import { GridWord } from "./GridWord";
import { ContentType } from "./ContentType";
import { DepthSet } from "../lib/depthSet";

/** Undo record for trail-based autofill (single mutable working grid). */
export type FillTrailOp =
    | {
        kind: "sq";
        row: number;
        col: number;
        content?: string;
        contentType: ContentType;
        viableMask?: number;
        culprits?: DepthSet;
    }
    | {
        kind: "used";
        word: string;
        id: number;
        countsTowardQuota: boolean;
        countsTowardExtra: boolean;
    };

export interface FillFrame {
    fillWord?: GridWord;
    entryCandidates: EntryCandidate[];
    /** Candidates built (or supplied) for fillWord. */
    built: boolean;
    /** Next candidate index to try. */
    candidateIndex: number;
    depth: number;
    /**
     * If set, a placement is committed for a child frame.
     * Undo to this trail length before trying the next sibling.
     */
    livePlacementMark?: number;
    /** Shallower frames whose placements explain this frame's failures so far (backjumping). */
    conflict: DepthSet;
    /** A complete fill was found below this frame; it must backtrack chronologically. */
    hadSolution: boolean;
}

export interface FillClaim {
    depth: number;
    countsTowardQuota: boolean;
    countsTowardExtra: boolean;
}

export interface FillSearchState {
    /** Exclusive mutable working copy for the search. */
    grid: GridState;
    stack: FillFrame[];
    trail: FillTrailOp[];

    /** Section squares still without a letter. */
    openCount: number;
    /** Words of the DepthSets below (bitset width). */
    depthSetWidth: number;
    /** Per grid square (row * width + col): frames whose placements determine its letter/mask. */
    squareCulprits: Uint32Array;
    /** Words claimed during the search, with the frame that claimed them. */
    claims: Map<string, FillClaim>;
    /** Scratch explanation for the latest failed placement. */
    failure: DepthSet;

    /** Fixed root word and candidates (parallel chunks); otherwise chosen by MRV. */
    rootWord?: GridWord;
    rootCandidates?: EntryCandidate[];
    /** Steps taken since the last restart, and the budget before the next one. */
    runSteps: number;
    runBudget: number;
    /** Fills already reported (restarts can revisit them). */
    reportedFills: Set<string>;
}
