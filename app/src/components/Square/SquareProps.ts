import { SquareType } from "../../models/SquareType";

export interface SquareProps {
    key: string;
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    content?: string;
    isSelected: boolean;
    isInSelectedWord: boolean;
}