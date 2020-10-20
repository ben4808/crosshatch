import { SquareType } from "./SquareType";

export interface GridSquare {
    row: number;
    col: number;
    number?: number;
    type: SquareType;

    userContent?: string;
    chosenFillContent?: string;
    fillContent?: string;

    constraintMap: Map<string, number>;
    constraintSum: number,
    constraintInitialized: boolean;
}