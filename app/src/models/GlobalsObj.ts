import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
import { FillStatus } from "./FillStatus";
import { IndexedWordList } from "./IndexedWordList";
import { Puzzle } from "./Puzzle";
import { QualityClass } from "./QualityClass";
import { SymmetryType } from "./SymmetryType";
import { WordDirection } from "./WordDirection";

export interface GlobalsObj {
    puzzle?: Puzzle;
    selectedWordKey?: string;
    selectedWordDir?: WordDirection;
    gridSymmetry?: SymmetryType;

    fillQueue?: PriorityQueue<FillNode>;
    isVisualFillRunning: boolean;
    fillStatus?: FillStatus;
    //completedGrids?: [number, GridState][];

    wordList?: IndexedWordList;
    qualityClasses?: Map<string, QualityClass>;
    starterLengthBuckets?: Map<number, string[]>;
    isFirstFillCall: boolean;

    fillWord?: () => void;
    fillGrid?: () => void;
    pauseFill?: () => void;
}