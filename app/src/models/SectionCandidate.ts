import { GridState } from "./GridState";
import { QualityClass } from "./QualityClass";

export interface SectionCandidate {
    grid: GridState;
    minQualityClass: QualityClass;
    score: number;
    madeUpEntries: string[];
    isFilteredOut: boolean;
}