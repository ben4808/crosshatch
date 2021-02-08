import { WordDirection } from "../../models/WordDirection";

export interface CluesViewProp {
    number: number;
    key: string,
    direction: WordDirection;
    clue: string;
    entry: string;
    isOpenForEditing: boolean;
}
