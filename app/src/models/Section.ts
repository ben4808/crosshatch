import { GridWord } from "./GridWord";
import { SectionCandidate } from "./SectionCandidate";

export interface Section {
    number: number;
    openSquareCount: number;
    squares: Map<string, boolean>;
    words: GridWord[];
    candidates: Map<string, SectionCandidate>;
}