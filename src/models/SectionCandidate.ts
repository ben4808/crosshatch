export interface SectionCandidate {
    sectionId: number;
    /** Sorted section-square letters (same order as getSectionString). */
    sectionString: string;
    score: number;
    isFilteredOut: boolean;
    /** Full grid including blacks (row-major, '.' = black). Used by Make 5x5. */
    gridString?: string;
}
