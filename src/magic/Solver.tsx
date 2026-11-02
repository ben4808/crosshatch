import React, { useEffect, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import Logo from './Logo';
import { answerStartNumbers, Cells, MagicSlot } from './magicFill';
import { LoadedPuzzle, loadMagicPuzzle } from './loadPuzzle';
import { puzzleShareUrl } from './ShareStep';

type Direction = 'across' | 'down';
type Mark = 'normal' | 'wrong' | 'revealed';

interface Pos {
  row: number;
  col: number;
}

interface Play {
  letters: string[][];
  marks: Mark[][];
}

interface Model {
  cursor?: Pos;
  direction: Direction;
  /** True after the solver lands on a square that already has a letter, so the next key replaces and steps one square. */
  overwrite: boolean;
  play: Play;
  slots: MagicSlot[];
  solution: Cells;
  solved: boolean;
}

interface SolverProps {
  puzzleId: string;
  onCreatePuzzle: () => void;
}

function emptyPlay(solution: Cells): Play {
  return {
    letters: solution.map(row => row.map(() => '')),
    marks: solution.map(row => row.map(() => 'normal' as Mark)),
  };
}

function slotSquares(slot: MagicSlot): Pos[] {
  const dRow = slot.direction === 'down' ? 1 : 0;
  const dCol = slot.direction === 'across' ? 1 : 0;
  const squares: Pos[] = [];
  for (let i = 0; i < slot.entry.length; i++) {
    squares.push({ row: slot.row + i * dRow, col: slot.col + i * dCol });
  }
  return squares;
}

function indexInSlot(slot: MagicSlot, row: number, col: number): number {
  if (slot.direction === 'across') {
    if (row !== slot.row) return -1;
    const index = col - slot.col;
    return index >= 0 && index < slot.entry.length ? index : -1;
  }
  if (col !== slot.col) return -1;
  const index = row - slot.row;
  return index >= 0 && index < slot.entry.length ? index : -1;
}

function slotCovering(slots: MagicSlot[], row: number, col: number, direction: Direction): MagicSlot | undefined {
  return slots.find(slot => slot.direction === direction && indexInSlot(slot, row, col) >= 0);
}

function activeSlot(slots: MagicSlot[], cursor: Pos, direction: Direction): MagicSlot | undefined {
  const other: Direction = direction === 'across' ? 'down' : 'across';
  return slotCovering(slots, cursor.row, cursor.col, direction)
    ?? slotCovering(slots, cursor.row, cursor.col, other);
}

function slotsInDirection(slots: MagicSlot[], direction: Direction): MagicSlot[] {
  return slots.filter(slot => slot.direction === direction);
}

function nextNumberedSlot(slots: MagicSlot[], slot: MagicSlot): MagicSlot | undefined {
  const list = slotsInDirection(slots, slot.direction);
  const index = list.findIndex(item => item.key === slot.key);
  if (index < 0 || list.length < 2) return undefined;
  return list[(index + 1) % list.length];
}

function firstUnfilled(slot: MagicSlot, letters: string[][]): Pos | undefined {
  return slotSquares(slot).find(pos => !letters[pos.row][pos.col]);
}

/** Next empty square after this one, then the first empty square of the next numbered slot in this direction. */
function advanceSkip(slots: MagicSlot[], slot: MagicSlot, row: number, col: number, letters: string[][]): Pos | undefined {
  const squares = slotSquares(slot);
  const index = indexInSlot(slot, row, col);
  for (let i = index + 1; i < squares.length; i++) {
    if (!letters[squares[i].row][squares[i].col]) return squares[i];
  }
  const list = slotsInDirection(slots, slot.direction);
  const start = list.findIndex(item => item.key === slot.key);
  for (let step = 1; step < list.length; step++) {
    const found = firstUnfilled(list[(start + step) % list.length], letters);
    if (found) return found;
  }
  return undefined;
}

/** The following square in the slot, filled or not, or the start of the next slot. */
function advanceOverwrite(slots: MagicSlot[], slot: MagicSlot, row: number, col: number): Pos | undefined {
  const squares = slotSquares(slot);
  const index = indexInSlot(slot, row, col);
  if (index >= 0 && index + 1 < squares.length) return squares[index + 1];
  const next = nextNumberedSlot(slots, slot);
  if (!next) return undefined;
  return { row: next.row, col: next.col };
}

function isComplete(letters: string[][], solution: Cells): boolean {
  if (letters.length !== solution.length) return false;
  let any = false;
  for (let row = 0; row < solution.length; row++) {
    const filled = letters[row];
    const answer = solution[row];
    if (!filled || !answer || filled.length !== answer.length) return false;
    for (let col = 0; col < answer.length; col++) {
      const want = answer[col];
      if (!want) continue;
      any = true;
      if (filled[col] !== want) return false;
    }
  }
  return any;
}

export function formatSolveTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

function CheckIcon() {
  return (
    <svg className="mc-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12.5 l2.5 2.5 L16 9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="mc-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function directionLabel(direction: Direction): string {
  return direction === 'across' ? 'Across' : 'Down';
}

export default function Solver({ puzzleId, onCreatePuzzle }: SolverProps) {
  const [puzzle, setPuzzle] = useState<LoadedPuzzle | undefined>(undefined);
  const [error, setError] = useState('');
  const [play, setPlay] = useState<Play>({ letters: [], marks: [] });
  const [cursor, setCursor] = useState<Pos | undefined>(undefined);
  const [direction, setDirection] = useState<Direction>('across');
  const [solved, setSolved] = useState(false);
  const [congratsOpen, setCongratsOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState<'check' | 'reveal' | null>(null);
  const [toast, setToast] = useState('');

  const model = useRef<Model | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const congratsOpenRef = useRef(false);
  congratsOpenRef.current = congratsOpen;
  const keyApi = useRef({
    menu: null as 'check' | 'reveal' | null,
    typeLetter: (_letter: string) => {},
    backspace: () => {},
    moveBy: (_dRow: number, _dCol: number) => {},
  });

  useEffect(() => {
    let cancelled = false;
    setError('');
    setPuzzle(undefined);
    setSolved(false);
    setCongratsOpen(false);
    setStartedAt(null);
    setFrozenAt(null);
    setCursor(undefined);
    loadMagicPuzzle(puzzleId).then(loaded => {
      if (cancelled) return;
      const initial = emptyPlay(loaded.solution);
      model.current = {
        cursor: undefined,
        direction: 'across',
        overwrite: false,
        play: initial,
        slots: loaded.slots,
        solution: loaded.solution,
        solved: false,
      };
      // Legacy ReactDOM.render does not batch promise updates, and the solved
      // check must not see the puzzle before its letter grid exists.
      unstable_batchedUpdates(() => {
        setPuzzle(loaded);
        setPlay(initial);
        setDirection('across');
        setStartedAt(Date.now());
      });
    }).catch(err => {
      if (cancelled) return;
      setError(err instanceof Error && err.message ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [puzzleId]);

  useEffect(() => {
    if (startedAt == null || frozenAt != null) return undefined;
    const id = window.setInterval(() => setTick(value => value + 1), 250);
    return () => window.clearInterval(id);
  }, [startedAt, frozenAt]);

  useEffect(() => {
    if (!puzzle || solved) return;
    if (!isComplete(play.letters, puzzle.solution)) return;
    if (model.current) model.current.solved = true;
    setFrozenAt(Date.now());
    setSolved(true);
    setCongratsOpen(true);
    setMenu(null);
  }, [play, puzzle, solved]);

  useEffect(() => {
    if (!congratsOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCongratsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [congratsOpen]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  function commit(patch: Partial<Model>) {
    if (!model.current) return;
    const next = { ...model.current, ...patch };
    model.current = next;
    if (patch.play) setPlay(patch.play);
    if ('cursor' in patch) setCursor(patch.cursor);
    if (patch.direction) setDirection(patch.direction);
  }

  function focusCapture() {
    captureRef.current?.focus({ preventScroll: true });
  }

  function selectCell(row: number, col: number) {
    const current = model.current;
    if (!current) return;
    if (current.solution[row][col] === null) return;
    if (current.cursor && current.cursor.row === row && current.cursor.col === col) {
      const other: Direction = current.direction === 'across' ? 'down' : 'across';
      if (slotCovering(current.slots, row, col, other)) commit({ direction: other });
    } else {
      const preferred: Direction = current.cursor ? current.direction : 'across';
      commit({
        cursor: { row, col },
        direction: preferred,
        overwrite: current.play.letters[row][col] !== '',
      });
    }
    focusCapture();
  }

  function selectClue(slot: MagicSlot) {
    const current = model.current;
    if (!current) return;
    const squares = slotSquares(slot);
    const target = squares.find(pos => !current.play.letters[pos.row][pos.col]) ?? squares[0];
    if (!target) return;
    commit({
      cursor: target,
      direction: slot.direction,
      overwrite: current.play.letters[target.row][target.col] !== '',
    });
    focusCapture();
  }

  function typeLetter(letter: string) {
    const current = model.current;
    if (!current || current.solved || !current.cursor) return;
    const slot = activeSlot(current.slots, current.cursor, current.direction);
    if (!slot) return;
    const { row, col } = current.cursor;
    const letters = current.play.letters.map(line => line.slice());
    const marks = current.play.marks.map(line => line.slice());
    const replacing = current.overwrite;
    letters[row][col] = letter;
    marks[row][col] = 'normal';
    const dest = replacing
      ? advanceOverwrite(current.slots, slot, row, col)
      : advanceSkip(current.slots, slot, row, col, letters);
    commit({
      play: { letters, marks },
      cursor: dest ?? current.cursor,
      overwrite: dest ? letters[dest.row][dest.col] !== '' : false,
    });
  }

  function backspace() {
    const current = model.current;
    if (!current || current.solved || !current.cursor) return;
    const slot = activeSlot(current.slots, current.cursor, current.direction);
    if (!slot) return;
    const { row, col } = current.cursor;
    const index = indexInSlot(slot, row, col);
    if (index < 0) return;
    const letters = current.play.letters.map(line => line.slice());
    const marks = current.play.marks.map(line => line.slice());
    letters[row][col] = '';
    marks[row][col] = 'normal';
    const previous = index > 0 ? slotSquares(slot)[index - 1] : undefined;
    commit({
      play: { letters, marks },
      cursor: previous ?? current.cursor,
      overwrite: previous ? letters[previous.row][previous.col] !== '' : false,
    });
  }

  function moveBy(dRow: number, dCol: number) {
    const current = model.current;
    if (!current || !current.cursor) return;
    const nextDirection: Direction = dCol !== 0 ? 'across' : 'down';
    let row = current.cursor.row + dRow;
    let col = current.cursor.col + dCol;
    const size = current.solution.length;
    while (row >= 0 && col >= 0 && row < size && col < current.solution[row].length) {
      if (current.solution[row][col] !== null) {
        commit({
          cursor: { row, col },
          direction: nextDirection,
          overwrite: current.play.letters[row][col] !== '',
        });
        return;
      }
      row += dRow;
      col += dCol;
    }
    if (slotCovering(current.slots, current.cursor.row, current.cursor.col, nextDirection)) {
      commit({ direction: nextDirection });
    }
  }

  function positionsFor(scope: 'square' | 'word' | 'puzzle'): Pos[] {
    const current = model.current;
    if (!current) return [];
    if (scope === 'puzzle') {
      const all: Pos[] = [];
      current.solution.forEach((row, r) => row.forEach((cell, c) => {
        if (cell) all.push({ row: r, col: c });
      }));
      return all;
    }
    if (!current.cursor) return [];
    if (scope === 'square') return [current.cursor];
    const slot = activeSlot(current.slots, current.cursor, current.direction);
    return slot ? slotSquares(slot) : [];
  }

  function check(scope: 'square' | 'word' | 'puzzle') {
    const current = model.current;
    if (!current) return;
    const marks = current.play.marks.map(line => line.slice());
    let changed = false;
    positionsFor(scope).forEach(pos => {
      const want = current.solution[pos.row][pos.col];
      const got = current.play.letters[pos.row][pos.col];
      if (!want || !got || got === want) return;
      if (marks[pos.row][pos.col] !== 'wrong') {
        marks[pos.row][pos.col] = 'wrong';
        changed = true;
      }
    });
    if (changed) commit({ play: { letters: current.play.letters, marks } });
    setMenu(null);
  }

  function reveal(scope: 'square' | 'word' | 'puzzle') {
    const current = model.current;
    if (!current || current.solved) return;
    const letters = current.play.letters.map(line => line.slice());
    const marks = current.play.marks.map(line => line.slice());
    positionsFor(scope).forEach(pos => {
      const want = current.solution[pos.row][pos.col];
      if (!want || letters[pos.row][pos.col] === want) return;
      letters[pos.row][pos.col] = want;
      marks[pos.row][pos.col] = 'revealed';
    });
    commit({ play: { letters, marks } });
    setMenu(null);
  }

  keyApi.current = { menu, typeLetter, backspace, moveBy };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const api = keyApi.current;
      if (api.menu && event.key === 'Escape') {
        event.preventDefault();
        setMenu(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target !== captureRef.current) return;
      if (congratsOpenRef.current) return;
      const solvedNow = !!model.current?.solved;
      if (event.key === 'Backspace') {
        if (solvedNow) return;
        event.preventDefault();
        api.backspace();
        return;
      }
      if (event.key === 'ArrowLeft') { event.preventDefault(); api.moveBy(0, -1); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); api.moveBy(0, 1); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); api.moveBy(-1, 0); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); api.moveBy(1, 0); return; }
      if (solvedNow) return;
      // Letters typed into the capture field are handled by onInput. This covers a keyboard
      // event that lands somewhere else on the page.
      if (event.target !== captureRef.current && /^[a-zA-Z]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        api.typeLetter(event.key.toUpperCase());
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onCaptureInput(event: React.FormEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    event.currentTarget.value = '';
    const letter = value.match(/[a-zA-Z]/g)?.pop();
    if (letter) typeLetter(letter.toUpperCase());
  }

  async function share() {
    const link = puzzleShareUrl(puzzleId);
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = link;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      copied = document.execCommand('copy');
      area.remove();
    }
    if (copied) setToast('Link copied to clipboard');
  }

  const elapsed = startedAt == null ? 0 : (frozenAt ?? Date.now() + tick * 0) - startedAt;
  const slot = puzzle && cursor ? activeSlot(puzzle.slots, cursor, direction) : undefined;
  const numbers = puzzle ? answerStartNumbers(puzzle.solution) : [];
  const size = puzzle?.solution.length ?? 0;
  const hasSelection = !!cursor;
  const across = puzzle?.slots.filter(item => item.direction === 'across') ?? [];
  const down = puzzle?.slots.filter(item => item.direction === 'down') ?? [];

  function toolMenu(kind: 'check' | 'reveal', label: string, icon: React.ReactNode) {
    const open = menu === kind;
    const run = kind === 'check' ? check : reveal;
    const items: { scope: 'square' | 'word' | 'puzzle'; label: string; needsSelection: boolean }[] = [
      { scope: 'square', label: `${label} Square`, needsSelection: true },
      { scope: 'word', label: `${label} Word`, needsSelection: true },
      { scope: 'puzzle', label: `${label} Puzzle`, needsSelection: false },
    ];
    return (
      <div className="mc-tool">
        <button
          type="button"
          className={`mc-tool-button${open ? ' mc-tool-open' : ''}`}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!puzzle}
          onMouseDown={event => event.preventDefault()}
          onClick={() => setMenu(open ? null : kind)}
        >
          {icon}
        </button>
        {open && (
          <div className="mc-tool-menu" role="menu" aria-label={label}>
            {items.map(item => (
              <button
                key={item.scope}
                type="button"
                role="menuitem"
                className="mc-tool-item"
                disabled={item.needsSelection && !hasSelection}
                onMouseDown={event => event.preventDefault()}
                onClick={() => run(item.scope)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const clueText = slot ? (
    <>
      <span className="mc-solver-current-label">{slot.number} {directionLabel(slot.direction)}</span>
      <span>{puzzle?.clues[slot.key] || ''}</span>
    </>
  ) : (
    <span className="mc-solver-current-empty">Select a square</span>
  );

  return (
    <>
      <header className="mc-header mc-solver-header">
        <Logo compact />
        <div className="mc-solver-tools" ref={toolsRef}>
          {toolMenu('check', 'Check', <CheckIcon />)}
          {toolMenu('reveal', 'Reveal', <EyeIcon />)}
          <span className="mc-solver-timer" title="Elapsed time">{formatSolveTime(elapsed)}</span>
        </div>
      </header>
      <main className="mc-main mc-solver-main">
        {error && <p className="mc-notice mc-seed-error" role="alert">{error}</p>}
        {!error && !puzzle && <p className="mc-notice">Loading puzzle…</p>}
        {puzzle && (
          <div className="mc-solver">
            <div className="mc-solver-board">
              <p className="mc-solver-current">{clueText}</p>
              <div
                className="mc-grid"
                style={{ '--mc-size': size, gridTemplateColumns: `repeat(${size}, 1fr)` } as React.CSSProperties}
                role="grid"
                aria-label="Crossword"
              >
                {puzzle.solution.map((row, r) => row.map((cell, c) => {
                  if (cell === null) return <div key={`${r}-${c}`} className="mc-cell mc-cell-black" />;
                  const selected = cursor?.row === r && cursor?.col === c;
                  const inSlot = !!slot && indexInSlot(slot, r, c) >= 0;
                  const mark = play.marks[r]?.[c] ?? 'normal';
                  const letter = play.letters[r]?.[c] ?? '';
                  const number = numbers[r * size + c];
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      className={`mc-cell mc-cell-open${inSlot ? ' mc-cell-slot' : ''}${selected ? ' mc-cell-selected' : ''}`}
                      aria-selected={selected}
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => selectCell(r, c)}
                    >
                      {number !== undefined && <span className="mc-cell-number">{number}</span>}
                      {letter && (
                        <span className={`mc-cell-letter${mark === 'wrong' ? ' mc-cell-letter-wrong' : ''}${mark === 'revealed' ? ' mc-cell-letter-revealed' : ''}`}>
                          {letter}
                        </span>
                      )}
                    </button>
                  );
                }))}
              </div>
              <input
                ref={captureRef}
                className="mc-solver-capture"
                aria-label="Type a letter"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                onInput={onCaptureInput}
              />
            </div>
            <div className="mc-solver-lists">
              <ClueList title="Across" slots={across} clues={puzzle.clues} activeKey={slot?.key} onSelect={selectClue} />
              <ClueList title="Down" slots={down} clues={puzzle.clues} activeKey={slot?.key} onSelect={selectClue} />
            </div>
          </div>
        )}
      </main>
      {congratsOpen && (
        <div className="mc-modal-backdrop" onClick={() => setCongratsOpen(false)}>
          <div
            className="mc-modal mc-solver-done"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-solved-title"
            onClick={event => event.stopPropagation()}
          >
            <button type="button" className="mc-modal-close" aria-label="Close" onClick={() => setCongratsOpen(false)}>x</button>
            <h2 className="mc-modal-title mc-solver-done-title" id="mc-solved-title">
              <span className="mc-solver-congrats">Congratulations! 🎉🥳</span>
              <span>Puzzle solved in {formatSolveTime(elapsed)}.</span>
            </h2>
            <div className="mc-modal-actions mc-solver-done-actions">
              <button type="button" className="mc-secondary" onClick={() => { void share(); }}>Share Puzzle</button>
              <button type="button" className="mc-primary" onClick={onCreatePuzzle}>Create Puzzle</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="mc-toast" role="status">{toast}</div>}
    </>
  );
}

function ClueList({
  title,
  slots,
  clues,
  activeKey,
  onSelect,
}: {
  title: string;
  slots: MagicSlot[];
  clues: Record<string, string>;
  activeKey?: string;
  onSelect: (slot: MagicSlot) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = activeRef.current;
    if (!el || el.offsetParent === null) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [activeKey]);

  return (
    <div className="mc-solver-list">
      <div className="mc-clues-header">{title.toUpperCase()}</div>
      <div className="mc-solver-clues">
        {slots.map(slot => {
          const active = slot.key === activeKey;
          return (
            <button
              key={slot.key}
              ref={active ? activeRef : undefined}
              type="button"
              className={`mc-solver-clue${active ? ' mc-solver-clue-active' : ''}`}
              onMouseDown={event => event.preventDefault()}
              onClick={() => onSelect(slot)}
            >
              <span className="mc-clue-number">{slot.number}</span>
              <span className="mc-clue-text">{clues[slot.key] || ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
