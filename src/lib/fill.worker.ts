/* eslint-disable no-restricted-globals */
import { EntryCandidate } from "../models/EntryCandidate";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { createRootFillSearchState, runFillUntilIdle } from "./fill";
import { rebuildWordAtSquare } from "./grid";
import { MainToWorkerMessage, WorkerToMainMessage } from "./fillWorkerTypes";
import { installFillFilter, installWordIndexFromPayload } from "./wordList";
import Globals from "./windowService";

const ctx: Worker = self as any;

interface WorkerJob {
    jobId: number;
    grid: GridState;
    section: Section;
    fillWord: GridWord;
    /** Fills already reported for this job (chunks and restarts can rediscover them). */
    reported: Set<string>;
}

let job: WorkerJob | undefined;

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
        if (job?.jobId === msg.jobId) job = undefined;
        return;
    }
    if (msg.type === "startJob") {
        startJob(msg);
        return;
    }
    if (msg.type === "chunk") {
        void runChunk(msg.jobId, msg.entryCandidates);
    }
};

function startJob(msg: Extract<MainToWorkerMessage, { type: "startJob" }>) {
    const grid = msg.grid as GridState;
    rebuildWordAtSquare(grid);
    const sectionData = msg.section;
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
    };

    Globals.activeGrid = grid;
    Globals.sections = new Map([[section.id, section]]);
    Globals.activeSectionId = section.id;
    installFillFilter(msg.fillFilter);
    job = { jobId: msg.jobId, grid, section, fillWord: msg.fillWord, reported: new Set() };
}

async function runChunk(jobId: number, entryCandidates: EntryCandidate[]) {
    const current = job;
    if (!current || current.jobId !== jobId) return;

    try {
        if (!Globals.wordList) {
            post({ type: "error", jobId, message: "Word list not initialized in worker" });
            return;
        }

        current.section.fillState = createRootFillSearchState(
            current.grid, current.section, current.fillWord, entryCandidates);

        await runFillUntilIdle(
            current.section,
            () => job !== current,
            fills => {
                if (job !== current) return;
                const fresh = fills.filter(fill => !current.reported.has(fill.sectionString));
                if (fresh.length === 0) return;
                fresh.forEach(fill => current.reported.add(fill.sectionString));
                post({
                    type: "found",
                    jobId,
                    fills: fresh.map(fill => ({ sectionString: fill.sectionString, score: fill.score })),
                });
            },
        );

        if (job === current) {
            current.section.fillState = undefined;
            post({ type: "chunkDone", jobId });
        }
    } catch (err: any) {
        post({
            type: "error",
            jobId,
            message: err?.message ? String(err.message) : String(err),
        });
    }
}

export {};
