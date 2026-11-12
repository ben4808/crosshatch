import React, { useEffect, useState } from 'react';
import ProgressBar from './ProgressBar';
import GridStep from './GridStep';
import CluesStep from './CluesStep';
import ShareStep, { puzzleIdFromLocation, SharedPuzzle } from './ShareStep';
import Solver from './Solver';
import { fillKey, MagicFill, normalizeSeed } from './magicFill';
import SetupStep, { countLetters, defaultGridSize, resolveGridSize } from './SetupStep';
import { ensureSeedEntry } from './seedEntry';
import { chooseSeedword, fetchSeedCandidates, GROK_MODEL, postJson } from '../lib/magicPuzzle';
import './MagicApp.scss';

interface PuzzleSetup {
  /** Changes for every Generate Grid, so the Grid step starts a fresh puzzle. */
  id: number;
  seed: string;
  size: number;
  /** AI-written clue for the seed, when the seed came from Choose For Me. */
  seedClue?: string;
}

/** Seed lengths Choose For Me picks from, one per grid size. */
const CHOOSE_SEED_LENGTHS = [5, 6, 7];

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
  const [choosing, setChoosing] = useState(false);
  // The clue the AI wrote for the seed picked by Choose For Me, kept until the Clues step.
  const [chosenSeed, setChosenSeed] = useState<{ entry: string; clue: string } | undefined>(undefined);

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
    // The held clue only belongs to the seed the AI picked.
    if (chosenSeed && normalizeSeed(next) !== chosenSeed.entry) setChosenSeed(undefined);
    // A new letter count picks the size for that length, replacing a manual choice.
    if (prevLength !== nextLength) setPickedSize(defaultGridSize(nextLength));
  }

  async function chooseSeed() {
    if (choosing || starting) return;
    setChoosing(true);
    setSeedError('');
    try {
      const length = CHOOSE_SEED_LENGTHS[Math.floor(Math.random() * CHOOSE_SEED_LENGTHS.length)];
      const candidates = await fetchSeedCandidates(length, undefined, { excludeSeedwordClues: true });
      const chosen = await chooseSeedword(candidates, undefined, GROK_MODEL);
      changeSeed(chosen.displayText);
      // changeSeed clears a clue held for a different seed; hold this one after it.
      setChosenSeed({ entry: normalizeSeed(chosen.displayText), clue: chosen.clue });
    } catch (err) {
      setSeedError(err instanceof Error && err.message ? err.message : String(err));
    } finally {
      setChoosing(false);
    }
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
    const submittedSeed = normalizeSeed(submitted);
    const seedClue = chosenSeed && chosenSeed.entry === submittedSeed ? chosenSeed.clue : undefined;
    if (seedClue) {
      // Same as the main app: keep the seed's AI clue in generated_clue (is_seedword = true).
      postJson('/magicPuzzle/generatedClues', {
        clues: [{ entry: submittedSeed, clue: seedClue, isSeedword: true }],
      }).catch(err => console.error('Failed to save the seed clue', err));
    }
    setPuzzle(prev => ({ id: (prev?.id ?? 0) + 1, seed: submittedSeed, size, seedClue }));
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
    setChosenSeed(undefined);
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
            onChoose={() => { void chooseSeed(); }}
            busy={starting}
            choosing={choosing}
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
            seedClue={puzzle.seedClue}
            hidden={step !== 2}
            onFinished={finishPuzzle}
          />
        )}
        {step === 3 && shared && <ShareStep puzzle={shared} />}
      </main>
    </div>
  );
}
