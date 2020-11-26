import { ConstraintInfo } from "./ConstraintInfo";
import { QualityClass } from "./QualityClass";
import { SquareType } from "./SquareType";

export interface GridSquare {
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    isCircled: boolean;

    userContent?: string;
    chosenFillContent?: string;
    fillContent?: string;
    qualityClass?: QualityClass;

    constraintInfo?: ConstraintInfo;
}