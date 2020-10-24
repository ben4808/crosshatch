import { EntryCandidate } from "./EntryCandidate";
import { GridState } from "./GridState";
import { GridWord } from "./GridWord";

export interface FillNode {
    parent?: FillNode;
    startGrid: GridState;
    endGrid: GridState;
    fillWord?: GridWord;
    entryCandidates: EntryCandidate[];
    chosenEntry?: EntryCandidate;
    depth: number;
    processedCount: number;
}
