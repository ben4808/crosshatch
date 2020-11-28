import { GridSquare } from "./GridSquare";

export interface EntryCandidate {
    word: string;
    minCrossEntries: number;
    sumOfCrosses: number;
    score?: number;
    isViable: boolean;
    hasBeenChained: boolean;
    wasChainFailure: boolean;
    constraintSquaresForCrosses: GridSquare[][];
}
