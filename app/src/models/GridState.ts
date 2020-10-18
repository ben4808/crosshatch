import { FillNode } from "./FillNode";
import { GridSquare } from "./GridSquare";
import { GridWord } from "./GridWord";

export interface GridState {
    height: number;
    width: number;
    squares: GridSquare[][];
    selectedSquare?: [number, number];
    
    words: GridWord[];
    selectedWord?: GridWord;

    fillNodeStack: FillNode[];
}