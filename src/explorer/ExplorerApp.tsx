import React, { useEffect, useRef, useState } from "react";
import ClassifyModal, { FAMILIARITY_OPTIONS } from "../components/FillView/ClassifyModal";
import "./ExplorerApp.scss";

const COLUMN_SIZE = 20;

type ReviewedFilter = "both" | "yes" | "no";

interface ExplorerEntry {
  entry: string;
  displayText: string;
}

interface AppliedFilters {
  length: string;
  pattern: string;
  familiarityBuckets: string[];
  humanReviewed: ReviewedFilter;
  pageSize: string;
}

interface SearchResponse {
  entries: ExplorerEntry[];
  total: number;
  page: number;
  pageSize: number;
}

function bucketLabel(selected: string[]): string {
  if (selected.length === 0) return "Any";
  if (selected.length <= 2) return selected.join(", ");
  return `${selected.length} selected`;
}

function chunkColumns(entries: ExplorerEntry[]): ExplorerEntry[][] {
  const columns: ExplorerEntry[][] = [];
  for (let i = 0; i < entries.length; i += COLUMN_SIZE) {
    columns.push(entries.slice(i, i + COLUMN_SIZE));
  }
  return columns;
}

export default function ExplorerApp() {
  const [length, setLength] = useState("");
  const [pattern, setPattern] = useState("");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [bucketsOpen, setBucketsOpen] = useState(false);
  const [reviewed, setReviewed] = useState<ReviewedFilter>("both");
  const [pageSize, setPageSize] = useState("100");
  const [applied, setApplied] = useState<AppliedFilters | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ExplorerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [classifyWords, setClassifyWords] = useState<string[] | undefined>(undefined);
  const bucketMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Explorer";
    document.body.classList.add("mc-body");
    return () => {
      document.body.classList.remove("mc-body");
    };
  }, []);

  useEffect(() => {
    if (!bucketsOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!bucketMenuRef.current?.contains(event.target as Node)) setBucketsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setBucketsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [bucketsOpen]);

  const pageCount = applied && total > 0 ? Math.ceil(total / appliedPageSize(applied)) : applied ? 1 : 0;

  async function runSearch(filters: AppliedFilters, nextPage: number) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/explorer/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          length: filters.length,
          pattern: filters.pattern,
          familiarityBuckets: filters.familiarityBuckets,
          humanReviewed: filters.humanReviewed,
          page: nextPage,
          pageSize: filters.pageSize,
        }),
      });
      const body = await res.json().catch(() => ({})) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(body.error || `Search failed (${res.status})`);
      const size = body.pageSize || appliedPageSize(filters);
      const lastPage = body.total > 0 ? Math.ceil(body.total / size) : 1;
      if (body.entries.length === 0 && body.total > 0 && nextPage > lastPage) {
        await runSearch(filters, lastPage);
        return;
      }
      setEntries(body.entries);
      setTotal(body.total);
      setPage(body.page);
      setApplied(filters);
    } catch (err) {
      setEntries([]);
      setTotal(0);
      setError(err instanceof Error && err.message ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function currentFilters(): AppliedFilters {
    return {
      length: length.trim(),
      pattern,
      familiarityBuckets: FAMILIARITY_OPTIONS.filter((bucket) => buckets.includes(bucket)),
      humanReviewed: reviewed,
      pageSize: pageSize.trim() || "100",
    };
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setSelected(new Set());
    setBucketsOpen(false);
    void runSearch(currentFilters(), 1);
  }

  function goToPage(nextPage: number) {
    if (!applied || loading) return;
    void runSearch(applied, nextPage);
  }

  function toggleBucket(bucket: string) {
    setBuckets((prev) => (
      prev.includes(bucket) ? prev.filter((item) => item !== bucket) : [...prev, bucket]
    ));
  }

  function toggleSelected(entry: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entry)) next.delete(entry);
      else next.add(entry);
      return next;
    });
  }

  function openClassify() {
    const words = selected.size > 0
      ? Array.from(selected).sort()
      : entries.map((item) => item.entry);
    if (words.length === 0) return;
    setClassifyWords(words);
  }

  const columns = chunkColumns(entries);
  const rangeStart = entries.length === 0 ? 0 : (page - 1) * (applied ? appliedPageSize(applied) : entries.length) + 1;
  const rangeEnd = entries.length === 0 ? 0 : rangeStart + entries.length - 1;

  return (
    <div className="mc-app">
      <header className="ex-header">
        <form className="ex-filters" onSubmit={onSubmit}>
          <label className="ex-field">
            <span className="ex-label">Length</span>
            <input
              className="ex-input ex-length"
              type="text"
              inputMode="numeric"
              value={length}
              onChange={(event) => setLength(event.target.value)}
              aria-label="Length"
            />
          </label>
          <label className="ex-field">
            <span className="ex-label">Pattern</span>
            <input
              className="ex-input ex-pattern"
              type="text"
              value={pattern}
              placeholder="CR...W..D"
              onChange={(event) => setPattern(event.target.value)}
              aria-label="Pattern"
            />
          </label>
          <div className="ex-field ex-menu" ref={bucketMenuRef}>
            <span className="ex-label" id="ex-familiarity-label">Familiarity bucket</span>
            <button
              type="button"
              className="ex-input ex-menu-button"
              aria-haspopup="listbox"
              aria-expanded={bucketsOpen}
              aria-labelledby="ex-familiarity-label"
              onClick={() => setBucketsOpen((open) => !open)}
            >
              {bucketLabel(FAMILIARITY_OPTIONS.filter((bucket) => buckets.includes(bucket)))}
            </button>
            {bucketsOpen && (
              <ul className="ex-menu-panel" role="listbox" aria-multiselectable="true" aria-labelledby="ex-familiarity-label">
                {FAMILIARITY_OPTIONS.map((bucket) => {
                  const checked = buckets.includes(bucket);
                  return (
                    <li key={bucket}>
                      <label className="ex-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBucket(bucket)}
                        />
                        {bucket}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <label className="ex-field">
            <span className="ex-label">Human reviewed</span>
            <select
              className="ex-input ex-reviewed"
              value={reviewed}
              onChange={(event) => setReviewed(event.target.value as ReviewedFilter)}
              aria-label="Human reviewed"
            >
              <option value="both">Both</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="ex-field">
            <span className="ex-label">Results per page</span>
            <input
              className="ex-input ex-page-size"
              type="text"
              inputMode="numeric"
              value={pageSize}
              onChange={(event) => setPageSize(event.target.value)}
              aria-label="Results per page"
            />
          </label>
          <div className="ex-actions">
            <button className="mc-primary" type="submit" disabled={loading}>
              {loading ? "Searching…" : "Submit"}
            </button>
            <button
              className="mc-secondary"
              type="button"
              onClick={openClassify}
              disabled={entries.length === 0 && selected.size === 0}
            >
              Classify
            </button>
            <button
              className="mc-secondary"
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
            >
              Deselect All
            </button>
          </div>
          <div className="ex-pager">
            <button
              className="mc-secondary"
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={!applied || loading || page <= 1}
            >
              Previous
            </button>
            <span className="ex-page-label">
              {applied ? `Page ${page} of ${pageCount}` : "Page —"}
            </span>
            <button
              className="mc-secondary"
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={!applied || loading || page >= pageCount}
            >
              Next
            </button>
          </div>
        </form>
      </header>
      <main className="ex-main">
        {error && <p className="ex-status ex-error">{error}</p>}
        {!error && applied && (
          <p className="ex-status">
            {loading
              ? "Searching…"
              : total === 0
                ? "No matching entries."
                : `${rangeStart}–${rangeEnd} of ${total}${selected.size ? ` · ${selected.size} selected` : ""}`}
          </p>
        )}
        <div className="ex-columns">
          {columns.map((column, index) => (
            <div className="ex-column" key={column[0]?.entry ?? index}>
              {column.map((item) => {
                const isSelected = selected.has(item.entry);
                return (
                  <button
                    key={item.entry}
                    type="button"
                    className={isSelected ? "ex-item ex-item-selected" : "ex-item"}
                    aria-pressed={isSelected}
                    onClick={() => toggleSelected(item.entry)}
                  >
                    {item.displayText}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </main>
      {classifyWords && (
        <ClassifyModal
          fillWords={classifyWords}
          onClose={() => setClassifyWords(undefined)}
          onSaved={() => {
            if (applied) void runSearch(applied, page);
          }}
        />
      )}
    </div>
  );
}

function appliedPageSize(filters: AppliedFilters): number {
  const n = Number(filters.pageSize);
  return Number.isInteger(n) && n > 0 ? n : 100;
}
