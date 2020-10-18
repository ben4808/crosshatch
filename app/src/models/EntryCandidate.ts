import { Entry } from "./Entry";

export interface EntryCandidate {
    entry: Entry;
    score?: number;
    isViable: boolean;

    sumOfPercentageLosses?: number;
    lowConstraintSum?: number;
}
