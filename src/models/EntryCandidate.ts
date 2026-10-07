export interface EntryCandidate {
    word: string;
    /** Higher = more open crosses (preferred first). */
    score: number;
    /** Word id in the index the candidate was built from. */
    id?: number;
}
