import { GridState } from "./GridState";
import { GridWord } from "./GridWord";

export interface FillCandidate {
    previousGrid: GridState;
    fillWord: GridWord;
    entryCandidates: [string, number][];
}