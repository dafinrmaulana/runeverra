// Reading the game state, plus the few helpers every rule shares.
import type { Pos, State, Team, Unit, UnitKind } from './types.ts';
import { TEAM_NAMES, chebyshev, key, other, samePos } from './geometry.ts';
import { heroDef } from './registry.ts';
import { ENERGY } from './modes.ts';

export function makeUnit(id: string, team: Team, heroId: string, kind: UnitKind, pos: Pos): Unit {
  return { id, team, hero: heroId, kind, pos: { ...pos }, alive: true, rooted: 0, warded: false, cd: 0 };
}

// The log and the trail are append-only and their entries are never mutated, so they are shared.
export const clone = (state: State): State => {
  const copy = structuredClone({ ...state, log: null, trail: null }) as unknown as State;
  copy.log = state.log.slice();
  copy.trail = (state.trail || []).slice();
  return copy;
};

export const livingUnits = (state: State, team?: Team) =>
  Object.values(state.units).filter((unit) => unit.alive && (!team || unit.team === team));
export const livingHeroes = (state: State, team?: Team) =>
  livingUnits(state, team).filter((unit) => unit.kind === 'hero');
export const unitAt = (state: State, pos: Pos) =>
  Object.values(state.units).find((unit) => unit.alive && samePos(unit.pos, pos)) || null;
export const blockAt = (state: State, pos: Pos) => state.blocks[key(pos)] || null;
/** "Ivory Hexor": a unit's name for the log and messages. */
export const label = (unit: Unit) => `${TEAM_NAMES[unit.team]} ${heroDef(unit).name}`;
/** The team that decides now: the opponent answers a reaction prompt, otherwise the current team. */
export const toMove = (state: State): Team => (state.phase === 'react' ? other(state.current) : state.current);
/** A hero's living beast. */
export const beastOf = (state: State, owner: Unit) =>
  Object.values(state.units).find((unit) => unit.kind === 'beast' && unit.ownerId === owner.id && unit.alive) || null;
export const canBeHit = (attacker: Unit, target: Unit) => target.team !== attacker.team && !target.warded;
/** The rune numbers this match is played with (older saved states predate `rules`). */
export const energyRules = (state: State) => state.rules?.energy ?? ENERGY;
export const gainRunes = (state: State, team: Team, amount: number) => {
  state.energy[team] = Math.min(energyRules(state).max, state.energy[team] + amount);
};

export function pushLog(state: State, logLines: string[], team: Team | null) {
  for (const text of logLines) state.log.push({ turn: state.turn, team, text });
}

// Log helpers: why a skill could be used.
export const tokens = (count: number) => (count ? `${count} rune${count > 1 ? 's' : ''}` : 'free');
export const dist = (from: Unit, to: Unit) => {
  const squares = chebyshev(from.pos, to.pos);
  return `${squares} square${squares === 1 ? '' : 's'} away`;
};
export const left = (state: State, team: Team) => `(${tokens(state.energy[team]).replace('free', 'no runes')} left)`;
