// Display data and helpers shared by every screen. Rules live in src/engine/.
import type { CSSProperties } from 'react';
import { HEROES, ROLES, MAPS, createMatch, moveOptions } from '../engine/index.ts';

export type Team = 'p1' | 'p2';
export type HeroId = keyof typeof HEROES;
export const HERO_IDS = Object.keys(HEROES) as HeroId[];
export const MAP_IDS = Object.keys(MAPS) as (keyof typeof MAPS)[];

export const ICON = (heroId: string) => `assets/icons/${heroId}.png`;
export const ART = (heroId: string) => `assets/art/${heroId}.jpg`;
export const MAP_ART: Record<string, string | null> = {
  desert: 'hasim',
  savanna: 'genga',
  jungle: 'plantae',
  winter: 'hexor',
  field: null,
};
export const LOCKED = [
  { id: 'locked-skull', title: 'Skull mask' },
  { id: 'locked-flame', title: 'Flame-eyed skull' },
  { id: 'locked-turban', title: 'Turbaned elder' },
];
export const other = (team: Team): Team => (team === 'p1' ? 'p2' : 'p1');

/** Inline style with CSS custom properties: cssVars({ '--cell': '8px' }, { opacity: 1 }). */
export const cssVars = (vars: Record<`--${string}`, string>, style: CSSProperties = {}) =>
  ({ ...style, ...vars }) as CSSProperties;

export const tk = (count: number) => `${count} rune${count === 1 ? '' : 's'}`;

type Skill = {
  type: string;
  cost: number;
  reactionCost?: number;
  range?: number;
  cooldown?: number;
  name: string;
  text: string;
  key: string;
};

/** Short cost label for a skill, e.g. "Active · 2 runes". */
export function costLabel(sk: Skill) {
  if (sk.type === 'active') return `Active · ${tk(sk.cost)}${sk.reactionCost ? ` · interrupt ${sk.reactionCost}` : ''}`;
  if (sk.type === 'move') return sk.cost ? `Passive · ${tk(sk.cost)} per jump` : 'Signature move · free';
  return `Follow-up · ${tk(sk.cost)}`;
}
/** Just the price, for chips: "free", "2", "3 / 3". */
export function costChip(sk: Skill) {
  if (!sk.cost && sk.type === 'move') return 'free';
  return sk.reactionCost && sk.reactionCost !== sk.cost ? `${sk.cost}/${sk.reactionCost}` : String(sk.cost);
}

export const roleOf = (id: string) => {
  const h = HEROES[id];
  return h?.role ? (ROLES[h.role] as string) : 'Shaman';
};

/** One-glance summaries for the short description mode (each hero's `short`). */
export const SHORT: Record<string, { move: string; skill: string }> = Object.fromEntries(
  HERO_IDS.map((id) => [id, HEROES[id].short]),
);

/** 7×7 movement preview cells computed from the engine: 'me' | 'go' | 'jump' | ''. */
export function moveCells(hero: string): string[] {
  const s = createMatch({ map: 'field' });
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
  s.units = { x: me };
  const go = new Set(moveOptions(s, me).map((option) => `${option.to.r},${option.to.c}`));
  const jump = new Set<string>();
  if (HEROES[hero].move.some((rule) => rule.kind === 'backstab'))
    for (const dr of [-1, 0, 1]) for (const dc of [-1, 0, 1]) if (dr || dc) jump.add(`${3 + 2 * dr},${3 + 2 * dc}`);
  const out: string[] = [];
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      const k = `${r},${c}`;
      out.push(r === 3 && c === 3 ? 'me' : jump.has(k) ? 'jump' : go.has(k) ? 'go' : '');
    }
  return out;
}

/** Small persisted UI preferences (best effort; storage can be unavailable). */
export function pref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`hg-${key}`);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function setPref(key: string, value: unknown) {
  try {
    localStorage.setItem(`hg-${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Deterministic shuffle pick for a random team. */
export function randomTeam(seed: number, size = 4): HeroId[] {
  const pool = [...HERO_IDS];
  const out: HeroId[] = [];
  let h = (seed * 2654435761 + 7) >>> 0;
  while (out.length < size && pool.length) {
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}
