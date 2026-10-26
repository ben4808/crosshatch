import { EntryCandidate } from "../models/EntryCandidate";
import { GridState } from "../models/GridState";
import { GridWord } from "../models/GridWord";
import { Section } from "../models/Section";
import { SectionCandidate } from "../models/SectionCandidate";
import { buildEntryCandidates } from "./entryCandidates";
import { createRootFillSearchState, selectWordToFill } from "./fill";
import { sectionCandidateScore } from "./section";
import {
    FillWordFilterPayload,
    MainToWorkerMessage,
    sectionForWorker,
    stripGridLookups,
    WorkerToMainMessage,
} from "./fillWorkerTypes";
import { getSquaresForWord } from "./util";
import { getWordIndexInitPayload, installFillFilter } from "./wordList";
import Globals from "./windowService";

const MAX_WORKERS_HARD = 8;
/** Cap stored section fills to bound main-thread memory. */
export const MAX_STORED_FILLS = 2000;

export interface StartFillOptions {
    grid: GridState;
    section: Section;
    /** Called for every reported fill, including ones already stored. */
    onFound?: (sectionString: string) => void;
    /** exhausted is false when the search ended early (fill cap hit or a chunk failed in a worker). */
    onComplete: (exhausted: boolean) => void;
    onProgress?: () => void;
    fillFilter?: FillWordFilterPayload;
    /** Fill this word first using rootCandidates instead of picking by MRV. */
    rootWord?: GridWord;
    rootCandidates?: EntryCandidate[];
}

/** Aim for this many root-candidate chunks per worker so idle workers can pick up slack. */
const CHUNKS_PER_WORKER = 16;
const MAX_CHUNK_SIZE = 32;

interface ActiveJob {
    jobId: number;
    options: StartFillOptions;
    /** Root-candidate chunks not yet handed to a worker. */
    queue: EntryCandidate[][];
    /** Workers currently searching a chunk of this job. */
    busy: Set<Worker>;
    /** The chunk each busy worker is searching, so a failed chunk can be retried. */
    inFlight: Map<Worker, EntryCandidate[]>;
    retried: Set<EntryCandidate[]>;
    /** Set when a chunk failed twice, so part of the search space went unsearched. */
    incomplete: boolean;
}

let workers: Worker[] = [];
let wordListVersion = 0;
let postedWordListVersion = -1;
let nextJobId = 1;
let activeJob: ActiveJob | undefined;
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

function handleWorkerError(worker: Worker, err: ErrorEvent) {
    console.error("Fill worker error", err);
    if (activeJob) handleChunkFailure(activeJob, worker);
}

function postInitWordList(worker: Worker) {
    const index = getWordIndexInitPayload();
    if (!index) return;
    postToWorker(worker, { type: "initWordList", index });
}

function ensureWorkers(count: number) {
    while (workers.length < count) {
        const worker = createWorker();
        worker.onmessage = event => handleWorkerMessage(worker, event);
        worker.onerror = err => handleWorkerError(worker, err);
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

function chunkCandidates<T>(items: T[], workerCount: number): T[][] {
    const size = Math.max(1, Math.min(MAX_CHUNK_SIZE, Math.ceil(items.length / (workerCount * CHUNKS_PER_WORKER))));
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
}

/** Hand the worker its next chunk, or retire it from the job (completing the job when all are idle). */
function postChunk(job: ActiveJob, worker: Worker, chunk: EntryCandidate[]) {
    job.inFlight.set(worker, chunk);
    postToWorker(worker, { type: "chunk", jobId: job.jobId, entryCandidates: chunk });
}

function handleWorkerIdle(job: ActiveJob, worker: Worker, canTakeMore: boolean) {
    job.inFlight.delete(worker);
    const next = canTakeMore ? job.queue.shift() : undefined;
    if (next) {
        postChunk(job, worker, next);
        return;
    }
    job.busy.delete(worker);
    if (job.busy.size === 0) finishJob(job, false);
}

/** Retry a failed chunk once on the same worker; a second failure retires the worker. */
function handleChunkFailure(job: ActiveJob, worker: Worker) {
    const chunk = job.inFlight.get(worker);
    if (chunk && !job.retried.has(chunk)) {
        job.retried.add(chunk);
        postChunk(job, worker, chunk);
        return;
    }
    if (chunk) job.incomplete = true;
    handleWorkerIdle(job, worker, false);
}

function finishJob(job: ActiveJob, cancelWorkers: boolean) {
    if (activeJob !== job) return;
    activeJob = undefined;
    if (cancelWorkers) {
        for (const worker of workers) postToWorker(worker, { type: "cancel", jobId: job.jobId });
    }
    job.options.onComplete(!cancelWorkers && !job.incomplete && job.queue.length === 0);
}

function handleWorkerMessage(worker: Worker, event: MessageEvent<WorkerToMainMessage>) {
    const msg = event.data;
    const job = activeJob;
    if (!job || msg.jobId !== job.jobId) return;

    if (msg.type === "found") {
        const { section, onFound, onProgress } = job.options;
        for (const fill of msg.fills) {
            onFound?.(fill.sectionString);
            if (!section.candidates.has(fill.sectionString)) {
                const candidate: SectionCandidate = {
                    sectionId: section.id,
                    sectionString: fill.sectionString,
                    score: sectionCandidateScore(section, fill.sectionString),
                    isFilteredOut: false,
                };
                section.candidates.set(fill.sectionString, candidate);
            }
            if (section.candidates.size >= MAX_STORED_FILLS) {
                onProgress?.();
                finishJob(job, true);
                return;
            }
        }
        onProgress?.();
        return;
    }

    if (msg.type === "error") {
        console.error("Fill worker failed:", msg.message);
        handleChunkFailure(job, worker);
        return;
    }

    if (msg.type === "chunkDone") {
        handleWorkerIdle(job, worker, true);
        return;
    }
}

/** Cancel any in-flight fill job. */
export function stopFill() {
    const job = activeJob;
    if (!job) return;
    activeJob = undefined;
    for (const worker of workers) {
        postToWorker(worker, { type: "cancel", jobId: job.jobId });
    }
}

/**
 * Start a parallel section fill. Root entry candidates are split into small chunks
 * that workers pull from a shared queue as they finish earlier ones.
 * Completes when every chunk is searched or MAX_STORED_FILLS fills are stored.
 * Returns false if there was nothing to search (already complete / no candidates).
 */
export function startFill(options: StartFillOptions): boolean {
    stopFill();
    installFillFilter(options.fillFilter);

    const { grid, section } = options;
    if (!Globals.wordList) {
        options.onComplete(false);
        return false;
    }

    syncWordListIfNeeded();

    const fillWord = options.rootWord ?? selectWordToFill(grid, section);
    if (!fillWord) {
        options.onComplete(true);
        return false;
    }

    const entryCandidates = options.rootCandidates
        ?? buildEntryCandidates(grid, fillWord, getSquaresForWord(grid, fillWord), false);
    if (entryCandidates.length === 0) {
        options.onComplete(true);
        return false;
    }

    const n = Math.min(workerCountCap(), entryCandidates.length);
    ensureWorkers(n);
    syncWordListIfNeeded();

    const job: ActiveJob = {
        jobId: nextJobId++,
        options,
        queue: chunkCandidates(entryCandidates, n),
        busy: new Set(),
        inFlight: new Map(),
        retried: new Set(),
        incomplete: false,
    };
    activeJob = job;

    section.fillState = createRootFillSearchState(grid, section, fillWord, entryCandidates);

    const workerGrid = stripGridLookups(grid);
    const workerSection = sectionForWorker(section);

    for (let i = 0; i < n && job.queue.length > 0; i++) {
        const worker = workers[i];
        job.busy.add(worker);
        postToWorker(worker, {
            type: "startJob",
            jobId: job.jobId,
            grid: workerGrid,
            section: workerSection,
            fillWord,
            fillFilter: options.fillFilter,
        });
        postChunk(job, worker, job.queue.shift()!);
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
