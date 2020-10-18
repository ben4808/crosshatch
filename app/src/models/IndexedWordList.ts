import { QualityClass } from "./QualityClass";

export interface IndexedWordList {
    source: string;
    qualityClasses: Map<string, QualityClass>;
    buckets: any;
}