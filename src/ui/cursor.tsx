// Themed mouse cursors (a dagger or a staff), chosen in Settings and kept per browser.
import { useState } from 'react';
import { pref, setPref } from './data';

export type CursorKind = 'dagger' | 'staff' | 'system';

const INK = '#221c18';
const DAGGER = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<g stroke-linecap="round">
<path d="M2 2 L18.5 12 L12 18.5 Z" fill="#e8edef" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M4 4 L14.5 14.5" stroke="#9fb0b8" stroke-width="1.1"/>
<path d="M10 22 L22 10" stroke="${INK}" stroke-width="6"/><path d="M10 22 L22 10" stroke="#e3b878" stroke-width="3.4"/>
<path d="M16.5 16.5 L25 25" stroke="${INK}" stroke-width="6"/><path d="M16.5 16.5 L25 25" stroke="#9a5233" stroke-width="3.4"/>
<circle cx="26.6" cy="26.6" r="3" fill="#e3b878" stroke="${INK}" stroke-width="1.6"/>
</g></svg>`;
const STAFF = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<g stroke-linecap="round">
<path d="M8 8 L29 29" stroke="${INK}" stroke-width="5.4"/><path d="M8 8 L29 29" stroke="#8b5a32" stroke-width="3"/>
<path d="M17 17 L20 20" stroke="#e3b878" stroke-width="3"/>
<path d="M11.5 4.5 Q13 10 7.5 12.5 M4.5 11.5 Q10 13 12.5 7.5" fill="none" stroke="${INK}" stroke-width="3.6"/>
<path d="M11.5 4.5 Q13 10 7.5 12.5 M4.5 11.5 Q10 13 12.5 7.5" fill="none" stroke="#e3b878" stroke-width="1.8"/>
<circle cx="6" cy="6" r="4.6" fill="#5a9e80" stroke="${INK}" stroke-width="1.6"/>
<circle cx="4.6" cy="4.6" r="1.3" fill="#d8f0e4"/>
</g></svg>`;

export const CURSOR_SVG: Record<Exclude<CursorKind, 'system'>, string> = { dagger: DAGGER, staff: STAFF };
const HOT: Record<Exclude<CursorKind, 'system'>, string> = { dagger: '2 2', staff: '3 3' };

export function applyCursor(kind: CursorKind) {
  let tag = document.getElementById('rv-cursor') as HTMLStyleElement | null;
  if (!tag) { tag = document.createElement('style'); tag.id = 'rv-cursor'; document.head.appendChild(tag); }
  if (kind === 'system') { tag.textContent = ''; return; }
  const url = `url("data:image/svg+xml,${encodeURIComponent(CURSOR_SVG[kind])}") ${HOT[kind]}`;
  tag.textContent = `body, body *:not(input):not(textarea) { cursor: ${url}, auto !important; }
    button:disabled, [aria-disabled="true"] { cursor: ${url}, not-allowed !important; }`;
}

export const cursorPref = () => pref<CursorKind>('cursor', 'dagger');

export function CursorPicker() {
  const [kind, setKind] = useState<CursorKind>(cursorPref());
  const pick = (k: CursorKind) => { setKind(k); setPref('cursor', k); applyCursor(k); };
  const opts: { k: CursorKind; label: string }[] = [{ k: 'dagger', label: 'Dagger' }, { k: 'staff', label: 'Staff' }, { k: 'system', label: 'System' }];
  return (
    <div className="cursor-opts" role="radiogroup" aria-label="Mouse cursor">
      {opts.map(({ k, label }) => (
        <button key={k} type="button" role="radio" aria-checked={kind === k} className="cursor-opt" onClick={() => pick(k)}>
          {k === 'system'
            ? <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 4 L8 26 L13.5 20.5 L17.5 29 L21 27.5 L17 19 L24.5 19 Z" fill="#f3e6cf" stroke="#221c18" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            : <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: CURSOR_SVG[k].replace('width="32" height="32"', 'width="40" height="40"') }} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
