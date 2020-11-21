import { QualityClass } from "../../models/QualityClass";
import { SquareType } from "../../models/SquareType";

export interface SquareProps {
    key: string;
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    userContent?: string;
    chosenFillContent?: string;
    fillContent?: string;
    qualityClass?: QualityClass;
    isSelected: boolean;
    isInSelectedWord: boolean;
    constraintSum: number;
    isCircled: boolean;
}