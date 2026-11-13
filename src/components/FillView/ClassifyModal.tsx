import React, { useEffect, useState } from "react";
import { rescoreAllSectionCandidates } from "../../lib/section";
import { applyCrosswordListRatings, rebuildWordIndex, removeCrosswordListWord } from "../../lib/wordList";
import Globals from "../../lib/windowService";
import "./FillView.scss";

export const ENTRY_TYPE_OPTIONS = [
    "Word",
    "Phrase",
    "Contraction",
    "Proper Name",
    "Acronym/Abbreviation",
    "Prefix/Suffix",
    "Nonsense",
];

export const UNITY_OPTIONS = [
    "Concept",
    "Collocation",
    "Formula",
    "Formulaic",
    "Partial",
    "Variant",
    "Non-unit",
    "Nonsense",
];

export const FAMILIARITY_OPTIONS = [
    "Literal",
    "Ubiquitous",
    "Common Name",
    "Regionalism",
    "Active",
    "General Knowledge",
    "Inferred",
    "Niche",
    "Obscure",
    "Nonsense",
];

export const QUALITY_OPTIONS = [
    "Normal",
    "Idiomatic",
    "Interesting",
    "Feel-Good",
    "Trendy",
];

export const CROSSWORD_OPTIONS = [
    "Contrived",
    "Convenient",
    "Uncommon Derivation",
    "High-Scrabble",
    "Unexpected Form",
];

const CROSSWORD_OPTION_LABELS: Record<string, string> = {
    "Uncommon Derivation": "Unc. Derivation",
};

function crosswordOptionLabel(option: string): string {
    return CROSSWORD_OPTION_LABELS[option] ?? option;
}

export const UNPLEASANT_OPTIONS = [
    "Vulgar",
    "Sensitive",
    "Gross",
];

export type UnpleasantValue = "" | "Vulgar" | "Sensitive" | "Gross";

export interface ClassifyRow {
    rowId: string;
    isNew?: boolean;
    fillWord: string;
    entry: string | null;
    lang: string | null;
    displayText: string;
    classification: string;
    unityBucket: string;
    familiarityBucket: string;
    qualityBucket: string;
    crosswordBucket: string;
    baseForm: string;
    unpleasant: UnpleasantValue;
    isReviewed: boolean;
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

function unpleasantFromFlags(isVulgar?: boolean | null, isSensitive?: boolean, isGross?: boolean): UnpleasantValue {
    if (isVulgar === true) return "Vulgar";
    if (isSensitive === true) return "Sensitive";
    if (isGross === true) return "Gross";
    return "";
}

function rowsEqual(a: ClassifyRow, b: ClassifyRow): boolean {
    return a.fillWord === b.fillWord
        && a.entry === b.entry
        && a.displayText === b.displayText
        && a.baseForm === b.baseForm
        && a.classification === b.classification
        && a.unityBucket === b.unityBucket
        && a.familiarityBucket === b.familiarityBucket
        && a.qualityBucket === b.qualityBucket
        && a.crosswordBucket === b.crosswordBucket
        && a.unpleasant === b.unpleasant
        && a.isReviewed === b.isReviewed;
}

function nytDisplay(value: string | null | undefined): string {
    if (value == null || value.trim() === "") return "None";
    return value;
}

function isNonsenseBucket(value: string): boolean {
    return value === "Nonsense";
}

function defaultQualityBucket(
    qualityBucket: string,
    classification: string,
    unityBucket: string,
    familiarityBucket: string,
): string {
    if (qualityBucket) return qualityBucket;
    if (isNonsenseBucket(classification) || isNonsenseBucket(unityBucket) || isNonsenseBucket(familiarityBucket)) {
        return "";
    }
    return "Normal";
}

function makeBlankRow(): ClassifyRow {
    return {
        rowId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        isNew: true,
        fillWord: "",
        entry: "",
        lang: "en",
        displayText: "",
        classification: "",
        unityBucket: "Concept",
        familiarityBucket: "General Knowledge",
        qualityBucket: "Normal",
        crosswordBucket: "",
        baseForm: "",
        unpleasant: "",
        isReviewed: false,
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

        fetch("/chal-api/classify/entries", {
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
                    classification: string | null;
                    unityBucket: string | null;
                    familiarityBucket: string | null;
                    qualityBucket: string | null;
                    crosswordBucket: string | null;
                    baseForm?: string | null;
                    base_form?: string | null;
                    isVulgar: boolean | null;
                    isSensitive?: boolean;
                    isGross?: boolean;
                    isReviewed?: boolean;
                    nytValue?: string | null;
                }[];
            })
            .then((entries) => {
                if (cancelled) return;
                const mapped: ClassifyRow[] = props.fillWords.map((fillWord) => {
                    const match = entries.find((entry) => entry.fillWord === fillWord);
                    const classification = asText(match?.classification);
                    const unityBucket = asText(match?.unityBucket);
                    const familiarityBucket = asText(match?.familiarityBucket);
                    return {
                        rowId: fillWord,
                        fillWord,
                        entry: match?.entry ?? null,
                        lang: match?.lang ?? null,
                        displayText: asText(match?.displayText),
                        classification,
                        unityBucket,
                        familiarityBucket,
                        qualityBucket: defaultQualityBucket(
                            asText(match?.qualityBucket),
                            classification,
                            unityBucket,
                            familiarityBucket,
                        ),
                        crosswordBucket: asText(match?.crosswordBucket),
                        baseForm: asText(match?.baseForm ?? match?.base_form),
                        unpleasant: unpleasantFromFlags(match?.isVulgar, match?.isSensitive, match?.isGross),
                        isReviewed: match?.isReviewed === true,
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
        const entry = (row.entry || "").trim();
        const label = entry || row.fillWord || "this row";
        if (!window.confirm(`Delete "${label}" from the database? This cannot be undone.`)) return;

        if (entry && !row.isNew) {
            try {
                setSaving(true);
                setError(undefined);
                const res = await fetch("/chal-api/classify/delete", {
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
            if (!row.isNew && !row.entry && !row.displayText.trim()) return false;
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
            const res = await fetch("/chal-api/classify/save", {
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
                    row.classification || null,
                    row.unityBucket || null,
                    row.familiarityBucket || null,
                    row.qualityBucket || null,
                    {
                        crosswordBucket: row.crosswordBucket || null,
                        isAbbreviation: row.classification === "Acronym/Abbreviation",
                        hasAvoidTag: row.unpleasant === "Vulgar" || row.unpleasant === "Gross",
                        hasSensitiveTag: row.unpleasant === "Sensitive",
                        baseForm: row.baseForm || null,
                    },
                );
                const word = (row.entry || row.fillWord || "").toUpperCase();
                if (Globals.knownWords && /^[A-Z]+$/.test(word)) {
                    Globals.knownWords.add(word);
                }
            });
            if (changed.some((row) => row.isNew || !originals.find((original) => original.rowId === row.rowId)?.entry)) {
                rebuildWordIndex();
            }
            rescoreAllSectionCandidates();

            const savedIds = new Set(changed.map((row) => row.rowId));
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
        <div className="classify-modal-overlay">
            <div className="classify-modal">
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
                                    <th>Crossword</th>
                                    <th>Unpleasant</th>
                                    <th className="classify-check-cell">
                                        <div className="classify-reviewed-header">
                                            Reviewed
                                            <input
                                                type="checkbox"
                                                title="Check all unchecked"
                                                checked={rows.length > 0 && rows.every((row) => row.isReviewed)}
                                                onChange={(event) => {
                                                    if (!event.target.checked) return;
                                                    setRows((prev) => prev.map((row) => (
                                                        row.isReviewed ? row : { ...row, isReviewed: true }
                                                    )));
                                                    setStatus(undefined);
                                                }}
                                            />
                                        </div>
                                    </th>
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
                                                value={row.classification}
                                                onChange={(event) => updateRow(index, { classification: event.target.value })}
                                            >
                                                <option value=""></option>
                                                {optionsWithCurrent(ENTRY_TYPE_OPTIONS, row.classification).map((option) => (
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
                                        <td>
                                            <select
                                                value={row.crosswordBucket}
                                                onChange={(event) => updateRow(index, { crosswordBucket: event.target.value })}
                                            >
                                                <option value=""></option>
                                                {optionsWithCurrent(CROSSWORD_OPTIONS, row.crosswordBucket).map((option) => (
                                                    <option key={option} value={option}>{crosswordOptionLabel(option)}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={row.unpleasant}
                                                onChange={(event) => updateRow(index, {
                                                    unpleasant: event.target.value as UnpleasantValue,
                                                })}
                                            >
                                                <option value=""></option>
                                                {optionsWithCurrent(UNPLEASANT_OPTIONS, row.unpleasant).map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="classify-check-cell">
                                            <input
                                                type="checkbox"
                                                checked={row.isReviewed}
                                                onChange={(event) => updateRow(index, { isReviewed: event.target.checked })}
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
                                                <span aria-hidden="true">🗑️</span>
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
