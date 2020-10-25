export interface EntryCandidate {
    word: string;
    score?: number;
    isViable: boolean;
    hasBeenChained: boolean;
    wasChainFailure: boolean;
}
