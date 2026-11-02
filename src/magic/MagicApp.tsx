import React, { useEffect, useState } from 'react';
import ProgressBar from './ProgressBar';
import GridStep from './GridStep';
import CluesStep from './CluesStep';
import ShareStep, { puzzleIdFromLocation, SharedPuzzle } from './ShareStep';
import Solver from './Solver';
import { fillKey, MagicFill, normalizeSeed } from './magicFill';
import SetupStep, { countLetters, defaultGridSize, resolveGridSize } from './SetupStep';
import { ensureSeedEntry } from './seedEntry';
import './MagicApp.scss';

interface PuzzleSetup {
  /** Changes for every Generate Grid, so the Grid step starts a fresh puzzle. */
  id: number;
  seed: string;
  size: number;
}

export default function MagicApp() {
  const [solvingId, setSolvingId] = useState(() => puzzleIdFromLocation());
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [seed, setSeed] = useState('');
  const [pickedSize, setPickedSize] = useState<number | undefined>(undefined);
  const [puzzle, setPuzzle] = useState<PuzzleSetup | undefined>(undefined);
  const [fill, setFill] = useState<MagicFill | undefined>(undefined);
  const [shared, setShared] = useState<SharedPuzzle | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [seedError, setSeedError] = useState('');

  useEffect(() => {
    document.title = 'Magic Crossword';
    document.body.classList.add('mc-body');
    const syncPuzzle = () => setSolvingId(puzzleIdFromLocation());
    window.addEventListener('popstate', syncPuzzle);
    return () => {
      document.body.classList.remove('mc-body');
      window.removeEventListener('popstate', syncPuzzle);
    };
  }, []);

  function changeSeed(next: string) {
    const prevLength = countLetters(seed);
    const nextLength = countLetters(next);
    setSeed(next);
    setSeedError('');
    // A new letter count picks the size for that length, replacing a manual choice.
    if (prevLength !== nextLength) setPickedSize(defaultGridSize(nextLength));
  }

  async function generateGrid() {
    const submitted = seed;
    const size = resolveGridSize(pickedSize, countLetters(submitted));
    if (size === undefined || starting) return;
    setStarting(true);
    setSeedError('');
    try {
      await ensureSeedEntry(submitted);
    } catch (err) {
      setSeedError(err instanceof Error && err.message ? err.message : String(err));
      setStarting(false);
      return;
    }
    setPickedSize(size);
    // A new puzzle starts from scratch, including the Grid step's "Don't Use" choices.
    setPuzzle(prev => ({ id: (prev?.id ?? 0) + 1, seed: normalizeSeed(submitted), size }));
    setFill(undefined);
    setShared(undefined);
    // Setup changed, so any later progress is no longer valid.
    setMaxReached(1);
    setStep(1);
    setStarting(false);
  }

  function lookGood(next: MagicFill) {
    if (!fill || fillKey(fill) !== fillKey(next)) {
      setShared(undefined);
      setMaxReached(2);
    } else {
      setMaxReached(prev => Math.max(prev, 2));
    }
    setFill(next);
    setStep(2);
  }

  function createPuzzle() {
    const url = new URL(window.location.href);
    url.searchParams.delete('puzzle');
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSolvingId(undefined);
    setStep(0);
    setMaxReached(0);
    setSeed('');
    setPickedSize(undefined);
    setPuzzle(undefined);
    setFill(undefined);
    setShared(undefined);
    setSeedError('');
  }

  function finishPuzzle(saved: SharedPuzzle) {
    setShared(saved);
    setMaxReached(prev => Math.max(prev, 3));
    setStep(3);
  }

  if (solvingId) {
    return (
      <div className="mc-app">
        <Solver key={solvingId} puzzleId={solvingId} onCreatePuzzle={createPuzzle} />
      </div>
    );
  }

  return (
    <div className="mc-app">
      <header className="mc-header">
        <ProgressBar current={step} maxReached={maxReached} onSelect={setStep} />
      </header>
      <main className="mc-main">
        {step === 0 && (
          <SetupStep
            seed={seed}
            pickedSize={pickedSize}
            onSeedChange={changeSeed}
            onSizeChange={setPickedSize}
            onGenerate={() => { void generateGrid(); }}
            busy={starting}
            error={seedError}
          />
        )}
        {/* Stay mounted on later steps so the generated fill is still there when the user comes back. */}
        {puzzle && (
          <GridStep
            key={puzzle.id}
            seed={puzzle.seed}
            size={puzzle.size}
            hidden={step !== 1}
            onLooksGood={lookGood}
          />
        )}
        {puzzle && fill && (
          <CluesStep
            key={`${puzzle.id}-${fillKey(fill)}`}
            fill={fill}
            seed={puzzle.seed}
            hidden={step !== 2}
            onFinished={finishPuzzle}
          />
        )}
        {step === 3 && shared && <ShareStep puzzle={shared} />}
      </main>
    </div>
  );
}
