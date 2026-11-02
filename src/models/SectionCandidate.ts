export interface SectionCandidate {
    sectionId: number;
    /** Sorted section-square letters (same order as getSectionString). */
    sectionString: string;
    score: number;
    isFilteredOut: boolean;
    /**
     * Square keys this sectionString was built from, in sectionString order.
     * Set when the black-square pattern changes so the fill can stay in the list.
     * Absent on fills for the pattern currently in the section.
     */
    squareKeys?: string[];
    /** Longest entry, captured with squareKeys so the Fills list can show it later. */
    longestEntry?: string;
    /** Very Gettable entry count, captured with squareKeys. */
    gettableCount?: number;
}
