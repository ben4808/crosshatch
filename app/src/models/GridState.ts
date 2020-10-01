import { GridSquareState } from "./GridSquareState";
import { GridWord } from "./GridWord";

export interface GridState {
    height: number;
    width: number;
    squares: GridSquareState[][];
    words: GridWord[];
    selectedSquare?: [number, number];
    selectedWord?: GridWord;
}