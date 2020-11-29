import { ConstraintInfo } from "./ConstraintInfo";
import { ContentType } from "./ContentType";
import { QualityClass } from "./QualityClass";
import { SquareType } from "./SquareType";

export interface GridSquare {
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    isCircled: boolean;

    content?: string;
    contentType: ContentType;

    qualityClass?: QualityClass;
    constraintInfo?: ConstraintInfo;
}