// Hero Gambit bot: alpha-beta search over the rules engine. Pure, no DOM.
// The bot only ever plays actions the engine lists as legal, and every
// choice goes through applyAction, so it cannot bend the rules.
import {
  applyAction, getLegalMoves, getAbilityTargets, getThreats, livingUnits, unitAt,
  abilityAvailable, HEROES, getAbilityDef,
} from './engine.js';

export const BOT_LEVELS = {
  easy: { depth: 1, noise: 220, label: 'Easy' },
  normal: { depth: 2, noise: 40, label: 'Normal' },
  hard: { depth: 3, noise: 8, label: 'Hard' },
};

const VALUE = { knight: 330, bishop: 320, rook: 350 };
const WIN = 1e6;
const other = (t) => (t === 'p1' ? 'p2' : 'p1');

/** Every legal action for the side to move, most forcing first (better pruning). */
export function listActions(state) {
  const lethal = [], quiet = [];
  for (const u of livingUnits(state, state.current)) {
    for (const to of getLegalMoves(state, u.id)) {
      (unitAt(state, to) ? lethal : quiet).push({ type: 'move', unitId: u.id, to });
    }
    for (const a of HEROES[u.type].abilities) {
      for (const t of getAbilityTargets(state, u.id, a.key)) {
        (a.lethal ? lethal : quiet).push({ type: 'ability', unitId: u.id, ability: a.key, ...t });
      }
    }
  }
  return lethal.concat(quiet);
}

function sideScore(state, team) {
  let v = 0;
  for (const u of livingUnits(state, team)) {
    v += VALUE[u.type];
    // An unused skill is a loaded threat: worth keeping, worth spending well.
    for (const a of HEROES[u.type].abilities) {
      if (abilityAvailable(state, u, a.key)) v += a.lethal ? 45 : 25;
    }
    if (u.status.shield) v += 70;
    if (u.status.frozen) v -= 40;
    // Mild pull toward the centre: more reach, more options.
    v += 6 * (3.5 - Math.max(Math.abs(u.pos.r - 3.5), Math.abs(u.pos.c - 3.5)));
  }
  return v;
}

/** Static evaluation from the point of view of the side to move. */
export function evaluate(state) {
  const me = state.current;
  if (state.status === me) return WIN;
  if (state.status === other(me)) return -WIN;
  let v = sideScore(state, me) - sideScore(state, other(me));
  // I move next: enemies I can hit are near-gains. My own hanging heroes only
  // matter if I can't fix them this turn, so they count for less.
  const myTargets = new Set(getThreats(state, other(me)).map((t) => t.targetId));
  const theirTargets = new Set(getThreats(state, me).map((t) => t.targetId));
  let best = 0;
  for (const id of myTargets) {
    const u = state.units[id];
    best = Math.max(best, u.status.shield ? 60 : VALUE[u.type] * 0.6);
  }
  v += best;
  for (const id of theirTargets) {
    const u = state.units[id];
    v -= u.status.shield ? 20 : VALUE[u.type] * (theirTargets.size > 1 ? 0.35 : 0.15);
  }
  return v;
}

function search(state, depth, alpha, beta, ply, budget) {
  if (state.status !== 'playing') {
    // Prefer faster wins and slower losses.
    return state.status === state.current ? WIN - ply : -WIN + ply;
  }
  if (budget.nodes <= 0) return evaluate(state);
  if (depth === 0) return quiesce(state, alpha, beta, ply, budget, 4);
  budget.nodes--;
  const actions = listActions(state);
  if (!actions.length) return evaluate(state);
  let best = -Infinity;
  for (const a of actions) {
    const next = applyAction(state, a).state;
    const same = next.current === state.current && next.status === 'playing';
    const score = same
      ? search(next, depth - 1, alpha, beta, ply + 1, budget)
      : -search(next, depth - 1, -beta, -alpha, ply + 1, budget);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Lethal-only extension so the search never stops in the middle of an exchange. */
function quiesce(state, alpha, beta, ply, budget, left) {
  const stand = evaluate(state);
  if (left === 0 || budget.nodes <= 0) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  budget.nodes--;
  let best = stand;
  for (const a of listLethal(state)) {
    const next = applyAction(state, a).state;
    let score;
    if (next.status !== 'playing') score = next.status === state.current ? WIN - ply : -WIN + ply;
    else if (next.current === state.current) score = quiesce(next, alpha, beta, ply + 1, budget, left - 1);
    else score = -quiesce(next, -beta, -alpha, ply + 1, budget, left - 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function listLethal(state) {
  const out = [];
  for (const u of livingUnits(state, state.current)) {
    for (const to of getLegalMoves(state, u.id)) if (unitAt(state, to)) out.push({ type: 'move', unitId: u.id, to });
    for (const a of HEROES[u.type].abilities) {
      if (!a.lethal) continue;
      for (const t of getAbilityTargets(state, u.id, a.key)) out.push({ type: 'ability', unitId: u.id, ability: a.key, ...t });
    }
  }
  return out;
}

// Small deterministic hash so the bot varies between positions but replays identically.
function jitter(state, i, amount) {
  if (!amount) return 0;
  let h = (state.turn * 2654435761 + i * 40503 + (state.seed || 0)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return ((h % 1000) / 1000) * amount;
}

/**
 * Pick an action for the side to move.
 * Returns { action, score, considered } or null when there is nothing legal.
 */
export function chooseAction(state, level = 'normal') {
  const cfg = BOT_LEVELS[level] || BOT_LEVELS.normal;
  const actions = listActions(state);
  if (!actions.length) return null;
  const budget = { nodes: 60000 };
  let best = null, bestScore = -Infinity;
  actions.forEach((a, i) => {
    const r = applyAction(state, a);
    if (!r.ok) return; // never happens; listed actions are legal
    const next = r.state;
    const same = next.current === state.current && next.status === 'playing';
    let score;
    if (next.status === state.current) score = WIN;
    else score = same
      ? search(next, cfg.depth - 1, -Infinity, Infinity, 1, budget)
      : -search(next, cfg.depth - 1, -Infinity, Infinity, 1, budget);
    score += jitter(state, i, cfg.noise);
    if (score > bestScore) { bestScore = score; best = a; }
  });
  return { action: best, score: bestScore, considered: actions.length };
}

/** Short plain-language reason, shown in the UI after the bot acts. */
export function describeIntent(state, action) {
  if (!action) return '';
  if (action.type === 'ability') return getAbilityDef(action.ability).name;
  return unitAt(state, action.to) ? 'Capture' : 'Move';
}
