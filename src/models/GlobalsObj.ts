import { FillFilter } from "./FillFilter";
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
    /** Per-entry gettable-ness from the word-list CSV (e.g. "Very Gettable"). */
    wordGettable?: Map<string, string>;
    /** Per-entry desirability from the word-list CSV (e.g. "Prefer"). */
    wordDesirability?: Map<string, string>;
    /** Entries marked abbr=y in the word-list CSV (Acronym/Abbreviation). */
    wordAbbr?: Set<string>;
    /** Entries marked sensitive=y in the word-list CSV. */
    wordSensitive?: Set<string>;
    /** Entries marked crosswordese=y in the word-list CSV. */
    wordCrosswordese?: Set<string>;
    /** Entries marked overused=y in the word-list CSV. */
    wordOverused?: Set<string>;
    /** Entries whose familiarity bucket is Regionalism (not a CSV column in current lists). */
    wordRegionalism?: Set<string>;
    /** Active gettability constraint used by the fill (and workers). */
    fillFilter?: FillFilter;
    likelyGettableSet?: Set<string>;

    /** Magic Puzzle seedword currently placed in the grid. */
    seedEntry?: string;
    seedWordKey?: string;
    seedDisplayText?: string;
}
