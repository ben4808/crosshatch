import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
import { SectionCandidate } from "./SectionCandidate";
import { WordDirection } from "./WordDirection";

export interface Section {
    number: number;
    openSquareCount: number;
    longestDir: WordDirection;
    // <[row,col], true>
    squares: Map<string, boolean>;
    // <[row, col, dir], true>
    words: Map<string, boolean>;
    // <includedList, >
    candidates: Map<string, SectionCandidate[]>;
    fillQueues: Map<string, PriorityQueue<FillNode>>;
}