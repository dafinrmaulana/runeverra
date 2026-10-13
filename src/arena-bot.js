// Arena bot: alpha-beta negamax over the arena engine, including follow-up phases
// (beast move, ice placement) and Plantae reactions. Pure; no DOM.
import {
  applyAction, listActions, livingUnits, moveOptions, toMove, HEROES, chebyshev, unitAt, TEAM_SIZE,
} from './arena.js';

export const BOT_LEVELS = {
  easy: { depth: 1, noise: 220, ms: 150, label: 'Easy' },
  normal: { depth: 2, noise: 40, ms: 600, label: 'Normal' },
  hard: { depth: 3, noise: 8, ms: 1400, label: 'Hard' },
};
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const apply = (s, a) => applyAction(s, a, { trusted: true }).state;

const VALUE = { hasim: 330, genga: 300, magumba: 280, plantae: 270, hexor: 350, aqna: 340, beast: 150, creep: 80 };
const WIN = 1e6;
const other = (t) => (t === 'p1' ? 'p2' : 'p1');
const val = (u) => VALUE[u.kind === 'hero' ? u.hero : u.kind];

function teamScore(s, team) {
  let v = 0;
  for (const u of livingUnits(s, team)) {
    v += val(u);
    if (u.warded) v += 70;
    if (u.rooted) v -= 50;
    if (u.kind === 'creep') { v += 8 * (team === 'p1' ? 6 - u.pos.r : u.pos.r - 1); continue; }
    v += 5 * (3.5 - Math.max(Math.abs(u.pos.r - 3.5), Math.abs(u.pos.c - 3.5)));
  }
  // Every hero spends tokens now; banked tokens are worth a little (diminishing past 2).
  const e = s.energy[team];
  v += 16 * Math.min(e, 2) + 8 * Math.max(0, e - 2);
  return v;
}

function killsBy(s, team) {
  const out = new Map();
  for (const u of livingUnits(s, team)) {
    if (u.rooted || u.kind === 'beast') continue; // the beast only acts after Ge'nga
    for (const o of moveOptions(s, u)) {
      let sum = 0;
      for (const id of o.kills) sum += val(s.units[id]);
      if (sum) out.set(u.id + key(o.to), sum);
    }
  }
  return [...out.values()];
}
const key = (p) => `${p.r},${p.c}`;

/** Static evaluation from the point of view of the side to decide. */
export function evaluate(s) {
  const me = toMove(s);
  if (s.status === me) return WIN;
  if (s.status === other(me)) return -WIN;
  let v = teamScore(s, me) - teamScore(s, other(me));
  if (s.phase === 'main' || s.phase === 'beast') {
    const mine = killsBy(s, me), theirs = killsBy(s, other(me));
    v += 0.6 * Math.max(0, ...mine);
    v -= 0.25 * Math.max(0, ...theirs);
  }
  return v;
}

/** Actions worth searching: trims ice placement to spots that hinder enemies. */
export function botActions(s) {
  const all = listActions(s);
  if (s.phase !== 'ice') return orderActions(s, all);
  const enemies = livingUnits(s, other(s.current));
  const spots = all.filter((a) => a.type === 'ice')
    .map((a) => ({ a, d: Math.min(...enemies.map((e) => chebyshev(e.pos, a.to)), 9) }))
    .sort((x, y) => x.d - y.d).slice(0, 6).map((x) => x.a);
  return [...spots, { type: 'skip' }];
}

function orderActions(s, acts) {
  const score = (a) => (a.type === 'move' && unitAt(s, a.to) ? 0 : a.type === 'move' && isBackstab(s, a) ? 0 : 1);
  return acts.map((a) => [score(a), a]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
}
function isBackstab(s, a) {
  const u = s.units[a.unitId];
  return u && u.hero === 'hasim' && moveOptions(s, u).some((o) => o.backstab && o.to.r === a.to.r && o.to.c === a.to.c);
}

function lethal(s) {
  if (s.phase !== 'main') return [];
  return listActions(s).filter((a) => a.type === 'move' && (unitAt(s, a.to) || isBackstab(s, a)));
}

function quiesce(s, alpha, beta, ply, budget, left) {
  const stand = evaluate(s);
  if (left === 0 || now() > budget.deadline || s.phase !== 'main') return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  budget.n--;
  let best = stand;
  for (const a of lethal(s)) {
    const next = apply(s, a);
    const sc = score(s, next, (n, al, be) => quiesce(n, al, be, ply + 1, budget, left - 1), alpha, beta, ply);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function score(s, next, recurse, alpha, beta, ply) {
  if (next.status !== 'playing') return next.status === toMove(s) ? WIN - ply : -WIN + ply;
  return toMove(next) === toMove(s) ? recurse(next, alpha, beta) : -recurse(next, -beta, -alpha);
}

// A ply is spent whenever the turn passes; follow-ups inside one turn (beast move, ice,
// a reaction prompt) are searched without spending one. The turn always passes eventually.
function nextDepth(s, next, depth) {
  return next.current !== s.current || (s.phase === 'main' && next.phase === 'main') ? depth - 1 : depth;
}

function search(s, depth, alpha, beta, ply, budget) {
  if (s.status !== 'playing' || ply > 14) return evaluate(s);
  if (now() > budget.deadline) { budget.out = true; return evaluate(s); }
  if (depth <= 0) return quiesce(s, alpha, beta, ply, budget, 3);
  budget.n--;
  let best = -Infinity;
  for (const a of botActions(s)) {
    const next = apply(s, a);
    const d = nextDepth(s, next, depth);
    const sc = score(s, next, (n, al, be) => search(n, d, al, be, ply + 1, budget), alpha, beta, ply);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? evaluate(s) : best;
}

function jitter(s, i, amount) {
  if (!amount) return 0;
  let h = (s.turn * 2654435761 + i * 40503 + (s.seed || 0) * 97 + s.phase.length * 7) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return ((h % 1000) / 1000) * amount;
}

/**
 * Choose an action for whoever must decide now (toMove). Iterative deepening under a
 * time budget: the deepest fully searched depth wins, so the bot never stalls the UI.
 */
export function chooseAction(s, level = 'normal') {
  const cfg = BOT_LEVELS[level] || BOT_LEVELS.normal;
  let acts = botActions(s);
  if (!acts.length) return null;
  if (acts.length === 1) return { action: acts[0], score: 0, depth: 0 };
  const budget = { n: 1e9, deadline: now() + cfg.ms, out: false };
  const jit = new Map(acts.map((a, i) => [a, jitter(s, i, cfg.noise)]));
  let result = null;
  for (let depth = 1; depth <= cfg.depth; depth++) {
    budget.out = false;
    const scored = [];
    for (const a of acts) {
      const next = apply(s, a);
      const d = nextDepth(s, next, depth);
      const sc = score(s, next, (n, al, be) => search(n, d, al, be, 1, budget), -Infinity, Infinity, 0);
      scored.push([sc + jit.get(a), a]);
      if (budget.out && depth > 1) break;
    }
    if (budget.out && depth > 1) break; // keep the last complete depth
    scored.sort((x, y) => y[0] - x[0]);
    result = { action: scored[0][1], score: scored[0][0], depth };
    acts = scored.map((x) => x[1]); // best-first ordering for the next depth
    if (now() > budget.deadline) break;
  }
  return result;
}

/** A varied but reproducible team for the bot. */
export function pickTeam(seed = 0) {
  const pool = Object.keys(HEROES);
  const out = [];
  let h = (seed * 2654435761 + 12345) >>> 0;
  while (out.length < TEAM_SIZE) {
    h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    const pick = pool.splice(h % pool.length, 1)[0];
    out.push(pick);
  }
  return out;
}
