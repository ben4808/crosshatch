import { WordDirection } from "./WordDirection";

export interface GridWord {
    number?: number;
    direction: WordDirection;
    start: [number, number];
    end: [number, number];
}
