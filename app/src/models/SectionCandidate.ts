import { GridState } from "./GridState";

export interface SectionCandidate {
    grid: GridState;
    score: number;
    iffyEntry?: string;
    isFilteredOut: boolean;
}