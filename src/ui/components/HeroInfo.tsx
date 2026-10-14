import { HEROES, CLASSES } from '../../arena.js';
import { SHORT, costLabel, costChip, roleOf, moveCells } from '../data';
import { HeroDemo } from './HeroDemo';

export type DescMode = 'short' | 'detail';

export function MoveDiagram({ hero, size = 7 }: { hero: string; size?: number }) {
  return (
    <span className="diag" style={{ ['--cell' as any]: `${size}px` }} aria-hidden="true">
      {moveCells(hero).map((c, i) => <i key={i} className={c} />)}
    </span>
  );
}

/** Skill reach on a 7×7 grid: every square within range, in the skill's colour (same tint as on the board). */
export function RangeDiagram({ hero, size = 7 }: { hero: string; size?: number }) {
  const sk = (HEROES as any)[hero].skill;
  if (!sk.range) return null;
  const cells = Array.from({ length: 49 }, (_, i) => {
    const r = Math.floor(i / 7), c = i % 7, d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
    return d === 0 ? 'me' : d <= sk.range ? 'zone' : '';
  });
  return (
    <span className="diag zone-diag" data-zone={sk.key} style={{ ['--cell' as any]: `${size}px` }} aria-hidden="true">
      {cells.map((c, i) => <i key={i} className={c} />)}
    </span>
  );
}

/** A hero's description, short (one glance) or detailed (full rules text). */
export function HeroInfo({ id, mode }: { id: string; mode: DescMode }) {
  const h = (HEROES as any)[id];
  const sk = h.skill;
  const s = SHORT[id];
  if (mode === 'short') {
    return (
      <div className="hinfo short">
        <div className="hinfo-head"><b>{h.name}</b><span className={`role role-${h.role || 'none'}`}>{roleOf(id)}</span></div>
        <div className="hinfo-move"><MoveDiagram hero={id} size={8} /><span><span className="lbl">Move</span>{s.move}</span></div>
        <div className="hinfo-move"><RangeDiagram hero={id} size={8} /><p><span className="lbl">{sk.name}</span>{s.skill} <span className="cost">{costChip(sk)}</span>{sk.range ? <span className="range-note"> Reach: {sk.range} square{sk.range > 1 ? 's' : ''}, any direction.</span> : null}</p></div>
        <HeroDemo hero={id} />
      </div>
    );
  }
  return (
    <div className="hinfo detail">
      <div className="hinfo-head"><b>{h.name}</b><span className="sub">{h.title}</span><span className={`role role-${h.role || 'none'}`}>{roleOf(id)}</span><span className="sub">{(CLASSES as any)[h.cls].name}</span></div>
      <div className="hinfo-move"><MoveDiagram hero={id} size={9} /><span>{h.moveText}{id === 'hasim' ? ' Red: Backstab jumps over a unit or terrain.' : ''}</span></div>
      <div className="hinfo-skill">
        {sk.range ? <RangeDiagram hero={id} size={9} /> : null}
        <b>{sk.name}</b>
        <span className="meta">{costLabel(sk)}{sk.range ? ` · range ${sk.range}` : ''}{sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}</span>
        <p>{sk.text}</p>
      </div>
      <HeroDemo hero={id} />
    </div>
  );
}
