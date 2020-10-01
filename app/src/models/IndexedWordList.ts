import { Entry } from "./Entry";

export interface IndexedWordList {
    source: string;
    buckets: Map<string, Entry[]>;
}