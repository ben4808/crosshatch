import { EntryCandidate } from "./EntryCandidate";
import { GridState } from "./GridState";
import { GridWord } from "./GridWord";

export interface FillNode {
    startGrid: GridState;
    endGrid: GridState;
    fillWord?: GridWord;
    entryCandidates: EntryCandidate[];
    chosenEntry?: EntryCandidate;
    /** Next candidate index to expand; remaining candidates stay on the frontier for backtracking. */
    candidateIndex: number;
    depth: number;
}
