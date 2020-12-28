import { GridState } from "./GridState";

export interface SectionCandidate {
    sectionId: number;
    grid: GridState;
    score: number;
    iffyEntry?: string;
    isFilteredOut: boolean;
}
