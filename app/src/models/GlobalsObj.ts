import { PriorityQueue } from "../lib/priorityQueue";
import { FillNode } from "./FillNode";
import { FillStatus } from "./FillStatus";
import { GridState } from "./GridState";
import { GridWord } from "./GridWord";
import { IndexedWordList } from "./IndexedWordList";
import { QualityClass } from "./QualityClass";

// if only I could get useContext to work
export interface GlobalsObj {
    gridState?: GridState;
    selectedSquare?: [number, number];
    selectedWord?: GridWord;

    fillQueue?: PriorityQueue<FillNode>;
    currentDepth?: number;
    fillStatus?: FillStatus;
    completedGrids?: [number, GridState][];

    wordList?: IndexedWordList;
    qualityClasses?: Map<string, QualityClass>;
    lengthBuckets?: Map<number, string[]>;
    isFirstFillCall: boolean;

    fillWordHandler?: () => void;
    fillGridHandler?: () => void;
    pauseFill?: () => void;
    changeView?: () => void;
    makeNewGrid?: () => void;
    loadPuz?: () => void;
    exportPuz?: () => void;
}