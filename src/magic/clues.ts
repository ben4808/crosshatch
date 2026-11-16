import cluePromptUrl from "../prompts/clue_prompt.txt";
import {
    displayTextsFromStatuses,
    EntryClueStatus,
    existingClueTextsByAnswer,
    formatCluePromptData,
    loadPrompt,
    MAX_CLUE_RETRIES,
    MUSE_MODEL,
    pickGeneratedClue,
    postJson,
    requestTypedClues,
    TypedClue,
} from "../lib/magicPuzzle";
import { fillKey, MagicFill, MagicSlot } from "./magicFill";
import { generateMagicPuzzleId } from "./puzzleId";

const MIN_AI_CLUES = 7;
const CLUE_BATCH_SIZE = 10;

export { pickGeneratedClue };
export type { TypedClue };

export interface CommunityClue {
    clue: string;
    timesUsed: number;
}

export interface CommunityCluesByEntry {
    [entry: string]: CommunityClue[];
}

export interface AiCluesByEntry {
    [entry: string]: TypedClue[];
}

function chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
    return batches;
}

function uniqueEntries(slots: MagicSlot[]): string[] {
    return Array.from(new Set(slots.map(slot => slot.entry).filter(Boolean)));
}

export async function loadExistingClues(
    slots: MagicSlot[],
    lang = "en",
    signal?: AbortSignal,
): Promise<{ ai: AiCluesByEntry; community: CommunityCluesByEntry; statuses: Map<string, EntryClueStatus> }> {
    const entries = uniqueEntries(slots);
    const ai: AiCluesByEntry = {};
    const community: CommunityCluesByEntry = {};
    const statuses = new Map<string, EntryClueStatus>();
    entries.forEach(entry => {
        ai[entry] = [];
        community[entry] = [];
    });
    if (entries.length === 0) return { ai, community, statuses };

    const [aiResult, communityResult] = await Promise.all([
        postJson<{ entries: EntryClueStatus[] }>("/magicPuzzle/entryClues", { entries, lang }, signal),
        postJson<{ entries: { entry: string; clues: CommunityClue[] }[] }>("/magicPuzzle/communityClues", { entries, lang }, signal),
    ]);

    (aiResult.entries || []).forEach(status => {
        const entry = status.entry.toUpperCase();
        statuses.set(entry, status);
        ai[entry] = (status.clues || [])
            .filter(clue => !clue.isSeedword && clue.clue)
            .map(clue => ({
                clue: clue.clue,
                clueType: clue.clueType || "",
                timesUsed: Number(clue.timesUsed ?? 0),
            }));
    });
    (communityResult.entries || []).forEach(row => {
        const entry = String(row.entry || "").toUpperCase();
        if (!entry) return;
        community[entry] = (row.clues || [])
            .map(clue => ({ clue: String(clue.clue || "").trim(), timesUsed: Number(clue.timesUsed ?? 0) }))
            .filter(clue => clue.clue);
    });

    return { ai, community, statuses };
}

export function entriesNeedingAiClues(ai: AiCluesByEntry, entries: string[]): string[] {
    return entries.filter(entry => (ai[entry] || []).length < MIN_AI_CLUES);
}

const CONTEXT_CLUE_TYPE = "Context";

export interface AutoSelectOptions {
    /** User-edited clues. Left unchanged, and a Context clue here uses the one Context slot. */
    lockedKeys?: ReadonlySet<string>;
    /** Slots whose clue the caller sets (the seed while its lore clue is pending or already chosen). */
    ignoredKeys?: ReadonlySet<string>;
}

function usableClues(clues: TypedClue[]): TypedClue[] {
    return clues.filter(clue => clue.clue.trim());
}

/** True when every available clue is Context, so auto-select has no other choice. */
function isContextOnly(clues: TypedClue[]): boolean {
    const usable = usableClues(clues);
    return usable.length > 0 && usable.every(clue => clue.clueType === CONTEXT_CLUE_TYPE);
}

function clueTypeOf(clues: TypedClue[], text: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    return clues.find(clue => clue.clue === trimmed)?.clueType;
}

/**
 * Auto-select one clue per empty slot.
 * At most one selected clue may be Context, unless more than one entry has only Context clues —
 * those entries each get a Context clue, and no other entry does.
 */
export function autoSelectedClues(
    slots: MagicSlot[],
    ai: AiCluesByEntry,
    existing: Record<string, string> = {},
    options?: AutoSelectOptions,
): Record<string, string> {
    const locked = options?.lockedKeys;
    const ignored = options?.ignoredKeys;
    const next = { ...existing };
    const excludeContext = new Set([CONTEXT_CLUE_TYPE]);

    const cluesFor = (slot: MagicSlot) => ai[slot.entry] || [];
    const textFor = (slot: MagicSlot) => (next[slot.key] || "").trim();
    const isIgnored = (slot: MagicSlot) => !!ignored?.has(slot.key);
    const isLocked = (slot: MagicSlot) => !!locked?.has(slot.key);
    const isContextOnlySlot = (slot: MagicSlot) => !isIgnored(slot) && isContextOnly(cluesFor(slot));

    // A non-forced entry may receive Context only when no entry is required to use it.
    const contextOnlyTakesSlot = slots.some(slot => {
        if (!isContextOnlySlot(slot)) return false;
        const text = textFor(slot);
        if (isLocked(slot) && text && clueTypeOf(cluesFor(slot), text) !== CONTEXT_CLUE_TYPE) return false;
        return true;
    });
    const allowVoluntary = !contextOnlyTakesSlot;

    let voluntaryUsed = false;
    let keeperKey: string | undefined;
    if (allowVoluntary) {
        const lockedHasContext = slots.some(slot =>
            !isIgnored(slot)
            && !isContextOnlySlot(slot)
            && isLocked(slot)
            && clueTypeOf(cluesFor(slot), textFor(slot)) === CONTEXT_CLUE_TYPE);
        if (lockedHasContext) {
            voluntaryUsed = true;
        } else {
            const keeper = slots.find(slot =>
                !isIgnored(slot)
                && !isContextOnlySlot(slot)
                && !isLocked(slot)
                && clueTypeOf(cluesFor(slot), textFor(slot)) === CONTEXT_CLUE_TYPE);
            if (keeper) {
                keeperKey = keeper.key;
                voluntaryUsed = true;
            }
        }
    }

    slots.forEach(slot => {
        if (isIgnored(slot)) return;
        const clues = cluesFor(slot);
        const text = textFor(slot);
        const type = clueTypeOf(clues, text);

        if (isContextOnlySlot(slot)) {
            if (isLocked(slot) && text) return;
            if (text && type === CONTEXT_CLUE_TYPE) return;
            const chosen = pickGeneratedClue(clues.filter(clue => clue.clueType === CONTEXT_CLUE_TYPE));
            if (chosen) next[slot.key] = chosen;
            return;
        }

        if (isLocked(slot) && text) return;
        if (slot.key === keeperKey) return;
        if (text && type !== CONTEXT_CLUE_TYPE) return;

        const chosen = pickGeneratedClue(clues, !allowVoluntary || voluntaryUsed ? excludeContext : undefined);
        if (!chosen) return;
        next[slot.key] = chosen;
        if (clueTypeOf(clues, chosen) === CONTEXT_CLUE_TYPE) voluntaryUsed = true;
    });
    return next;
}

export async function generateMissingAiClues(
    answers: string[],
    statuses: Map<string, EntryClueStatus>,
    existing: AiCluesByEntry,
    options: {
        lang?: string;
        signal?: AbortSignal;
        /** Community clues already stored for these entries, sent into the prompt so the AI doesn't repeat them. */
        community?: CommunityCluesByEntry;
        /** Progress text for the Clues step, e.g. "Generating clues (prompt 1 of 2)...". */
        onStatus?: (status: string) => void;
        /** Runs as soon as each batch returns (or fails after its retries), before the next prompt is sent. */
        onBatchComplete: (answers: string[], clues: AiCluesByEntry) => void;
    },
): Promise<{ failedBatches: number; totalBatches: number }> {
    if (answers.length === 0) return { failedBatches: 0, totalBatches: 0 };

    const batches = chunk(answers, CLUE_BATCH_SIZE);
    const cluePrompt = await loadPrompt(cluePromptUrl, options.signal);
    const lang = options.lang || "en";
    let failedBatches = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (options.signal?.aborted) return { failedBatches, totalBatches: batches.length };
        const promptLabel = `prompt ${i + 1} of ${batches.length}`;
        options.onStatus?.(`Generating clues (${promptLabel})...`);
        try {
            const displayByAnswer = displayTextsFromStatuses(batch, statuses);
            const prompt = cluePrompt.replace("[[DATA]]", formatCluePromptData(
                batch,
                displayByAnswer,
                existingClueTextsByAnswer(batch, statuses, options.community),
            ));
            const parsed = await requestTypedClues(prompt, batch, displayByAnswer, {
                signal: options.signal,
                model: MUSE_MODEL,
                onRetry: retry => options.onStatus?.(
                    `Generating clues (${promptLabel}, retry ${retry} of ${MAX_CLUE_RETRIES})...`),
            });
            if (options.signal?.aborted) return { failedBatches, totalBatches: batches.length };
            const merged: AiCluesByEntry = {};
            const newClues: { entry: string; clue: string; isSeedword: boolean; clueType: string }[] = [];
            batch.forEach(answer => {
                const already = existing[answer] || [];
                const seen = new Set(already.map(clue => clue.clue));
                const added = (parsed.get(answer) || []).filter(typed => typed.clue && !seen.has(typed.clue));
                added.forEach(typed => {
                    seen.add(typed.clue);
                    newClues.push({
                        entry: answer,
                        clue: typed.clue,
                        isSeedword: false,
                        clueType: typed.clueType,
                    });
                });
                merged[answer] = already.concat(added.map(typed => ({ ...typed, timesUsed: typed.timesUsed ?? 0 })));
            });
            // Apply this batch right away; saving to the database comes after.
            Object.assign(existing, merged);
            options.onBatchComplete(batch, merged);
            if (newClues.length > 0) {
                try {
                    await postJson("/magicPuzzle/generatedClues", { clues: newClues, lang }, options.signal);
                } catch (err) {
                    if (options.signal?.aborted) return { failedBatches, totalBatches: batches.length };
                    console.error("Failed to save generated clues", err);
                }
            }
        } catch (err) {
            if (options.signal?.aborted) return { failedBatches, totalBatches: batches.length };
            console.error("Failed to generate AI clues", err);
            failedBatches++;
            options.onBatchComplete(batch, {});
        }
    }
    return { failedBatches, totalBatches: batches.length };
}

export function communityCluesToSubmit(
    slots: MagicSlot[],
    selected: Record<string, string>,
    seed: string,
    ai: AiCluesByEntry,
    community: CommunityCluesByEntry,
    contribute: boolean,
    includeSeed: boolean,
): { entry: string; clue: string }[] {
    if (!contribute) return [];

    const out: { entry: string; clue: string }[] = [];
    const seen = new Set<string>();
    slots.forEach(slot => {
        const isSeed = slot.entry === seed;
        if (isSeed && !includeSeed) return;
        const text = (selected[slot.key] || "").trim();
        if (!text) return;
        const existing = new Set([
            ...(ai[slot.entry] || []).map(clue => clue.clue),
            ...(community[slot.entry] || []).map(clue => clue.clue),
        ]);
        if (existing.has(text)) return;
        const key = `${slot.entry}\n${text}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ entry: slot.entry, clue: text });
    });
    return out;
}

export async function deleteGeneratedClue(entry: string, clue: string, lang = "en"): Promise<void> {
    const result = await postJson<{ deleted: number }>("/magicPuzzle/deleteGeneratedClue", {
        entry,
        clue,
        lang,
    });
    if (!result.deleted) throw new Error("Couldn't delete that clue.");
}

export async function finishMagicPuzzle(input: {
    fill: MagicFill;
    seed: string;
    slots: MagicSlot[];
    selected: Record<string, string>;
    communityClues: { entry: string; clue: string }[];
    lang?: string;
}): Promise<{ magicPuzzleId: string; collectionId: string }> {
    return postJson("/magicPuzzle/finish", {
        id: generateMagicPuzzleId(),
        lang: input.lang || "en",
        width: input.fill.cells.length,
        height: input.fill.cells.length,
        seedAnswer: input.seed,
        grid: fillKey(input.fill),
        clues: input.slots.map((slot, order) => ({
            entry: slot.entry,
            clue: (input.selected[slot.key] || "").trim(),
            order,
            metadata1: slot.key,
        })),
        communityClues: input.communityClues,
    });
}
