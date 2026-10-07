import { ContentType } from "../../models/ContentType";
import { SquareType } from "../../models/SquareType";

export interface SquareProps {
    key: string;
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    content?: string;
    contentType: ContentType;
    isSelected: boolean;
    isInSelectedWord: boolean;
    isInSelectedSection: boolean;
    constraintSum: number;
    isCircled: boolean;
    gettableLetterClass?: string;
    gettableCrossingClass?: string;
}
