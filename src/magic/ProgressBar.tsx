import React from 'react';

export const STEPS = ['Setup', 'Grid', 'Clues', 'Share'] as const;

interface ProgressBarProps {
  current: number;
  /** Highest step index the user has reached; later steps are locked. */
  maxReached: number;
  onSelect: (step: number) => void;
}

export default function ProgressBar({ current, maxReached, onSelect }: ProgressBarProps) {
  return (
    <nav className="mc-progress" aria-label="Progress">
      <ol>
        {STEPS.map((label, i) => {
          const locked = i > maxReached;
          const state = i === current ? 'active' : i < current || i <= maxReached ? 'done' : 'locked';
          return (
            <li key={label} className={`mc-step mc-step-${state}`}>
              <button
                type="button"
                disabled={locked}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => onSelect(i)}
              >
                <span className="mc-step-dot">{locked ? '\u{1F512}\uFE0E' : i + 1}</span>
                <span className="mc-step-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
