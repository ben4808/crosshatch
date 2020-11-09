import { GridState } from "./GridState";

export interface Puzzle {
    title: string;
    author: string;
    copyright: string;
    grid?: GridState;
    clues: string[];
}