export interface EntryCandidate {
    word: string;
    score: number;
    isViable: boolean;
    hasBeenChained: boolean;
    wasChainFailure: boolean;
    iffyEntry?: string;
    iffyWordKey?: string;
    crossScore: number;
    minCrossScore: number;
}
