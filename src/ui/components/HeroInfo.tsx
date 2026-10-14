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
        <p><span className="lbl">{sk.name}</span>{s.skill} <span className="cost">{costChip(sk)}</span></p>
        <HeroDemo hero={id} />
      </div>
    );
  }
  return (
    <div className="hinfo detail">
      <div className="hinfo-head"><b>{h.name}</b><span className="sub">{h.title}</span><span className={`role role-${h.role || 'none'}`}>{roleOf(id)}</span><span className="sub">{(CLASSES as any)[h.cls].name}</span></div>
      <div className="hinfo-move"><MoveDiagram hero={id} size={9} /><span>{h.moveText}{id === 'hasim' ? ' Red: Backstab jumps over a unit or terrain.' : ''}</span></div>
      <div className="hinfo-skill">
        <b>{sk.name}</b>
        <span className="meta">{costLabel(sk)}{sk.range ? ` · range ${sk.range}` : ''}{sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}</span>
        <p>{sk.text}</p>
      </div>
      <HeroDemo hero={id} />
    </div>
  );
}
