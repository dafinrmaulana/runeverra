// Display data and helpers shared by every screen. Rules live in src/arena.js.
import { HEROES, ROLES, MAPS, createMatch, moveOptions } from '../arena.js';

export type Team = 'p1' | 'p2';
export type HeroId = keyof typeof HEROES;
export const HERO_IDS = Object.keys(HEROES) as HeroId[];
export const MAP_IDS = Object.keys(MAPS) as (keyof typeof MAPS)[];

export const ICON = (h: string) => `assets/icons/${h}.png`;
export const ART = (h: string) => `assets/art/${h}.jpg`;
export const MAP_ART: Record<string, string | null> = { desert: 'hasim', savanna: 'genga', jungle: 'plantae', winter: 'hexor', field: null };
export const LOCKED = [
  { id: 'locked-skull', title: 'Skull mask' },
  { id: 'locked-flame', title: 'Flame-eyed skull' },
  { id: 'locked-turban', title: 'Turbaned elder' },
];
export const other = (t: Team): Team => (t === 'p1' ? 'p2' : 'p1');

export const tk = (n: number) => `${n} token${n === 1 ? '' : 's'}`;

type Skill = { type: string; cost: number; reactionCost?: number; range?: number; cooldown?: number; name: string; text: string; key: string };

/** Short cost label for a skill, e.g. "Active · 2 tokens". */
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
  const h = (HEROES as any)[id];
  return h?.role ? (ROLES as any)[h.role] as string : 'Shaman';
};

/** One-glance summaries for the short description mode. */
export const SHORT: Record<string, { move: string; skill: string }> = {
  hasim: { move: 'Steps 1 square any way.', skill: 'Free jump over the unit next to him: kills what he jumps and what he lands on.' },
  genga: { move: 'Steps 1 straight.', skill: 'His beast steps 1 any way, free, right after him. 3 tokens: summon it back once it falls.' },
  magumba: { move: 'Steps 1 diagonally.', skill: '2 tokens: himself or an ally on his diagonals (up to 3) can\'t be touched until your next turn.' },
  plantae: { move: 'Steps 1 straight.', skill: '3 tokens: root an enemy on her straight lines (up to 3), or cancel an enemy action there on their turn.' },
  hexor: { move: 'Jumps in an L, like a knight.', skill: 'After a kill, 2 tokens: slam everything around him 1 square back; enemies hitting terrain die.' },
  aqna: { move: 'Moves up to 2 straight.', skill: 'A kill stores an ice charge (never stacks). Spend it anytime, 1 token: raise a block within 3 that nobody can pass.' },
};

/** 7×7 movement preview cells computed from the engine: 'me' | 'go' | 'jump' | ''. */
export function moveCells(hero: string): string[] {
  const s = createMatch({ map: 'field' });
  const me = { id: 'x', team: 'p1', hero, kind: 'hero', pos: { r: 3, c: 3 }, alive: true, rooted: 0, warded: false, cd: 0 };
  s.units = { x: me } as any;
  const go = new Set(moveOptions(s, me).map((o: any) => `${o.to.r},${o.to.c}`));
  const jump = new Set<string>();
  if (hero === 'hasim') for (const dr of [-1, 0, 1]) for (const dc of [-1, 0, 1]) if (dr || dc) jump.add(`${3 + 2 * dr},${3 + 2 * dc}`);
  const out: string[] = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const k = `${r},${c}`;
    out.push(r === 3 && c === 3 ? 'me' : jump.has(k) ? 'jump' : go.has(k) ? 'go' : '');
  }
  return out;
}

/** Small persisted UI preferences (best effort; storage can be unavailable). */
export function pref<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(`hg-${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function setPref(key: string, value: unknown) {
  try { localStorage.setItem(`hg-${key}`, JSON.stringify(value)); } catch { /* ignore */ }
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
