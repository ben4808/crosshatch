import { GridSquare } from "./GridSquare";

export interface EntryCandidate {
    word: string;
    score: number;
    isViable: boolean;
    hasBeenChained: boolean;
    wasChainFailure: boolean;
    madeUpSqKey?: string;
    madeUpWord?: string;
    crossSquares: Map<string, GridSquare[]>;
}
