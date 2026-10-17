import { HEROES, CLASSES, ROLES, createMatch, skillReach } from '../../engine/index.ts';
import type { Skill } from '../../engine/index.ts';
import { SHORT, costLabel, roleOf, moveCells, cssVars } from '../data';
import { CostChip } from './Rune';
import { HeroDemo } from './HeroDemo';

export type DescMode = 'short' | 'detail';

export function MoveDiagram({ hero, size = 7 }: { hero: string; size?: number }) {
  return (
    <span className="diag" style={cssVars({ '--cell': `${size}px` })} aria-hidden="true">
      {moveCells(hero).map((cell, index) => (
        <i key={index} className={cell} />
      ))}
    </span>
  );
}

export function reachText(sk: Skill) {
  const n = `${sk.range} square${sk.range! > 1 ? 's' : ''}`;
  if (sk.reach?.cells) return `Reach: a fixed pattern facing forward, up to ${n} deep. Nothing blocks it.`;
  if (sk.reach?.ray)
    return `Reach: ${n} along ${sk.reach.dirs!.length === 4 && sk.reach.dirs!.every(([rowStep, colStep]) => rowStep && colStep) ? 'the diagonals' : 'straight lines'}, blocked by the first unit or terrain.`;
  return `Reach: ${n} in any direction.`;
}

/** Skill reach on a 7×7 grid: every square within range, in the skill's colour (same tint as on the board). */
export function RangeDiagram({ hero, size = 7 }: { hero: string; size?: number }) {
  const sk = HEROES[hero].skill;
  if (!sk.range) return null;
  // Same shape as on the board: computed by the engine on an empty field.
  const g = createMatch({ map: 'field', creeps: false });
  const me = {
    id: 'x',
    team: 'p1' as const,
    hero,
    kind: 'hero' as const,
    pos: { r: 3, c: 3 },
    alive: true,
    rooted: 0,
    warded: false,
    cd: 0,
  };
  g.units = { x: me };
  const reach = new Set(skillReach(g, me).map((pos) => `${pos.r},${pos.c}`));
  const cells = Array.from({ length: 49 }, (_, index) => {
    const r = Math.floor(index / 7),
      c = index % 7;
    return r === 3 && c === 3 ? 'me' : reach.has(`${r},${c}`) ? 'zone' : '';
  });
  return (
    <span className="diag zone-diag" data-zone={sk.key} style={cssVars({ '--cell': `${size}px` })} aria-hidden="true">
      {cells.map((cell, index) => (
        <i key={index} className={cell} />
      ))}
    </span>
  );
}

/** The commander's mark: a war banner on its pole. */
export function CommanderMark() {
  return (
    <svg className="cmd-ico" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M3.5 1.5v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.3 2.3h8.4l-2.2 2.8 2.2 2.8H4.3z" fill="currentColor" />
    </svg>
  );
}

/** A hero's role, and the commander tag on top for the heroes that can command. */
export function RoleTags({ id }: { id: string }) {
  const h = HEROES[id];
  return (
    <>
      <span className={`role role-${h.role || 'none'}`}>{roleOf(id)}</span>
      {h.commander && (
        <span
          className="role role-commander"
          title="Can be the team's commander: if the commander falls, the team loses"
        >
          <CommanderMark /> {ROLES.commander}
        </span>
      )}
    </>
  );
}

/** A hero's description, short (one glance) or detailed (full rules text). */
export function HeroInfo({ id, mode }: { id: string; mode: DescMode }) {
  const h = HEROES[id];
  const sk = h.skill;
  const s = SHORT[id];
  if (mode === 'short') {
    return (
      <div className="hinfo short">
        <div className="hinfo-head">
          <b>{h.name}</b>
          <RoleTags id={id} />
        </div>
        {h.commander && (
          <p className="cmd-note">
            <CommanderMark /> Can lead your team as its commander. If your commander falls, you lose.
          </p>
        )}
        <div className="hinfo-move">
          <MoveDiagram hero={id} size={8} />
          <span>
            <span className="lbl">Move</span>
            {s.move}
          </span>
        </div>
        <div className="hinfo-move">
          <RangeDiagram hero={id} size={8} />
          <p>
            <span className="lbl">{sk.name}</span>
            {s.skill} <CostChip sk={sk} />
            {sk.range ? <span className="range-note"> {reachText(sk)}</span> : null}
          </p>
        </div>
        <HeroDemo hero={id} />
      </div>
    );
  }
  return (
    <div className="hinfo detail">
      <div className="hinfo-head">
        <b>{h.name}</b>
        <span className="sub">{h.title}</span>
        <RoleTags id={id} />
        <span className="sub">{CLASSES[h.cls].name}</span>
      </div>
      {h.commander && (
        <p className="cmd-note">
          <CommanderMark /> Can lead your team as its commander. If your commander falls, you lose.
        </p>
      )}
      <div className="hinfo-move">
        <MoveDiagram hero={id} size={9} />
        <span>
          {h.moveText}
          {h.move.some((rule) => rule.kind === 'backstab') ? ` Red: ${sk.name} jumps over a unit or terrain.` : ''}
        </span>
      </div>
      <div className="hinfo-skill">
        {sk.range ? <RangeDiagram hero={id} size={9} /> : null}
        <b>{sk.name}</b>
        <span className="meta">
          {costLabel(sk)}
          {sk.range ? ` · range ${sk.range}` : ''}
          {sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}
        </span>
        <p>{sk.text}</p>
      </div>
      <HeroDemo hero={id} />
    </div>
  );
}
