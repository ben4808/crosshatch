import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
import { SectionCandidate } from "./SectionCandidate";
import { WordDirection } from "./WordDirection";
import { WordKey } from "./WordKey";

export interface Section {
    number: number;
    openSquareCount: number;
    // <[row,col], true>
    squares: Map<[number, number], boolean>;
    words: Map<WordKey, boolean>;
    // <id, sc>
    candidates: Map<number, SectionCandidate>;
    fillQueue?: PriorityQueue<FillNode>;
}