import React, { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import { normalizeSeed } from './magicFill';
import { fetchSeedSuggestions, SeedEntry } from '../lib/magicPuzzle';

export const MIN_SEED_LENGTH = 3;
export const MAX_SEED_LENGTH = 7;
export const GRID_SIZES = [5, 6, 7];

/** Letters that will be placed in the grid (A-Z; accents folded, digits and punctuation ignored). */
export function countLetters(text: string): number {
  return normalizeSeed(text).length;
}

export function isSeedLengthValid(length: number): boolean {
  return length >= MIN_SEED_LENGTH && length <= MAX_SEED_LENGTH;
}

/**
 * A grid may be the seed length or one longer (5x5, 6x6, or 7x7).
 * A 3-letter seed is shorter than the smallest grid, so only 5x5 is offered.
 */
export function isGridSizeEnabled(size: number, seedLength: number): boolean {
  if (!isSeedLengthValid(seedLength)) return false;
  const smallest = GRID_SIZES[0];
  if (seedLength + 1 < smallest) return size === smallest;
  return size === seedLength || size === seedLength + 1;
}

export function defaultGridSize(seedLength: number): number | undefined {
  if (!isSeedLengthValid(seedLength)) return undefined;
  if (seedLength <= 5) return 5;
  return seedLength;
}

/** The user's pick if it is still allowed, otherwise the default for this seed length. */
export function resolveGridSize(picked: number | undefined, seedLength: number): number | undefined {
  if (picked !== undefined && isGridSizeEnabled(picked, seedLength)) return picked;
  return defaultGridSize(seedLength);
}

interface SetupStepProps {
  seed: string;
  pickedSize: number | undefined;
  onSeedChange: (seed: string) => void;
  onSizeChange: (size: number) => void;
  onGenerate: () => void;
  busy?: boolean;
  error?: string;
}

function SuggestionsModal({
  suggestions,
  loading,
  error,
  onPick,
  onLoadMore,
  onClose,
}: {
  suggestions: SeedEntry[];
  loading: boolean;
  error: string;
  onPick: (entry: SeedEntry) => void;
  onLoadMore: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mc-modal-backdrop" onClick={onClose}>
      <div
        className="mc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mc-suggest-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="mc-modal-heading">
          <h2 className="mc-modal-title" id="mc-suggest-title">Suggestions</h2>
          <button type="button" className="mc-modal-close" aria-label="Close" onClick={onClose}>x</button>
        </div>
        {loading && suggestions.length === 0 && (
          <p className="mc-notice" role="status">
            <span className="mc-spinner" aria-hidden="true" />
            Loading suggestions...
          </p>
        )}
        {suggestions.length > 0 && (
          <ul className="mc-suggest-list">
            {suggestions.map(entry => (
              <li key={entry.entry}>
                <button
                  type="button"
                  className="mc-suggest-option"
                  disabled={loading}
                  onClick={() => onPick(entry)}
                >
                  {entry.displayText || entry.entry}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mc-notice mc-seed-error" role="alert">{error}</p>}
        <button
          type="button"
          className="mc-secondary mc-suggest-more"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading && <span className="mc-spinner" role="status" aria-label="Loading suggestions" />}
          {loading ? 'Loading...' : 'Load More'}
        </button>
      </div>
    </div>
  );
}

export default function SetupStep({
  seed, pickedSize, onSeedChange, onSizeChange, onGenerate, busy = false, error = '',
}: SetupStepProps) {
  const count = countLetters(seed);
  const countValid = isSeedLengthValid(count);
  const size = resolveGridSize(pickedSize, count);
  const canGenerate = countValid && size !== undefined;
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SeedEntry[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const seenRef = useRef(new Set<string>());
  const suggestRequest = useRef(0);

  async function loadSuggestions(excludeSeen: boolean) {
    const request = ++suggestRequest.current;
    setSuggesting(true);
    setSuggestError('');
    if (!excludeSeen) seenRef.current = new Set();
    try {
      const entries = await fetchSeedSuggestions(excludeSeen ? Array.from(seenRef.current) : []);
      if (suggestRequest.current !== request) return;
      if (entries.length === 0) {
        setSuggestError(excludeSeen ? 'No more suggestions right now.' : 'No suggestions found.');
        if (!excludeSeen) setSuggestions([]);
        return;
      }
      entries.forEach(entry => seenRef.current.add(entry.entry));
      setSuggestions(entries);
    } catch (err) {
      if (suggestRequest.current !== request) return;
      setSuggestError(err instanceof Error && err.message ? err.message : String(err));
    } finally {
      if (suggestRequest.current === request) setSuggesting(false);
    }
  }

  function openSuggestions() {
    setSuggestionsOpen(true);
    setSuggestions([]);
    void loadSuggestions(false);
  }

  function pickSuggestion(entry: SeedEntry) {
    onSeedChange(entry.displayText || entry.entry);
    setSuggestionsOpen(false);
  }

  return (
    <form
      className="mc-setup"
      onSubmit={e => {
        e.preventDefault();
        if (suggestionsOpen) return;
        if (canGenerate) onGenerate();
      }}
    >
      <Logo />

      <div className="mc-field">
        <label htmlFor="mc-seed" className="mc-label">Seed Answer</label>
        <p className="mc-hint" id="mc-seed-hint">
          Please give a seed answer 3-7 letters long that will be in the puzzle.
        </p>
        <input
          id="mc-seed"
          className="mc-input"
          type="text"
          value={seed}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby="mc-seed-hint mc-seed-count"
          disabled={busy}
          onChange={e => onSeedChange(e.target.value)}
        />
        <div id="mc-seed-count" className={`mc-count ${countValid ? 'mc-ok' : 'mc-bad'}`}>
          Letters: {count}
        </div>
        <button type="button" className="mc-choose" disabled={busy} onClick={openSuggestions}>
          Show Suggestions
        </button>
      </div>

      <fieldset className="mc-field">
        <legend className="mc-label">Grid Size</legend>
        <div className="mc-sizes" role="radiogroup" aria-label="Grid Size">
          {GRID_SIZES.map(s => {
            const enabled = isGridSizeEnabled(s, count);
            const selected = size === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!enabled || busy}
                className={`mc-size${selected ? ' mc-size-selected' : ''}`}
                onClick={() => onSizeChange(s)}
              >
                {s}x{s}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button type="submit" className="mc-primary" disabled={!canGenerate || busy}>
        Generate Grid
      </button>
      {error && <p className="mc-notice mc-seed-error" role="alert">{error}</p>}
      {suggestionsOpen && (
        <SuggestionsModal
          suggestions={suggestions}
          loading={suggesting}
          error={suggestError}
          onPick={pickSuggestion}
          onLoadMore={() => { void loadSuggestions(true); }}
          onClose={() => setSuggestionsOpen(false)}
        />
      )}
    </form>
  );
}
