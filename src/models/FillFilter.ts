export interface FillFilter {
    /** Max number of Likely Gettable entries the fill may add. */
    maxLikelyGettable: number;
    likelyWords: string[];
    /** Maybe Gettable / Prefer entries; only allowed in the seed slot. */
    seedWords: string[];
    /** Entries already complete before the fill started; they don't count toward quotas. */
    exemptWords: string[];
    /** Max number of Crosswordese / Abbreviation entries the fill may add. Default 0. */
    maxExtra?: number;
    /** Crosswordese / Abbreviation entries (disjoint from likelyWords). */
    extraWords?: string[];
}
