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

    sections?: Map<number, Section>;
    activeSectionId?: number;
    selectedSectionIds?: number[];
    nextSectionId?: number;

    wordList?: IndexedWordList;
    qualityClasses?: Map<string, QualityClass>;

    fillWord?: () => void;
    fillGrid?: () => void;
    pauseFill?: () => void;
}