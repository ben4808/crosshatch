import { FillNode } from "./FillNode";
import { FillStatus } from "./FillStatus";
import { GridState } from "./GridState";
import { IndexedWordList } from "./IndexedWordList";
import { Puzzle } from "./Puzzle";
import { Section } from "./Section";
import { SymmetryType } from "./SymmetryType";
import { WordDirection } from "./WordDirection";
import { WordList } from "./WordList";

export interface GlobalsObj {
    puzzle?: Puzzle;
    activeGrid?: GridState;
    hoverGrid?: GridState;
    selectedWordKey?: string;
    selectedWordDir?: WordDirection;
    selectedWordNode?: FillNode;

    sections?: Map<number, Section>;
    activeSectionId?: number;
    hoverSectionId?: number;
    selectedSectionIds?: Map<number, boolean>;
    selectedSectionCandidateKeys?: Map<number, string>;

    useManualHeuristics?: boolean;
    gridSymmetry?: SymmetryType;
    fillStatus?: FillStatus;

    wordLists?: WordList[];

    wordList?: IndexedWordList;
    knownWords?: Set<string>;
}
