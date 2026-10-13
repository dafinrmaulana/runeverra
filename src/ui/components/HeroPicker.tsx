import { useRef, useState } from 'react';
import { HEROES, TEAM_NAMES } from '../../arena.js';
import { HERO_IDS, ICON, costChip, roleOf, randomTeam, type HeroId, type Team } from '../data';
import { HeroInfo, type DescMode } from './HeroInfo';

const SIZE = 4;

type Props = {
  team: Team;
  title: string;
  picks: HeroId[];
  onChange: (p: HeroId[]) => void;
  mode: DescMode;
  onMode: (m: DescMode) => void;
  /** Rotated 180° for the player across the table (offline face to face). */
  mirrored?: boolean;
  readOnly?: boolean;
};

/** Pick a team of four: a two-column hero list, numbered slots, tooltip/modal descriptions. */
export function HeroPicker({ team, title, picks, onChange, mode, onMode, mirrored, readOnly }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; top: number } | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const toggle = (id: HeroId) => {
    if (readOnly) return;
    const i = picks.indexOf(id);
    if (i >= 0) { onChange(picks.filter((h) => h !== id)); setNote(''); return; }
    if (picks.length >= SIZE) { setNote('Team is full. Tap a hero in your team to remove it first.'); return; }
    onChange([...picks, id]); setNote('');
  };
  const showTip = (id: string, el: HTMLElement) => {
    const top = el.offsetTop + el.offsetHeight + 6;
    setHover({ id, top });
  };

  return (
    <div className={`picker ${team}${mirrored ? ' mirrored' : ''}`} ref={box}>
      <div className="picker-head">
        <span className={`swatch ${team}`} />
        <h3>{title}</h3>
        <span className="side-name">{TEAM_NAMES[team]}</span>
        <span className="count">{picks.length}/{SIZE}</span>
        <span className="grow" />
        <div className="seg small" role="group" aria-label="Description length">
          <button type="button" aria-pressed={mode === 'short'} onClick={() => onMode('short')}>Short</button>
          <button type="button" aria-pressed={mode === 'detail'} onClick={() => onMode('detail')}>Detail</button>
        </div>
      </div>

      <div className="slots-row">
        {Array.from({ length: SIZE }, (_, i) => {
          const id = picks[i];
          return id ? (
            <button key={i} type="button" className="slot filled" onClick={() => toggle(id)} disabled={readOnly} title={`Remove ${(HEROES as any)[id].name}`}>
              <img src={ICON(id)} alt="" /><span className="n">{i + 1}</span><span className="nm">{(HEROES as any)[id].name}</span>
            </button>
          ) : (
            <span key={i} className="slot empty"><span className="n">{i + 1}</span><span className="nm">Empty</span></span>
          );
        })}
        {!readOnly && (
          <div className="slot-actions">
            <button type="button" className="btn ghost" onClick={() => { onChange(randomTeam(Date.now() % 9973)); setNote(''); }}>Random</button>
            <button type="button" className="btn ghost" onClick={() => { onChange([]); setNote(''); }} disabled={!picks.length}>Clear</button>
          </div>
        )}
      </div>
      {note && <p className="picker-note">{note}</p>}

      <div className="hero-grid" onMouseLeave={() => setHover(null)}>
        {HERO_IDS.map((id) => {
          const h = (HEROES as any)[id];
          const idx = picks.indexOf(id);
          const full = idx < 0 && picks.length >= SIZE;
          return (
            <div key={id} className={`htile ${h.cls}${idx >= 0 ? ' picked' : ''}${full ? ' dim' : ''}`}
              onMouseEnter={(e) => showTip(id, e.currentTarget)}>
              <button type="button" className="htile-main" onClick={() => toggle(id)} aria-pressed={idx >= 0} disabled={readOnly}
                onFocus={(e) => showTip(id, e.currentTarget.parentElement!)} onBlur={() => setHover(null)}>
                <span className="portrait"><img src={ICON(id)} alt="" />{idx >= 0 && <span className="order">{idx + 1}</span>}</span>
                <span className="htile-text">
                  <b>{h.name}</b>
                  <span className={`role role-${h.role || 'none'}`}>{roleOf(id)}</span>
                  <span className="sk">{h.skill.name} <span className="cost" title="Token cost">{costChip(h.skill)}</span></span>
                </span>
              </button>
              <button type="button" className="info-btn" aria-label={`About ${h.name}`} onClick={() => { setHover(null); setModal(id); }}>i</button>
            </div>
          );
        })}
      </div>

      {hover && !modal && (
        <div className="tip" style={{ top: hover.top }} role="tooltip">
          <HeroInfo id={hover.id} mode={mode} />
        </div>
      )}

      {modal && (
        <div className="picker-modal" role="dialog" aria-label={`${(HEROES as any)[modal].name} details`} onClick={() => setModal(null)}>
          <div className="picker-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="seg small" role="group" aria-label="Description length">
              <button type="button" aria-pressed={mode === 'short'} onClick={() => onMode('short')}>Short</button>
              <button type="button" aria-pressed={mode === 'detail'} onClick={() => onMode('detail')}>Detail</button>
            </div>
            <HeroInfo id={modal} mode={mode} />
            <div className="row">
              {!readOnly && (
                <button type="button" className="btn primary" onClick={() => { toggle(modal as HeroId); setModal(null); }}>
                  {picks.includes(modal as HeroId) ? 'Remove from team' : picks.length >= SIZE ? 'Team is full' : 'Add to team'}
                </button>
              )}
              <button type="button" className="btn" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
