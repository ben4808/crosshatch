import cluePromptUrl from "../prompts/clue_prompt.txt";
import {
    displayTextsFromStatuses,
    EntryClueStatus,
    loadPrompt,
    makeAICall,
    parseTypedClueResponse,
    pickGeneratedClue,
    postJson,
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

export function autoSelectedClues(
    slots: MagicSlot[],
    ai: AiCluesByEntry,
    existing: Record<string, string> = {},
): Record<string, string> {
    const next = { ...existing };
    slots.forEach(slot => {
        if ((next[slot.key] || "").trim()) return;
        const chosen = pickGeneratedClue(ai[slot.entry] || []);
        if (chosen) next[slot.key] = chosen;
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
        onBatchComplete: (answers: string[], clues: AiCluesByEntry) => void;
    },
): Promise<void> {
    if (answers.length === 0) return;

    const batches = chunk(answers, CLUE_BATCH_SIZE);
    const cluePrompt = await loadPrompt(cluePromptUrl, options.signal);
    const lang = options.lang || "en";

    for (const batch of batches) {
        if (options.signal?.aborted) return;
        try {
            const displayByAnswer = displayTextsFromStatuses(batch, statuses);
            const prompt = cluePrompt.replace("[[DATA]]",
                batch.map(answer => displayByAnswer.get(answer) || answer).join("\n"));
            const response = await makeAICall(prompt, options.signal);
            if (options.signal?.aborted) return;

            const parsed = parseTypedClueResponse(response, batch, displayByAnswer);
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
            if (newClues.length > 0) {
                await postJson("/magicPuzzle/generatedClues", { clues: newClues, lang }, options.signal);
            }
            if (options.signal?.aborted) return;
            Object.assign(existing, merged);
            options.onBatchComplete(batch, merged);
        } catch (err) {
            if (options.signal?.aborted) return;
            console.error("Failed to generate AI clues", err);
            options.onBatchComplete(batch, {});
        }
    }
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
