import { EntryCandidate } from "./EntryCandidate";
import { GridState } from "./GridState";
import { GridWord } from "./GridWord";
import { ContentType } from "./ContentType";

/** Undo record for trail-based autofill (single mutable working grid). */
export type FillTrailOp =
    | {
        kind: "sq";
        row: number;
        col: number;
        content?: string;
        contentType: ContentType;
        viableMask?: number;
    }
    | {
        kind: "used";
        word: string;
    };

export interface FillFrame {
    fillWord?: GridWord;
    entryCandidates: EntryCandidate[];
    /** Next candidate index to try. */
    candidateIndex: number;
    depth: number;
    /**
     * If set, a placement is committed for a child frame.
     * Undo to this trail length before trying the next sibling.
     */
    livePlacementMark?: number;
}

export interface FillSearchState {
    /** Exclusive mutable working copy for the search. */
    grid: GridState;
    stack: FillFrame[];
    trail: FillTrailOp[];
}
