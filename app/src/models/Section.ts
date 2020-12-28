import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
import { SectionCandidate } from "./SectionCandidate";

export interface Section {
    id: number;
    openSquareCount: number;
    // <[row,col], true>
    squares: Map<string, boolean>;
    // <[row, col, dir], true>
    words: Map<string, boolean>;
    stackWords: Map<string, boolean>;
    unfilledCrosses: Map<string, boolean>;
    //[includedList, ...perms]
    triedComboPerms: Map<string, Map<string, boolean>>;
    // <sectionString, >
    triedComboSquares: Map<string, boolean>;
    candidates: Map<string, SectionCandidate>;
    // <includedList, >
    fillQueues: Map<string, PriorityQueue<FillNode>>;
}
