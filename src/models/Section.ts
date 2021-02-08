import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
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
    fillQueue?: PriorityQueue<FillNode>;
    comboPermsQueue: number[][];
    comboPermsUsed: Map<string, boolean>;
}
