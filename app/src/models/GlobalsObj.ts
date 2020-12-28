import { FillNode } from "./FillNode";
import { FillStatus } from "./FillStatus";
import { GridState } from "./GridState";
import { IndexedWordList } from "./IndexedWordList";
import { Puzzle } from "./Puzzle";
import { QualityClass } from "./QualityClass";
import { Section } from "./Section";
import { SymmetryType } from "./SymmetryType";
import { WordDirection } from "./WordDirection";

export interface GlobalsObj {
    puzzle?: Puzzle;
    activeGrid?: GridState;
    hoverGrid?: GridState;
    selectedWordKey?: string;
    selectedWordDir?: WordDirection;
    gridSymmetry?: SymmetryType;
    isFillEnabled: boolean;
    isFillComplete: boolean;
    fillStatus?: FillStatus;
    selectedWordNode?: FillNode;

    sections?: Map<number, Section>;
    activeSectionId?: number;
    hoverSectionId?: number;
    selectedSectionIds?: Map<number, boolean>;
    selectedSectionCandidate?: string;

    wordList?: IndexedWordList;
    qualityClasses?: Map<string, QualityClass>;

    handleToggleFill?: () => void;
    handleFillWord?: () => void;
}