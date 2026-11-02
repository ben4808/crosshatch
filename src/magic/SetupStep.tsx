import React from 'react';
import Logo from './Logo';
import { normalizeSeed } from './magicFill';

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

export default function SetupStep({ seed, pickedSize, onSeedChange, onSizeChange, onGenerate, busy = false, error = '' }: SetupStepProps) {
  const count = countLetters(seed);
  const countValid = isSeedLengthValid(count);
  const size = resolveGridSize(pickedSize, count);
  const canGenerate = countValid && size !== undefined;

  return (
    <form
      className="mc-setup"
      onSubmit={e => {
        e.preventDefault();
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
    </form>
  );
}
