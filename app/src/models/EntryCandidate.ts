import { GridSquare } from "./GridSquare";

export interface EntryCandidate {
    word: string;
    score: number;
    isViable: boolean;
    hasBeenChained: boolean;
    wasChainFailure: boolean;
    iffyEntry?: string;
    iffyWordKey?: string;
    crossSquares: Map<string, GridSquare[]>;
}
