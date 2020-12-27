import { ConstraintInfo } from "./ConstraintInfo";
import { ContentType } from "./ContentType";
import { SquareType } from "./SquareType";

export interface GridSquare {
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    isCircled: boolean;
    isEmptyForManualFill: boolean;

    content?: string;
    contentType: ContentType;

    constraintInfo?: ConstraintInfo;
}