export interface EntryCandidate {
    word: string;
    /** Higher = more open crosses (preferred first). */
    score: number;
}
