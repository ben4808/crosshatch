export interface CluesViewProps {
    acrossClues?: CluesViewProp[];
    downClues?: CluesViewProp[];
}

export interface CluesViewProp {
    number: number;
    clue: string;
    entry: string;
}