import { ConstraintErrorType } from "./ConstraintErrorType";
import { SquareType } from "./SquareType";

export interface GridSquare {
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    correctContent?: string;
    fillContent?: string;
    constraintMap: Map<string, number>;
    constraintSum: number,
    constraintError: ConstraintErrorType,
}