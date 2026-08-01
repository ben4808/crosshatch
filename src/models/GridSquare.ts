import { ContentType } from "./ContentType";
import { SquareType } from "./SquareType";

export interface GridSquare {
    row: number;
    col: number;
    number?: number;
    type: SquareType;
    isCircled: boolean;

    content?: string;
    contentType: ContentType;

    /** Bitmask of remaining letters (bit 0 = A … bit 25 = Z). Undefined = all letters. */
    viableMask?: number;
}
