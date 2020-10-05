import { ConstraintErrorType } from "../../models/ConstraintErrorType";
import { SquareType } from "../../models/SquareType";

export interface SquareProps {
    key: string;
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    correctContent?: string;
    fillContent?: string;
    isSelected: boolean;
    isInSelectedWord: boolean;
    constraintError: ConstraintErrorType;
}