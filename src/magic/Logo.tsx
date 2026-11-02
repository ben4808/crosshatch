import React from 'react';

/** "Magic [wand revealing a crossword] Crossword" wordmark. */
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`mc-logo${compact ? ' mc-logo-compact' : ''}`} role="img" aria-label="Magic Crossword">
      <span className="mc-logo-word">Magic</span>
      <svg className="mc-logo-art" viewBox="0 0 120 120" aria-hidden="true">
        {/* crossword grid appearing */}
        <g className="mc-logo-grid">
          <rect x="52" y="44" width="60" height="60" rx="4" fill="#0f1a33" stroke="#7fd6d0" strokeWidth="2" />
          <g fill="#7fd6d0" opacity="0.9">
            <rect x="62" y="54" width="10" height="10" rx="1" />
            <rect x="72" y="54" width="10" height="10" rx="1" opacity="0.35" />
            <rect x="82" y="54" width="10" height="10" rx="1" />
            <rect x="92" y="54" width="10" height="10" rx="1" opacity="0.35" />
            <rect x="62" y="64" width="10" height="10" rx="1" opacity="0.35" />
            <rect x="82" y="64" width="10" height="10" rx="1" opacity="0.35" />
            <rect x="62" y="74" width="10" height="10" rx="1" />
            <rect x="72" y="74" width="10" height="10" rx="1" />
            <rect x="82" y="74" width="10" height="10" rx="1" />
            <rect x="92" y="74" width="10" height="10" rx="1" opacity="0.35" />
            <rect x="72" y="84" width="10" height="10" rx="1" opacity="0.35" />
            <rect x="92" y="84" width="10" height="10" rx="1" />
          </g>
        </g>
        {/* wand */}
        <line x1="10" y1="108" x2="46" y2="62" stroke="#e8c9a0" strokeWidth="6" strokeLinecap="round" />
        <line x1="40" y1="70" x2="46" y2="62" stroke="#fff6e5" strokeWidth="6" strokeLinecap="round" />
        {/* sparkles */}
        <g fill="#ffb38a">
          <path d="M46 28 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
          <path d="M22 44 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8z" opacity="0.85" />
          <path d="M72 18 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8z" opacity="0.7" />
        </g>
      </svg>
      <span className="mc-logo-word">Crossword</span>
    </div>
  );
}
