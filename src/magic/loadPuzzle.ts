import { cellsFromFillKey, Cells, MagicSlot, slotsFromCells } from './magicFill';
import { CHAL_API } from '../lib/chalApi';

export interface LoadedPuzzle {
  id: string;
  solution: Cells;
  slots: MagicSlot[];
  clues: Record<string, string>;
}

interface PuzzleResponse {
  id?: string;
  grid?: string;
  clues?: { key?: string; clue?: string; order?: number }[];
  error?: string;
  message?: string;
}

export async function loadMagicPuzzle(id: string): Promise<LoadedPuzzle> {
  const res = await fetch(`${CHAL_API}/magicPuzzle/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({})) as PuzzleResponse;
  if (!res.ok) {
    throw new Error(data.error || data.message || `Couldn't load puzzle (${res.status})`);
  }
  const solution = cellsFromFillKey(String(data.grid || ''));
  const slots = slotsFromCells(solution);
  const list = Array.isArray(data.clues) ? data.clues : [];
  const clues: Record<string, string> = {};
  if (list.some(item => item?.key)) {
    list.forEach(item => {
      if (item?.key) clues[String(item.key)] = String(item.clue || '');
    });
  } else {
    const ordered = [...list].sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));
    slots.forEach((slot, index) => {
      clues[slot.key] = String(ordered[index]?.clue || '');
    });
  }
  return { id: String(data.id || id), solution, slots, clues };
}
