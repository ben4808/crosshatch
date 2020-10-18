import { EntryCandidate } from "./EntryCandidate";
import { GridState } from "./GridState";
import { GridWord } from "./GridWord";

export interface FillNode {
    previousGrid: GridState;
    fillWord: GridWord;
    entryCandidates: EntryCandidate[];
    chosenWord: string,
}
