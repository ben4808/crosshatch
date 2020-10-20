import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
import { FillStatus } from "./FillStatus";
import { GridState } from "./GridState";
import { IndexedWordList } from "./IndexedWordList";
import { QualityClass } from "./QualityClass";

// if only I could get useContext to work
export interface GlobalsObj {
    gridState?: GridState;
    fillQueue?: PriorityQueue<FillNode>;
    fillStatus?: FillStatus;
    wordList?: IndexedWordList;
    qualityClasses?: Map<string, QualityClass>;

    fillWordHandler?: () => void;
    fillGridHandler?: () => void;
    pauseFill?: () => void;
}