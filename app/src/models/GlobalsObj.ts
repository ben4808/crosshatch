import { IndexedWordList } from "./IndexedWordList";
import { Puzzle } from "./Puzzle";
import { QualityClass } from "./QualityClass";
import { Section } from "./Section";
import { SymmetryType } from "./SymmetryType";
import { WordDirection } from "./WordDirection";

export interface GlobalsObj {
    puzzle?: Puzzle;
    selectedWordKey?: string;
    selectedWordDir?: WordDirection;
    gridSymmetry?: SymmetryType;
    isFillRunning: boolean;

    sections?: Section[];

    wordList?: IndexedWordList;
    qualityClasses?: Map<string, QualityClass>;
    starterLengthBuckets?: Map<number, string[]>;

    fillWord?: () => void;
    fillGrid?: () => void;
    pauseFill?: () => void;
}