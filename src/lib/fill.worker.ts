/* eslint-disable no-restricted-globals */
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { createRootFillSearchState, runFillUntilIdle } from "./fill";
import { rebuildWordAtSquare } from "./grid";
import { MainToWorkerMessage, WorkerToMainMessage } from "./fillWorkerTypes";
import { installWordIndexFromPayload } from "./wordList";
import Globals from "./windowService";

const ctx: Worker = self as any;

let cancelledJobId: number | undefined;
let activeJobId: number | undefined;
let stopReportingJobId: number | undefined;

function post(msg: WorkerToMainMessage) {
    ctx.postMessage(msg);
}

ctx.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
    const msg = event.data;
    if (msg.type === "initWordList") {
        installWordIndexFromPayload(msg.index);
        return;
    }
    if (msg.type === "cancel") {
        cancelledJobId = msg.jobId;
        return;
    }
    if (msg.type === "stopReporting") {
        stopReportingJobId = msg.jobId;
        return;
    }
    if (msg.type === "start") {
        void handleStart(msg);
    }
};

async function handleStart(msg: Extract<MainToWorkerMessage, { type: "start" }>) {
    const { jobId, grid, section: sectionData, fillWord, entryCandidates } = msg;
    activeJobId = jobId;
    if (stopReportingJobId !== undefined && stopReportingJobId !== jobId) {
        stopReportingJobId = undefined;
    }

    try {
        if (!Globals.wordList) {
            post({ type: "error", jobId, message: "Word list not initialized in worker" });
            return;
        }

        rebuildWordAtSquare(grid as any);

        const section: Section = {
            id: sectionData.id,
            openSquareCount: sectionData.openSquareCount,
            squares: sectionData.squares,
            words: sectionData.words,
            stackWords: sectionData.stackWords,
            wordOrder: [],
            neighboringCrosses: sectionData.neighboringCrosses,
            candidates: new Map<string, SectionCandidate>(),
            connections: new Map<number, boolean>(),
            fillState: createRootFillSearchState(grid as any, fillWord, entryCandidates),
        };

        Globals.activeGrid = grid as any;
        Globals.sections = new Map([[section.id, section]]);
        Globals.activeSectionId = section.id;

        await runFillUntilIdle(
            () => cancelledJobId === jobId,
            (sectionString, candidate) => {
                if (cancelledJobId === jobId) return;
                if (stopReportingJobId === jobId) return;
                post({
                    type: "found",
                    jobId,
                    sectionString,
                    score: candidate.score,
                });
            },
        );

        if (cancelledJobId !== jobId) {
            post({ type: "done", jobId });
        }
    } catch (err: any) {
        post({
            type: "error",
            jobId,
            message: err?.message ? String(err.message) : String(err),
        });
    } finally {
        if (activeJobId === jobId) activeJobId = undefined;
    }
}

export {};
