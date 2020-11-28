import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
import { GridWord } from "./GridWord";
import { SectionCandidate } from "./SectionCandidate";

export interface Section {
    number: number;
    openSquareCount: number;
    squares: Map<string, boolean>;
    words: Map<string, GridWord>;
    candidates: Map<string, SectionCandidate>;
    fillQueue?: PriorityQueue<FillNode>;
}