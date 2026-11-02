import React, { useCallback, useEffect, useRef, useState } from 'react';
import { saveDontUseEntries } from './dontUse';
import { answerStartNumbers, Cells, FILLS_PER_ROUND, MagicFill, MagicFillSession, startingCells } from './magicFill';

interface GridStepProps {
  /** Seed answer, already normalized to A-Z. */
  seed: string;
  size: number;
  hidden: boolean;
  onLooksGood: (fill: MagicFill) => void;
}

type Phase = 'generating' | 'done' | 'error';

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

function GridView({ cells, size }: { cells: Cells; size: number }) {
  const numbers = answerStartNumbers(cells);
  return (
    <div
      className="mc-grid"
      style={{ '--mc-size': size, gridTemplateColumns: `repeat(${size}, 1fr)` } as React.CSSProperties}
      role="img"
      aria-label="Crossword grid"
    >
      {cells.map((row, r) =>
        row.map((cell, c) => {
          const number = numbers[r * size + c];
          return (
            <div key={`${r}-${c}`} className={`mc-cell${cell === null ? ' mc-cell-black' : ''}`}>
              {number !== undefined && <span className="mc-cell-number">{number}</span>}
              {cell !== null && <span className="mc-cell-letter">{cell}</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}

interface DontUseModalProps {
  entries: string[];
  excluded: Set<string>;
  onClose: () => void;
  onTryAgain: (excluded: Set<string>) => void;
}

function DontUseModal({ entries, excluded, onClose, onTryAgain }: DontUseModalProps) {
  const [draft, setDraft] = useState(() => new Set(excluded));
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
        aria-labelledby="mc-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="mc-modal-heading">
          <h2 className="mc-modal-title" id="mc-modal-title">Select item(s) to not use</h2>
          <button type="button" className="mc-modal-close" aria-label="Close" onClick={onClose}>x</button>
        </div>
        <ul className="mc-modal-list">
          {entries.map(entry => {
            const isExcluded = draft.has(entry);
            return (
              <li key={entry}>
                <button
                  type="button"
                  className={`mc-modal-item${isExcluded ? ' mc-modal-item-excluded' : ''}`}
                  aria-pressed={isExcluded}
                  onClick={() => setDraft(prev => {
                    const next = new Set(prev);
                    if (next.has(entry)) next.delete(entry);
                    else next.add(entry);
                    return next;
                  })}
                >
                  {entry}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mc-modal-actions">
          <button type="button" className="mc-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="mc-primary" onClick={() => onTryAgain(draft)}>Try Again</button>
        </div>
      </div>
    </div>
  );
}

export default function GridStep({ seed, size, hidden, onLooksGood }: GridStepProps) {
  const [cells, setCells] = useState<Cells>(() => startingCells(size, seed.length));
  const [phase, setPhase] = useState<Phase>('generating');
  const [fill, setFill] = useState<MagicFill | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [modalOpen, setModalOpen] = useState(false);

  const sessionRef = useRef<MagicFillSession | undefined>(undefined);
  const fillRef = useRef<MagicFill | undefined>(undefined);
  const excludedRef = useRef(excluded);
  excludedRef.current = excluded;
  // Entries already counted for the current crossing. Un-crossing clears this so a later
  // crossing on this puzzle counts again; a new puzzle remounts and starts empty.
  const countedRef = useRef<Set<string>>(new Set());
  const countTokenRef = useRef(new Map<string, number>());
  const nextCountTokenRef = useRef(0);
  const mountedRef = useRef(false);

  // Finds the next FILLS_PER_ROUND fills and shows the best of them.
  const runRound = useCallback(async (session: MagicFillSession) => {
    setPhase('generating');
    setNotice('');
    const result = await session.generate(FILLS_PER_ROUND, excludedRef.current, next => {
      if (mountedRef.current) setCells(next);
    });
    if (!mountedRef.current || (!result.success && result.cancelled)) return;

    if (result.success) {
      fillRef.current = result.fill;
      setFill(result.fill);
      setCells(result.fill.cells);
      setPhase('done');
      return;
    }

    setNotice(result.message);
    if (fillRef.current) {
      // Nothing new turned up; keep showing the last fill.
      setCells(fillRef.current.cells);
      setPhase('done');
    } else {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let session: MagicFillSession;
    try {
      session = new MagicFillSession(seed, size);
    } catch (err) {
      setNotice(errorText(err));
      setPhase('error');
      return;
    }
    sessionRef.current = session;
    setCells(session.currentCells());
    void runRound(session);
    return () => {
      mountedRef.current = false;
      session.cancel();
      sessionRef.current = undefined;
    };
    // One session per puzzle; the parent remounts this component for a new puzzle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryAgain = useCallback(() => {
    const justCrossedOut = [...excludedRef.current].filter(entry => !countedRef.current.has(entry));
    if (justCrossedOut.length > 0) {
      const token = ++nextCountTokenRef.current;
      justCrossedOut.forEach(entry => {
        countedRef.current.add(entry);
        countTokenRef.current.set(entry, token);
      });
      void saveDontUseEntries(justCrossedOut).catch(err => {
        justCrossedOut.forEach(entry => {
          if (countTokenRef.current.get(entry) !== token) return;
          countedRef.current.delete(entry);
          countTokenRef.current.delete(entry);
        });
        console.error("Failed to save don't-use entries", err);
      });
    }
    if (sessionRef.current) void runRound(sessionRef.current);
  }, [runRound]);

  const tryAgainFromModal = useCallback((next: Set<string>) => {
    excludedRef.current.forEach(entry => {
      if (next.has(entry)) return;
      countedRef.current.delete(entry);
      countTokenRef.current.delete(entry);
    });
    excludedRef.current = next;
    setExcluded(next);
    setModalOpen(false);
    tryAgain();
  }, [tryAgain]);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const answers = fill ? fill.entries.filter(entry => entry !== seed) : [];

  return (
    <div className="mc-gridstep" hidden={hidden}>
      <GridView cells={cells} size={size} />

      {phase === 'generating' && <p className="mc-generating" role="status">Generating...</p>}

      {phase !== 'generating' && notice && <p className="mc-notice" role="status">{notice}</p>}

      {phase === 'done' && (
        <div className="mc-verdict">
          <p className="mc-ask">How does this look?</p>
          <div className="mc-verdict-buttons">
            <div className="mc-retry">
              <button
                type="button"
                className="mc-secondary"
                aria-haspopup="dialog"
                aria-expanded={modalOpen}
                onClick={() => setModalOpen(true)}
              >
                Don't Use <span className="mc-caret" aria-hidden="true">&#9662;</span>
              </button>
              <button type="button" className="mc-primary" onClick={tryAgain}>Try Again</button>
            </div>
            <button type="button" className="mc-primary" onClick={() => fill && onLooksGood(fill)}>Looks Good</button>
          </div>
        </div>
      )}

      {phase === 'error' && sessionRef.current && (
        <div className="mc-verdict">
          <button type="button" className="mc-primary" onClick={tryAgain}>Try Again</button>
        </div>
      )}

      {modalOpen && (
        <DontUseModal
          entries={answers}
          excluded={excluded}
          onClose={closeModal}
          onTryAgain={tryAgainFromModal}
        />
      )}
    </div>
  );
}
