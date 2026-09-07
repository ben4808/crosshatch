import React, { useEffect, useState } from "react";
import { applyCrosswordListRatings, rebuildWordIndex, removeCrosswordListWord } from "../../lib/wordList";
import Globals from "../../lib/windowService";

export const ENTRY_TYPE_OPTIONS = [
    "Word",
    "Phrase",
    "Proper Name",
    "Acronym/Abbreviation",
    "Prefix/Suffix",
    "Nonsense",
];

export const UNITY_OPTIONS = [
    "Concept",
    "Collocation",
    "Formula",
    "Partial",
    "Variant",
    "Non-unit",
    "Nonsense",
];

export const FAMILIARITY_OPTIONS = [
    "Literal",
    "Ubiquitous",
    "Common Name",
    "Active",
    "General Knowledge",
    "Inferred",
    "Niche",
    "Obscure",
    "Barely Exists",
    "Nonsense",
];

export const QUALITY_OPTIONS = [
    "Idiomatic",
    "Interesting",
    "Appealing",
    "Positive",
    "Trendy",
    "Normal",
    "Sensitive",
    "Non-unit",
    "Uncommon Inflection",
    "Clunky",
];

export interface ClassifyRow {
    rowId: string;
    isNew?: boolean;
    fillWord: string;
    entry: string | null;
    lang: string | null;
    baseForm: string;
    displayText: string;
    entryType: string;
    unityBucket: string;
    familiarityBucket: string;
    qualityBucket: string;
    isVulgar: boolean;
    isCrosswordese: boolean;
    isBreakfast: boolean;
    nytValue: string;
}

interface ClassifyModalProps {
    fillWords: string[];
    onClose: () => void;
    onSaved?: () => void;
}

function optionsWithCurrent(options: string[], current: string): string[] {
    if (current && !options.includes(current)) return [current, ...options];
    return options;
}

function asText(value: string | null | undefined): string {
    return value == null ? "" : value;
}

function rowsEqual(a: ClassifyRow, b: ClassifyRow): boolean {
    return a.fillWord === b.fillWord
        && a.entry === b.entry
        && a.baseForm === b.baseForm
        && a.displayText === b.displayText
        && a.entryType === b.entryType
        && a.unityBucket === b.unityBucket
        && a.familiarityBucket === b.familiarityBucket
        && a.qualityBucket === b.qualityBucket
        && a.isVulgar === b.isVulgar
        && a.isCrosswordese === b.isCrosswordese
        && a.isBreakfast === b.isBreakfast;
}

function nytDisplay(value: string | null | undefined): string {
    if (value == null || value.trim() === "") return "None";
    return value;
}

function makeBlankRow(): ClassifyRow {
    return {
        rowId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        isNew: true,
        fillWord: "",
        entry: "",
        lang: "en",
        baseForm: "",
        displayText: "",
        entryType: "",
        unityBucket: "Concept",
        familiarityBucket: "General Knowledge",
        qualityBucket: "Normal",
        isVulgar: false,
        isCrosswordese: false,
        isBreakfast: false,
        nytValue: "None",
    };
}

function ClassifyModal(props: ClassifyModalProps) {
    const [rows, setRows] = useState<ClassifyRow[]>([]);
    const [originals, setOriginals] = useState<ClassifyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [status, setStatus] = useState<string | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(undefined);
        setStatus(undefined);

        fetch("/api/classify/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fillWords: props.fillWords }),
        })
            .then(async (res) => {
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(body.error || `Failed to load entries (${res.status})`);
                }
                return body.entries as {
                    fillWord: string;
                    entry: string | null;
                    lang: string | null;
                    displayText: string | null;
                    entryType: string | null;
                    unityBucket: string | null;
                    familiarityBucket: string | null;
                    qualityBucket: string | null;
                    isVulgar: boolean | null;
                    isCrosswordese?: boolean;
                    isBreakfast?: boolean;
                    baseForm?: string | null;
                    nytValue?: string | null;
                }[];
            })
            .then((entries) => {
                if (cancelled) return;
                const mapped: ClassifyRow[] = props.fillWords.map((fillWord) => {
                    const match = entries.find((entry) => entry.fillWord === fillWord);
                    return {
                        rowId: fillWord,
                        fillWord,
                        entry: match?.entry ?? null,
                        lang: match?.lang ?? null,
                        baseForm: asText(match?.baseForm),
                        displayText: asText(match?.displayText),
                        entryType: asText(match?.entryType),
                        unityBucket: asText(match?.unityBucket),
                        familiarityBucket: asText(match?.familiarityBucket),
                        qualityBucket: asText(match?.qualityBucket),
                        isVulgar: match?.isVulgar === true,
                        isCrosswordese: match?.isCrosswordese === true,
                        isBreakfast: match?.isBreakfast === true,
                        nytValue: nytDisplay(match?.nytValue),
                    };
                });
                setRows(mapped);
                setOriginals(mapped.map((row) => ({ ...row })));
                setLoading(false);
            })
            .catch((err: Error) => {
                if (cancelled) return;
                setError(err.message);
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [props.fillWords]);

    function updateRow(index: number, patch: Partial<ClassifyRow>) {
        setRows((prev) => prev.map((row, i) => i === index ? { ...row, ...patch } : row));
        setStatus(undefined);
    }

    function handleAddEntry() {
        const blank = makeBlankRow();
        setRows((prev) => [...prev, blank]);
        setOriginals((prev) => [...prev, { ...blank }]);
        setStatus(undefined);
        setError(undefined);
    }

    async function handleDelete(rowId: string) {
        const row = rows.find((item) => item.rowId === rowId);
        if (!row) return;
        if (!window.confirm("Are you sure?")) return;

        const entry = (row.entry || "").trim();
        if (entry && !row.isNew) {
            try {
                setSaving(true);
                setError(undefined);
                const res = await fetch("/api/classify/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entry, lang: row.lang || "en" }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(body.error || `Failed to delete (${res.status})`);
                }
                removeCrosswordListWord(row.fillWord || entry);
                props.onSaved?.();
            } catch (err: any) {
                setError(err.message || String(err));
                setSaving(false);
                return;
            } finally {
                setSaving(false);
            }
        }

        setRows((prev) => prev.filter((item) => item.rowId !== rowId));
        setOriginals((prev) => prev.filter((item) => item.rowId !== rowId));
        setStatus(`Deleted ${entry || "row"}.`);
    }

    async function handleSave() {
        const changed = rows.filter((row, i) => {
            const entry = (row.entry || row.fillWord || "").trim();
            if (!entry) return false;
            return !rowsEqual(row, originals[i]);
        }).map((row) => ({
            ...row,
            entry: (row.entry || row.fillWord || "").trim(),
            fillWord: (row.fillWord || row.entry || "").trim(),
            lang: row.lang || "en",
        }));
        if (changed.length === 0) {
            setStatus("No changes to save.");
            return;
        }

        setSaving(true);
        setError(undefined);
        setStatus(undefined);

        try {
            const res = await fetch("/api/classify/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    originals,
                    rows: changed,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || `Failed to save (${res.status})`);
            }

            changed.forEach((row) => {
                applyCrosswordListRatings(
                    row.fillWord || row.entry || "",
                    row.unityBucket || null,
                    row.familiarityBucket || null,
                    row.qualityBucket || null,
                );
                const word = (row.entry || row.fillWord || "").toUpperCase();
                if (Globals.knownWords && /^[A-Z]+$/.test(word)) {
                    Globals.knownWords.add(word);
                }
            });
            const savedIds = new Set(changed.map((row) => row.rowId));
            if (changed.some((row) => row.isNew || !originals.find((original) => original.rowId === row.rowId)?.entry)) {
                rebuildWordIndex();
            }

            const nextRows = rows.map((row) => {
                if (!savedIds.has(row.rowId)) return { ...row };
                const entry = (row.entry || row.fillWord || "").trim();
                if (!entry) return row;
                if (row.isNew) {
                    return { ...row, isNew: false, rowId: entry, fillWord: entry, entry, lang: row.lang || "en" };
                }
                return { ...row, entry, lang: row.lang || "en" };
            });
            setRows(nextRows);
            setOriginals(nextRows.map((row) => ({ ...row })));
            setStatus(`Saved ${changed.length} ${changed.length === 1 ? "entry" : "entries"}.`);
            props.onSaved?.();
        } catch (err: any) {
            setError(err.message || String(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="classify-modal-overlay" onClick={props.onClose}>
            <div className="classify-modal" onClick={(event) => event.stopPropagation()}>
                <div className="classify-modal-header">
                    <div className="classify-modal-title">Classify Fill Entries</div>
                    <button className="classify-modal-close" onClick={props.onClose}>×</button>
                </div>
                {loading && <div className="classify-modal-status">Loading entries…</div>}
                {error && <div className="classify-modal-error">{error}</div>}
                {!loading && !error && (
                    <div className="classify-table-wrap">
                        <table className="classify-table">
                            <thead>
                                <tr>
                                    <th>Entry</th>
                                    <th>Base Form</th>
                                    <th>Display</th>
                                    <th>Classification</th>
                                    <th>Unity</th>
                                    <th>Familiarity</th>
                                    <th>Quality</th>
                                    <th>Vulgar</th>
                                    <th>Crosswordese</th>
                                    <th>Breakfast</th>
                                    <th>NYT</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, index) => {
                                    return (
                                    <tr key={row.rowId}>
                                        <td>
                                            {row.isNew ? (
                                                <input
                                                    type="text"
                                                    value={row.entry || ""}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        updateRow(index, { entry: value, fillWord: value, lang: "en" });
                                                    }}
                                                />
                                            ) : (
                                                <>
                                                    {row.fillWord}
                                                    {!row.entry && <div className="classify-missing">Not in database</div>}
                                                </>
                                            )}
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                value={row.baseForm}
                                                onChange={(event) => updateRow(index, { baseForm: event.target.value })}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                value={row.displayText}
                                                onChange={(event) => updateRow(index, { displayText: event.target.value })}
                                            />
                                        </td>
                                        <td>
                                            <select
                                                value={row.entryType}
                                                onChange={(event) => updateRow(index, { entryType: event.target.value })}
                                            >
                                                <option value=""></option>
                                                {optionsWithCurrent(ENTRY_TYPE_OPTIONS, row.entryType).map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={row.unityBucket}
                                                onChange={(event) => updateRow(index, { unityBucket: event.target.value })}
                                            >
                                                <option value=""></option>
                                                {optionsWithCurrent(UNITY_OPTIONS, row.unityBucket).map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={row.familiarityBucket}
                                                onChange={(event) => updateRow(index, { familiarityBucket: event.target.value })}
                                            >
                                                <option value=""></option>
                                                {optionsWithCurrent(FAMILIARITY_OPTIONS, row.familiarityBucket).map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={row.qualityBucket}
                                                onChange={(event) => updateRow(index, { qualityBucket: event.target.value })}
                                            >
                                                <option value=""></option>
                                                {optionsWithCurrent(QUALITY_OPTIONS, row.qualityBucket).map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="classify-check-cell">
                                            <input
                                                type="checkbox"
                                                checked={row.isVulgar}
                                                onChange={(event) => updateRow(index, { isVulgar: event.target.checked })}
                                            />
                                        </td>
                                        <td className="classify-check-cell">
                                            <input
                                                type="checkbox"
                                                checked={row.isCrosswordese}
                                                onChange={(event) => updateRow(index, { isCrosswordese: event.target.checked })}
                                            />
                                        </td>
                                        <td className="classify-check-cell">
                                            <input
                                                type="checkbox"
                                                checked={row.isBreakfast}
                                                onChange={(event) => updateRow(index, { isBreakfast: event.target.checked })}
                                            />
                                        </td>
                                        <td>{row.nytValue || "None"}</td>
                                        <td className="classify-delete-cell">
                                            <button
                                                type="button"
                                                className="classify-delete-button"
                                                title="Delete entry"
                                                onClick={() => handleDelete(row.rowId)}
                                                disabled={saving}
                                            >
                                                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                                                    <path
                                                        fill="currentColor"
                                                        d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a1 1 0 0 0 1-1V8H5v12a1 1 0 0 0 1 1z"
                                                    />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <button
                            type="button"
                            className="classify-add-button"
                            onClick={handleAddEntry}
                        >
                            Add Entry
                        </button>
                    </div>
                )}
                <div className="classify-modal-footer">
                    {status && <div className="classify-modal-status">{status}</div>}
                    <button
                        className="classify-save-button"
                        onClick={handleSave}
                        disabled={loading || saving || !!error}
                    >
                        {saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ClassifyModal;
