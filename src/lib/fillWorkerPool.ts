import { GridState } from "../models/GridState";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { buildEntryCandidates } from "./entryCandidates";
import { createRootFillSearchState, selectWordToFill } from "./fill";
import {
    MainToWorkerMessage,
    sectionForWorker,
    stripGridLookups,
    WorkerToMainMessage,
} from "./fillWorkerTypes";
import { getSquaresForWord } from "./util";
import { getWordIndexInitPayload } from "./wordList";
import Globals from "./windowService";

const MAX_WORKERS_HARD = 8;
/** Cap stored section fills to bound main-thread memory. */
export const MAX_STORED_FILLS = 2000;

export interface StartFillOptions {
    grid: GridState;
    section: Section;
    onFound?: (sectionString: string, candidate: SectionCandidate) => void;
    onComplete: () => void;
    onProgress?: () => void;
}

let workers: Worker[] = [];
let wordListVersion = 0;
let postedWordListVersion = -1;
let nextJobId = 1;
let activeJobId: number | undefined;
let outstandingWorkers = 0;
let activeOptions: StartFillOptions | undefined;
let reportingStopped = false;
let loggedNonSharedIndex = false;

function memoryWorkerCap(): number {
    // Shared index removes per-worker dictionary duplication; allow more parallelism.
    if (Globals.wordList?.isShared) return MAX_WORKERS_HARD;
    const nav = typeof navigator !== "undefined" ? navigator as Navigator & { deviceMemory?: number } : undefined;
    const gb = nav?.deviceMemory;
    if (gb !== undefined) {
        if (gb < 4) return 2;
        if (gb < 8) return 4;
    }
    return MAX_WORKERS_HARD;
}

function workerCountCap(): number {
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    return Math.min(MAX_WORKERS_HARD, memoryWorkerCap(), cores);
}

function createWorker(): Worker {
    return new Worker(new URL("./fill.worker.ts", import.meta.url));
}

function handleWorkerError(err: ErrorEvent) {
    console.error("Fill worker error", err);
    handleWorkerFinished(activeJobId);
}

function postInitWordList(worker: Worker) {
    const index = getWordIndexInitPayload();
    if (!index) return;
    postToWorker(worker, { type: "initWordList", index });
}

function ensureWorkers(count: number) {
    while (workers.length < count) {
        const worker = createWorker();
        worker.onmessage = handleWorkerMessage;
        worker.onerror = handleWorkerError;
        workers.push(worker);
        if (Globals.wordList) {
            postInitWordList(worker);
        }
    }
}

function postToWorker(worker: Worker, msg: MainToWorkerMessage) {
    worker.postMessage(msg);
}

/** Call when the main-thread word list is loaded or cleared. */
export function ensureWordList(wordList?: unknown, knownWords?: Set<string>) {
    wordListVersion++;
    if (!wordList || !knownWords) {
        postedWordListVersion = -1;
        return;
    }
    ensureWorkers(workerCountCap());
    for (const worker of workers) {
        postInitWordList(worker);
    }
    postedWordListVersion = wordListVersion;
    if (Globals.wordList && !Globals.wordList.isShared && !loggedNonSharedIndex) {
        loggedNonSharedIndex = true;
        console.info(
            "Fill workers: SharedArrayBuffer unavailable; word index is cloned per worker. " +
            "Cross-origin isolation (COOP/COEP) enables zero-copy sharing.",
        );
    }
}

function syncWordListIfNeeded() {
    if (!Globals.wordList || !Globals.knownWords) return;
    if (postedWordListVersion === wordListVersion && workers.length > 0) return;
    ensureWordList(Globals.wordList, Globals.knownWords);
}

function partitionCandidates<T>(items: T[], parts: number): T[][] {
    const buckets: T[][] = [];
    for (let i = 0; i < parts; i++) buckets.push([]);
    for (let i = 0; i < items.length; i++) {
        buckets[i % parts].push(items[i]);
    }
    return buckets.filter(b => b.length > 0);
}

function stopReportingFills() {
    if (reportingStopped || activeJobId === undefined) return;
    reportingStopped = true;
    const jobId = activeJobId;
    for (const worker of workers) {
        postToWorker(worker, { type: "stopReporting", jobId });
    }
}

function handleWorkerMessage(event: MessageEvent<WorkerToMainMessage>) {
    const msg = event.data;
    if (msg.jobId !== activeJobId) return;

    if (msg.type === "found") {
        const section = activeOptions?.section;
        if (!section) return;

        if (section.candidates.size >= MAX_STORED_FILLS) {
            stopReportingFills();
            return;
        }

        if (!section.candidates.has(msg.sectionString)) {
            const candidate: SectionCandidate = {
                sectionId: section.id,
                sectionString: msg.sectionString,
                score: msg.score,
                isFilteredOut: false,
            };
            section.candidates.set(msg.sectionString, candidate);
            activeOptions?.onFound?.(msg.sectionString, candidate);

            if (section.candidates.size >= MAX_STORED_FILLS) {
                stopReportingFills();
            }
        }
        activeOptions?.onProgress?.();
        return;
    }

    if (msg.type === "error") {
        console.error("Fill worker failed:", msg.message);
        handleWorkerFinished(msg.jobId);
        return;
    }

    if (msg.type === "done") {
        handleWorkerFinished(msg.jobId);
    }
}

function handleWorkerFinished(jobId: number | undefined) {
    if (jobId === undefined || jobId !== activeJobId) return;
    outstandingWorkers--;
    if (outstandingWorkers <= 0) {
        const opts = activeOptions;
        activeJobId = undefined;
        activeOptions = undefined;
        outstandingWorkers = 0;
        reportingStopped = false;
        opts?.onComplete();
    }
}

/** Cancel any in-flight fill job. */
export function stopFill() {
    if (activeJobId === undefined) return;
    const jobId = activeJobId;
    activeJobId = undefined;
    activeOptions = undefined;
    outstandingWorkers = 0;
    reportingStopped = false;
    for (const worker of workers) {
        postToWorker(worker, { type: "cancel", jobId });
    }
}

/**
 * Start a parallel section fill. Partitions root entry candidates across workers.
 * Returns false if there was nothing to search (already complete / no candidates).
 */
export function startFill(options: StartFillOptions): boolean {
    stopFill();

    const { grid, section } = options;
    if (!Globals.wordList) {
        options.onComplete();
        return false;
    }

    syncWordListIfNeeded();

    const fillWord = selectWordToFill(grid, section);
    if (!fillWord) {
        options.onComplete();
        return false;
    }

    const squares = getSquaresForWord(grid, fillWord);
    const entryCandidates = buildEntryCandidates(grid, fillWord, squares, false);
    if (entryCandidates.length === 0) {
        options.onComplete();
        return false;
    }

    const n = Math.min(workerCountCap(), entryCandidates.length);
    ensureWorkers(n);
    syncWordListIfNeeded();

    const slices = partitionCandidates(entryCandidates, n);
    const jobId = nextJobId++;
    activeJobId = jobId;
    activeOptions = options;
    outstandingWorkers = slices.length;
    reportingStopped = false;

    section.fillState = createRootFillSearchState(grid, fillWord, entryCandidates);

    const workerGrid = stripGridLookups(grid);
    const workerSection = sectionForWorker(section);

    for (let i = 0; i < slices.length; i++) {
        postToWorker(workers[i], {
            type: "start",
            jobId,
            grid: workerGrid,
            section: workerSection,
            fillWord,
            entryCandidates: slices[i],
        });
    }

    return true;
}

/** Tear down workers (e.g. on word-list clear). */
export function terminateFillWorkers() {
    stopFill();
    for (const worker of workers) worker.terminate();
    workers = [];
    postedWordListVersion = -1;
}
