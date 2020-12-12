import { GridState } from "./GridState";

export interface SectionCandidate {
    grid: GridState;
    score: number;
    madeUpEntries: string[];
    isFilteredOut: boolean;
}