import { SquareType } from "./SquareType";

export interface GridSquareState {
    row: number,
    col: number,
    number?: number;
    type: SquareType;
    correctContent?: string;
    solverContent?: string;
    fillContent?: string;
}