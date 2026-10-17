// Arena bot: alpha-beta negamax over the rules engine, including follow-up phases
// (beast move, ice placement) and reactions. Pure; no DOM. Knows no hero by name: material
// values come from each unit's `value`, and a phase may narrow what is worth searching.
import type { Action, Pos, State, Team, Unit } from './index.ts';
import {
  applyAction,
  listActions,
  livingUnits,
  moveOptions,
  toMove,
  HEROES,
  PHASES,
  TEAM_SIZE,
  heroDef,
  own,
  unitAt,
} from './index.ts';

export type BotLevel = {
  depth: number; // turns searched ahead
  noise: number; // random score added per action, so easier bots blunder
  ms: number; // thinking time budget
  label: string;
};
export const BOT_LEVELS: Record<string, BotLevel> = {
  easy: { depth: 1, noise: 220, ms: 150, label: 'Easy' },
  normal: { depth: 2, noise: 40, ms: 600, label: 'Normal' },
  hard: { depth: 3, noise: 8, ms: 1400, label: 'Hard' },
};
export type BotChoice = { action: Action; score: number; depth: number };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const applyTrusted = (state: State, action: Action) => applyAction(state, action, { trusted: true }).state;

const WIN = 1e6;
const other = (team: Team): Team => (team === 'p1' ? 'p2' : 'p1');
const valueOf = (unit: Unit) => heroDef(unit).value;
const squareKey = (pos: Pos) => `${pos.r},${pos.c}`;

/** Material, position and banked runes of one team. */
function teamScore(state: State, team: Team) {
  let score = 0;
  for (const unit of livingUnits(state, team)) {
    score += valueOf(unit);
    if (unit.warded) score += 70;
    if (unit.rooted) score -= 50;
    if (unit.kind === 'creep') {
      score += 8 * (team === 'p1' ? 6 - unit.pos.r : unit.pos.r - 1); // closer to breaking through
      continue;
    }
    score += 5 * (3.5 - Math.max(Math.abs(unit.pos.r - 3.5), Math.abs(unit.pos.c - 3.5))); // nearer the centre
  }
  // Every hero spends runes now; banked runes are worth a little (diminishing past 2).
  const runes = state.energy[team];
  score += 16 * Math.min(runes, 2) + 8 * Math.max(0, runes - 2);
  return score;
}

/** Value of everything each of `team`'s moves would capture right now. */
function captureValues(state: State, team: Team) {
  const byMove = new Map<string, number>();
  for (const unit of livingUnits(state, team)) {
    if (unit.rooted || heroDef(unit).follower) continue; // the beast only acts after Ge'nga
    for (const option of moveOptions(state, unit)) {
      let captured = 0;
      for (const id of option.kills) captured += valueOf(state.units[id]);
      if (captured) byMove.set(unit.id + squareKey(option.to), captured);
    }
  }
  return [...byMove.values()];
}

/** Static evaluation from the point of view of the side to decide. */
export function evaluate(state: State) {
  const me = toMove(state);
  if (state.status === me) return WIN;
  if (state.status === other(me)) return -WIN;
  let score = teamScore(state, me) - teamScore(state, other(me));
  if (state.phase === 'main' || state.phase === 'beast') {
    score += 0.6 * Math.max(0, ...captureValues(state, me));
    score -= 0.25 * Math.max(0, ...captureValues(state, other(me)));
  }
  return score;
}

/** Actions worth searching: a phase may trim its own (Aqna's ice keeps the spots that hinder enemies). */
export function botActions(state: State) {
  const all = listActions(state);
  const phase = own(PHASES, state.phase);
  return phase?.botActions ? phase.botActions(state, all) : capturesFirst(state, all);
}

function capturesFirst(state: State, actions: Action[]) {
  const order = (action: Action) => (isCapture(state, action) ? 0 : 1);
  return actions
    .map((action) => [order(action), action] as const)
    .sort((first, second) => first[0] - second[0])
    .map(([, action]) => action);
}
function isCapture(state: State, action: Action) {
  return action.type === 'move' && (!!unitAt(state, action.to!) || isBackstab(state, action));
}
function isBackstab(state: State, action: Action) {
  const unit = state.units[action.unitId!];
  return (
    !!unit &&
    moveOptions(state, unit).some(
      (option) => option.backstab && option.to.r === action.to!.r && option.to.c === action.to!.c,
    )
  );
}

function captures(state: State) {
  if (state.phase !== 'main') return [];
  return listActions(state).filter((action) => isCapture(state, action));
}

/** Search limits shared by the whole search: node count, wall-clock deadline, and whether it ran out. */
type Budget = { nodes: number; deadline: number; outOfTime: boolean };
/** Searches `state` from the point of view of whoever decides there. */
type SearchFrom = (state: State, alpha: number, beta: number) => number;

/** Keep following captures past the depth limit, so the bot never stops in the middle of a trade. */
function quiesce(state: State, alpha: number, beta: number, ply: number, budget: Budget, capturesLeft: number): number {
  const standPat = evaluate(state);
  if (capturesLeft === 0 || now() > budget.deadline || state.phase !== 'main') return standPat;
  if (standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;
  budget.nodes--;
  let best = standPat;
  for (const action of captures(state)) {
    const next = applyTrusted(state, action);
    const deeper: SearchFrom = (nextState, alphaBound, betaBound) =>
      quiesce(nextState, alphaBound, betaBound, ply + 1, budget, capturesLeft - 1);
    const score = scoreAfter(state, next, deeper, alpha, beta, ply);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Score of `next` for whoever decided in `state` (negamax: flip when the decider changes). */
function scoreAfter(state: State, next: State, searchFrom: SearchFrom, alpha: number, beta: number, ply: number) {
  if (next.status !== 'playing') return next.status === toMove(state) ? WIN - ply : -WIN + ply;
  return toMove(next) === toMove(state) ? searchFrom(next, alpha, beta) : -searchFrom(next, -beta, -alpha);
}

// A ply is spent whenever the turn passes; follow-ups inside one turn (beast move, ice,
// a reaction prompt) are searched without spending one. The turn always passes eventually.
function nextDepth(state: State, next: State, depth: number) {
  return next.current !== state.current || (state.phase === 'main' && next.phase === 'main') ? depth - 1 : depth;
}

function search(state: State, depth: number, alpha: number, beta: number, ply: number, budget: Budget): number {
  if (state.status !== 'playing' || ply > 14) return evaluate(state);
  if (now() > budget.deadline) {
    budget.outOfTime = true;
    return evaluate(state);
  }
  if (depth <= 0) return quiesce(state, alpha, beta, ply, budget, 3);
  budget.nodes--;
  let best = -Infinity;
  for (const action of botActions(state)) {
    const next = applyTrusted(state, action);
    const remaining = nextDepth(state, next, depth);
    const deeper: SearchFrom = (nextState, alphaBound, betaBound) =>
      search(nextState, remaining, alphaBound, betaBound, ply + 1, budget);
    const score = scoreAfter(state, next, deeper, alpha, beta, ply);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? evaluate(state) : best;
}

/** A reproducible pseudo-random bonus for the action at `index`, up to `amount`. */
function jitter(state: State, index: number, amount: number) {
  if (!amount) return 0;
  let hash = (state.turn * 2654435761 + index * 40503 + (state.seed || 0) * 97 + state.phase.length * 7) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995) >>> 0;
  hash ^= hash >>> 15;
  return ((hash % 1000) / 1000) * amount;
}

/**
 * Choose an action for whoever must decide now (toMove). Iterative deepening under a
 * time budget: the deepest fully searched depth wins, so the bot never stalls the UI.
 */
export function chooseAction(state: State, levelName: string = 'normal'): BotChoice | null {
  const level = own(BOT_LEVELS, levelName) || BOT_LEVELS.normal;
  let candidates = botActions(state);
  if (!candidates.length) return null;
  if (candidates.length === 1) return { action: candidates[0], score: 0, depth: 0 };
  const budget: Budget = { nodes: 1e9, deadline: now() + level.ms, outOfTime: false };
  const noise = new Map(candidates.map((action, index) => [action, jitter(state, index, level.noise)]));
  let best: BotChoice | null = null;
  for (let depth = 1; depth <= level.depth; depth++) {
    budget.outOfTime = false;
    const scored: [number, Action][] = [];
    for (const action of candidates) {
      const next = applyTrusted(state, action);
      const remaining = nextDepth(state, next, depth);
      const deeper: SearchFrom = (nextState, alphaBound, betaBound) =>
        search(nextState, remaining, alphaBound, betaBound, 1, budget);
      const score = scoreAfter(state, next, deeper, -Infinity, Infinity, 0);
      scored.push([score + noise.get(action)!, action]);
      if (budget.outOfTime && depth > 1) break;
    }
    if (budget.outOfTime && depth > 1) break; // keep the last complete depth
    scored.sort((first, second) => second[0] - first[0]);
    best = { action: scored[0][1], score: scored[0][0], depth };
    candidates = scored.map(([, action]) => action); // best-first ordering for the next depth
    if (now() > budget.deadline) break;
  }
  return best;
}

/** A varied but reproducible team for the bot. */
export function pickTeam(seed = 0) {
  const pool = Object.keys(HEROES);
  const team: string[] = [];
  let hash = (seed * 2654435761 + 12345) >>> 0;
  while (team.length < TEAM_SIZE) {
    hash = (Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    team.push(pool.splice(hash % pool.length, 1)[0]);
  }
  return team;
}
