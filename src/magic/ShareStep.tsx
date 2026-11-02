import React, { useState } from 'react';
import { Cells } from './magicFill';
import { generateMagicPuzFile } from './puzFile';

export interface SharedPuzzle {
  id: string;
  cells: Cells;
  clues: Record<string, string>;
}

interface ShareStepProps {
  puzzle: SharedPuzzle;
}

/** Id from `?puzzle=<id>`, if the page was opened on a saved puzzle. */
export function puzzleIdFromLocation(href: string = window.location.href): string | undefined {
  const id = new URL(href).searchParams.get('puzzle')?.trim();
  return id || undefined;
}

/** App URL with the saved magic_puzzle id, e.g. https://host/path?puzzle=<id>. */
export function puzzleShareUrl(id: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('puzzle', id);
  return url.toString();
}

function CopyIcon() {
  return (
    <svg className="mc-copy-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function ShareStep({ puzzle }: ShareStepProps) {
  const link = puzzleShareUrl(puzzle.id);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function downloadPuz() {
    const blob = generateMagicPuzFile({
      cells: puzzle.cells,
      clues: puzzle.clues,
      title: 'Magic Crossword',
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `magic-${puzzle.id}.puz`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <div className="mc-share">
      <h1 className="mc-share-heading">Can others solve it?</h1>
      <h2 className="mc-share-subheading">Share This Link</h2>
      <div className="mc-share-link-row">
        <a className="mc-share-link" href={link}>{link}</a>
        <button
          type="button"
          className="mc-copy"
          aria-label="Copy link"
          onClick={() => { void copyLink(); }}
        >
          <CopyIcon />
        </button>
      </div>
      {copied && <p className="mc-share-copied" role="status">Copied</p>}

      <div className="mc-share-actions">
        <button type="button" className="mc-secondary mc-download" onClick={downloadPuz}>
          Download .puz file
        </button>
        <button type="button" className="mc-primary" onClick={() => { void copyLink(); }}>
          Copy Link
        </button>
      </div>

      <p className="mc-share-note">
        You can publish your .puz file for the community to solve at{' '}
        <a href="https://crosshare.org" target="_blank" rel="noreferrer">Crosshare</a>.
      </p>
      <p className="mc-share-note">
        You can also upload your .puz file to solve collaboratively with friends at{' '}
        <a href="https://sqares.io" target="_blank" rel="noreferrer">sqares.io</a>.
      </p>
    </div>
  );
}
