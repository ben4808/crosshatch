import { IndexedWordList } from "./IndexedWordList";
import { Puzzle } from "./Puzzle";
import { QualityClass } from "./QualityClass";
import { Section } from "./Section";
import { SymmetryType } from "./SymmetryType";
import { WordDirection } from "./WordDirection";
import { WordKey } from "./WordKey";

export interface GlobalsObj {
    puzzle?: Puzzle;
    selectedWordKey?: WordKey;
    selectedWordDir?: WordDirection;
    gridSymmetry?: SymmetryType;
    isFillRunning: boolean;

    sections?: Section[];
    sectionI?: number;

    wordList?: IndexedWordList;
    qualityClasses?: Map<string, QualityClass>;
    starterLengthBuckets?: Map<number, string[]>;

    fillWord?: () => void;
    fillGrid?: () => void;
    pauseFill?: () => void;
}