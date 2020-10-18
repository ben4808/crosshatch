import { FillStatus } from "./FillStatus";
import { GridSquare } from "./GridSquare";
import { GridWord } from "./GridWord";

export interface GridState {
    height: number;
    width: number;
    squares: GridSquare[][];
    selectedSquare?: [number, number];
    
    words: GridWord[];
    selectedWord?: GridWord;
}