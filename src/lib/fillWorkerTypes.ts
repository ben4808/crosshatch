import { EntryCandidate } from "../models/EntryCandidate";
import { FillFilter } from "../models/FillFilter";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { WordIndexInitPayload } from "./sharedWordIndex";

/** Grid payload safe for structured clone (no word-at-square lookups). */
export type WorkerGrid = Omit<GridState, "acrossWordAt" | "downWordAt">;

export type WorkerSection = Pick<
    Section,
    "id" | "openSquareCount" | "squares" | "words" | "stackWords" | "neighboringCrosses"
>;

export type FillWordFilterPayload = FillFilter;

export type MainToWorkerMessage =
    | { type: "initWordList"; index: WordIndexInitPayload }
    /** Job context, sent once per worker per job; root candidates follow as chunks. */
    | {
        type: "startJob";
        jobId: number;
        grid: WorkerGrid;
        section: WorkerSection;
        fillWord: GridWord;
        fillFilter?: FillWordFilterPayload;
    }
    /** Search the subtrees of these root candidates; reply with chunkDone. */
    | { type: "chunk"; jobId: number; entryCandidates: EntryCandidate[] }
    | { type: "cancel"; jobId: number };

export interface FoundFillPayload {
    sectionString: string;
    score: number;
}

export type WorkerToMainMessage =
    | { type: "found"; jobId: number; fills: FoundFillPayload[] }
    | { type: "chunkDone"; jobId: number }
    | { type: "error"; jobId: number; message: string };

export function stripGridLookups(grid: GridState): WorkerGrid {
    return {
        height: grid.height,
        width: grid.width,
        squares: grid.squares,
        words: grid.words,
        usedWords: grid.usedWords,
        userFilledSectionCandidates: grid.userFilledSectionCandidates,
    };
}

export function sectionForWorker(section: Section): WorkerSection {
    return {
        id: section.id,
        openSquareCount: section.openSquareCount,
        squares: section.squares,
        words: section.words,
        stackWords: section.stackWords,
        neighboringCrosses: section.neighboringCrosses,
    };
}
