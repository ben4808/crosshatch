import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AiCluesByEntry,
    autoSelectedClues,
    communityCluesToSubmit,
    CommunityClue,
    CommunityCluesByEntry,
    deleteGeneratedClue,
    entriesNeedingAiClues,
    finishMagicPuzzle,
    generateMissingAiClues,
    loadExistingClues,
    TypedClue,
} from './clues';
import { MagicFill, MagicSlot, slotsFromCells } from './magicFill';
import { SharedPuzzle } from './ShareStep';

interface CluesStepProps {
  fill: MagicFill;
  seed: string;
  hidden: boolean;
  onFinished: (puzzle: SharedPuzzle) => void;
}

interface ClueModalProps {
  slot: MagicSlot;
  draft: string;
  aiClues: TypedClue[];
  communityClues: CommunityClue[];
  loading: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onPick: (clue: string) => void;
  onDelete: (clue: string) => Promise<void>;
  onClose: () => void;
}

function byTimesUsedDesc(a: { timesUsed?: number }, b: { timesUsed?: number }): number {
  return (b.timesUsed ?? 0) - (a.timesUsed ?? 0);
}

function TrashIcon() {
  return (
    <svg className="mc-clue-delete-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4V4a1 1 0 0 1 1-1zm0 2h6V4H9v1zM7 7l1 13h8l1-13H7zm2 2h2v9H9V9zm4 0h2v9h-2V9z"
      />
    </svg>
  );
}

function uniqueTypedClues(clues: TypedClue[]): TypedClue[] {
  const seen = new Set<string>();
  return [...clues].sort(byTimesUsedDesc).filter(clue => {
    if (!clue.clue || seen.has(clue.clue)) return false;
    seen.add(clue.clue);
    return true;
  });
}

function ClueModal({
  slot,
  draft,
  aiClues,
  communityClues,
  loading,
  onDraftChange,
  onSubmit,
  onPick,
  onDelete,
  onClose,
}: ClueModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<string | undefined>(undefined);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const aiList = uniqueTypedClues(aiClues);
  const communityList = [...communityClues]
    .filter(clue => clue.clue)
    .sort(byTimesUsedDesc)
    .filter((clue, index, list) => list.findIndex(item => item.clue === clue.clue) === index);

  const removeClue = async (clue: string) => {
    if (deleting) return;
    setDeleting(clue);
    setDeleteError('');
    try {
      await onDelete(clue);
    } catch (err) {
      setDeleteError(err instanceof Error && err.message ? err.message : String(err));
    } finally {
      setDeleting(undefined);
    }
  };

  return (
    <div className="mc-modal-backdrop" onClick={onClose}>
      <div
        className="mc-modal mc-clue-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mc-clue-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mc-modal-title" id="mc-clue-modal-title">
          {slot.number} {slot.direction === 'across' ? 'Across' : 'Down'} · {slot.entry}
        </h2>
        <form
          className="mc-clue-edit-row"
          onSubmit={e => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <input
            ref={inputRef}
            className="mc-input"
            type="text"
            value={draft}
            aria-label="Clue text"
            onChange={e => onDraftChange(e.target.value)}
          />
          <button type="submit" className="mc-primary mc-clue-ok">OK</button>
        </form>
        <div className="mc-clue-lists">
          <section className="mc-clue-list">
            <h3 className="mc-clue-list-title">AI generated clues</h3>
            {loading && <span className="mc-spinner" role="status" aria-label="Loading AI clues" />}
            {deleteError && <p className="mc-notice" role="status">{deleteError}</p>}
            {aiList.length > 0 && (
              <ul>
                {aiList.map(clue => (
                  <li key={clue.clue}>
                    <div className="mc-clue-suggestion-row">
                      <button type="button" className="mc-clue-suggestion" onClick={() => onPick(clue.clue)}>
                        {clue.clue}
                      </button>
                      {(clue.timesUsed ?? 0) <= 1 && (
                        <button
                          type="button"
                          className="mc-clue-delete"
                          aria-label="Delete clue"
                          disabled={deleting === clue.clue}
                          onClick={() => { void removeClue(clue.clue); }}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mc-clue-list">
            <h3 className="mc-clue-list-title">Community clues</h3>
            {communityList.length > 0 && (
              <ul>
                {communityList.map(clue => (
                  <li key={clue.clue}>
                    <button type="button" className="mc-clue-suggestion" onClick={() => onPick(clue.clue)}>
                      {clue.clue}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ClueRow({
  slot,
  clue,
  loading,
  onClick,
}: {
  slot: MagicSlot;
  clue: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mc-clue" onClick={onClick} aria-busy={loading}>
      {loading && <span className="mc-spinner" role="status" aria-label="Loading AI clues" />}
      <span className="mc-clue-number">{slot.number}</span>
      <span className="mc-clue-entry">{slot.entry}</span>
      <span className="mc-clue-text">{clue || '(blank clue)'}</span>
    </button>
  );
}

export default function CluesStep({ fill, seed, hidden, onFinished }: CluesStepProps) {
  const slots = useMemo(() => slotsFromCells(fill.cells), [fill]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [aiClues, setAiClues] = useState<AiCluesByEntry>({});
  const [communityClues, setCommunityClues] = useState<CommunityCluesByEntry>({});
  const [loadingEntries, setLoadingEntries] = useState<Record<string, boolean>>({});
  const [modalKey, setModalKey] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [contribute, setContribute] = useState(true);
  const [includeSeed, setIncludeSeed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState('');

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const aiRef = useRef(aiClues);
  aiRef.current = aiClues;
  const deletedAiRef = useRef(new Set<string>());

  useEffect(() => {
    if (hidden) setModalKey(undefined);
  }, [hidden]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        const loaded = await loadExistingClues(slots, 'en', signal);
        if (signal.aborted) return;
        setAiClues(loaded.ai);
        setCommunityClues(loaded.community);
        setSelected(autoSelectedClues(slots, loaded.ai, selectedRef.current));

        const unique = Array.from(new Set(slots.map(slot => slot.entry)));
        const toGenerate = entriesNeedingAiClues(loaded.ai, unique);
        if (toGenerate.length === 0) return;

        const loading: Record<string, boolean> = {};
        toGenerate.forEach(entry => { loading[entry] = true; });
        setLoadingEntries(loading);

        const existing = { ...loaded.ai };
        await generateMissingAiClues(toGenerate, loaded.statuses, existing, {
          signal,
          onBatchComplete: (answers, clues) => {
            if (signal.aborted) return;
            const withoutDeleted: AiCluesByEntry = {};
            answers.forEach(answer => {
              const incoming = clues[answer];
              if (!incoming) return;
              withoutDeleted[answer] = incoming.filter(
                item => !deletedAiRef.current.has(`${answer}\n${item.clue}`),
              );
            });
            setAiClues(prev => {
              const next = { ...prev };
              answers.forEach(answer => {
                if (withoutDeleted[answer]) next[answer] = withoutDeleted[answer];
              });
              return next;
            });
            setSelected(prev => autoSelectedClues(slots, { ...aiRef.current, ...withoutDeleted }, prev));
            setLoadingEntries(prev => {
              const next = { ...prev };
              answers.forEach(answer => { delete next[answer]; });
              return next;
            });
          },
        });
      } catch (err) {
        if (signal.aborted) return;
        console.error('Failed to load clues', err);
        setNotice(err instanceof Error && err.message ? err.message : String(err));
        setLoadingEntries({});
      }
    })();

    return () => controller.abort();
  }, [slots]);

  const modalSlot = slots.find(slot => slot.key === modalKey);

  const openModal = useCallback((slot: MagicSlot) => {
    setDraft(selectedRef.current[slot.key] || '');
    setModalKey(slot.key);
  }, []);

  const closeModal = useCallback(() => setModalKey(undefined), []);

  const applyDraft = useCallback(() => {
    if (!modalKey) return;
    setSelected(prev => ({ ...prev, [modalKey]: draft.trim() }));
    setModalKey(undefined);
  }, [draft, modalKey]);

  const pickSuggestion = useCallback((clue: string) => {
    if (!modalKey) return;
    setSelected(prev => ({ ...prev, [modalKey]: clue }));
    setModalKey(undefined);
  }, [modalKey]);

  const deleteAiClue = useCallback(async (clue: string) => {
    if (!modalSlot) return;
    const entry = modalSlot.entry;
    await deleteGeneratedClue(entry, clue);
    deletedAiRef.current.add(`${entry}\n${clue}`);
    setAiClues(prev => ({
      ...prev,
      [entry]: (prev[entry] || []).filter(item => item.clue !== clue),
    }));
  }, [modalSlot]);

  const allFilled = slots.every(slot => (selected[slot.key] || '').trim() !== '');

  const finish = useCallback(async () => {
    if (!allFilled || saving || finished) return;
    setSaving(true);
    setNotice('');
    try {
      const saved = await finishMagicPuzzle({
        fill,
        seed,
        slots,
        selected,
        communityClues: communityCluesToSubmit(
          slots, selected, seed, aiClues, communityClues, contribute, includeSeed,
        ),
      });
      setFinished(true);
      onFinished({
        id: saved.magicPuzzleId,
        cells: fill.cells,
        clues: selected,
      });
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [allFilled, saving, finished, fill, seed, slots, selected, aiClues, communityClues, contribute, includeSeed, onFinished]);

  const across = slots.filter(slot => slot.direction === 'across');
  const down = slots.filter(slot => slot.direction === 'down');

  return (
    <div className="mc-cluesstep" hidden={hidden}>
      <p className="mc-clues-instructions">Write or select clues</p>
      <div className="mc-clues-columns">
        <div className="mc-clues-container">
          <div className="mc-clues-header">ACROSS</div>
          <div className="mc-clues-clues">
            {across.map(slot => (
              <ClueRow
                key={slot.key}
                slot={slot}
                clue={selected[slot.key] || ''}
                loading={!!loadingEntries[slot.entry]}
                onClick={() => openModal(slot)}
              />
            ))}
          </div>
        </div>
        <div className="mc-clues-container">
          <div className="mc-clues-header">DOWN</div>
          <div className="mc-clues-clues">
            {down.map(slot => (
              <ClueRow
                key={slot.key}
                slot={slot}
                clue={selected[slot.key] || ''}
                loading={!!loadingEntries[slot.entry]}
                onClick={() => openModal(slot)}
              />
            ))}
          </div>
        </div>
      </div>

      {notice && <p className="mc-notice" role="status">{notice}</p>}

      <div className="mc-clues-footer">
        <div className="mc-clues-checks">
          <label className="mc-check">
            <input
              type="checkbox"
              checked={contribute}
              onChange={e => {
                const checked = e.target.checked;
                setContribute(checked);
                if (!checked) setIncludeSeed(false);
              }}
            />
            Contribute my clues to community clues
          </label>
          <label className={`mc-check mc-check-nested${contribute ? '' : ' mc-check-disabled'}`}>
            <input
              type="checkbox"
              checked={includeSeed}
              disabled={!contribute}
              onChange={e => setIncludeSeed(e.target.checked)}
            />
            Including my seed answer clue
          </label>
        </div>
        <button
          type="button"
          className="mc-primary mc-finish"
          disabled={!allFilled || saving || finished}
          onClick={() => { void finish(); }}
        >
          {finished ? 'Saved' : saving ? 'Saving...' : 'Finish Puzzle'}
        </button>
      </div>

      {!hidden && modalSlot && (
        <ClueModal
          slot={modalSlot}
          draft={draft}
          aiClues={aiClues[modalSlot.entry] || []}
          communityClues={communityClues[modalSlot.entry] || []}
          loading={!!loadingEntries[modalSlot.entry]}
          onDraftChange={setDraft}
          onSubmit={applyDraft}
          onPick={pickSuggestion}
          onDelete={deleteAiClue}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
