import { ContentType } from "../../models/ContentType";
import { QualityClass } from "../../models/QualityClass";
import { SquareType } from "../../models/SquareType";

export interface SquareProps {
    key: string;
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    content?: string;
    contentType: ContentType;
    qualityClass?: QualityClass;
    isSelected: boolean;
    isInSelectedWord: boolean;
    isInSelectedSection: boolean;
    constraintSum: number;
    isCircled: boolean;
}