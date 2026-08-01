import { FillSearchState } from "./FillSearchState";
import { SectionCandidate } from "./SectionCandidate";

export interface Section {
    id: number;
    openSquareCount: number;
    squares: Map<string, boolean>;
    words: Map<string, boolean>;
    stackWords: Map<string, boolean>;
    wordOrder: string[];
    neighboringCrosses: Map<string, boolean>;
    candidates: Map<string, SectionCandidate>;
    selectedCandidate?: string;
    connections: Map<number, boolean>;
    fillState?: FillSearchState;
}
