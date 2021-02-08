import { EntryCandidate } from "./EntryCandidate";
import { GridState } from "./GridState";
import { GridWord } from "./GridWord";

export interface FillNode {
    parent?: FillNode;
    chainBaseNode?: FillNode;
    startGrid: GridState;
    endGrid: GridState;
    fillWord?: GridWord;
    entryCandidates: EntryCandidate[];
    chosenEntry?: EntryCandidate;
    depth: number;
    isChainNode: boolean;
    isSectionBase: boolean;
    backtracks: number;
    chainGoodCandidates: number;
    chainIffyCandidates: number;
    iffyWordKey?: string;
    needsNewPriority: boolean;
    shouldBeDeleted: boolean;
    chainId?: number;
    topCrossScore: number;
    topMinCrossScore: number;
    
    anchorSquareKeys: string[];
    anchorCombosLeft: [string, string][];
}
