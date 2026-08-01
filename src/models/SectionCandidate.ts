export interface SectionCandidate {
    sectionId: number;
    /** Sorted section-square letters (same order as getSectionString). */
    sectionString: string;
    score: number;
    isFilteredOut: boolean;
}
