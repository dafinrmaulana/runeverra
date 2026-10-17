// Turn flow shared by the core rules and the heroes' follow-up phases.
import type { Result, State, Team, Unit } from './types.ts';
import { TEAMS, TEAM_NAMES, other, squareName } from './geometry.ts';
import { heroDef, hooksOf } from './registry.ts';
import { energyRules, gainRunes, label, livingHeroes, livingUnits } from './state.ts';
import { moveOptions } from './movement.ts';
import { skillActions } from './skills.ts';

// Creeps: pawn-like minions moved by their player (moving one uses the turn's action).
//   files: the flank lanes; both sides' creeps start on these files (second rank) and face each other.
//   Map terrain never sits on these files, so creeps are only ever blocked by units.
//   lastHit: runes for eliminating an enemy creep; breach: runes when a creep reaches the far rank
export const CREEPS = { files: ['a', 'b', 'g', 'h'], lastHit: 1, breach: 1 };
/** Runes for eliminating an enemy hero. */
export const HERO_BOUNTY = 1;

/** Runes `byTeam` earns for eliminating `victim` (an enemy hero or creep; companions earn nothing). */
export function bountyFor(victim: Unit, byTeam: Team | null) {
  if (!byTeam || byTeam === victim.team) return 0;
  return victim.kind === 'hero' ? HERO_BOUNTY : victim.kind === 'creep' ? CREEPS.lastHit : 0;
}

/** The successful Result for a state that has been fully updated. */
export const done = (state: State): Result => ({ ok: true, state, reason: null });

/** Units the side to move may act with in the main phase: heroes and creeps, never followers. */
export const mainActors = (state: State) => livingUnits(state, state.current).filter((unit) => !heroDef(unit).follower);

/** Take a unit off the board. `byTeam` earns runes when the victim is an enemy hero or creep. */
export function eliminate(state: State, victim: Unit, logLines: string[], byTeam: Team | null = null) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.rooted = 0;
  victim.warded = false;
  logLines.push(`${label(victim)} is eliminated on ${squareName(victim.pos)}.`);
  const bounty = bountyFor(victim, byTeam);
  if (bounty) {
    gainRunes(state, byTeam!, bounty);
    logLines.push(`${TEAM_NAMES[byTeam!]} gains ${bounty} rune${bounty > 1 ? 's' : ''} for the kill.`);
  }
  hooksOf(victim)?.onEliminated?.(state, victim, logLines);
}

/** Ends the match when a team has no hero left. */
export function checkWinner(state: State) {
  for (const team of TEAMS) {
    if (livingHeroes(state, team).length === 0) {
      state.status = other(team);
      state.phase = 'main';
      state.pending = null;
      state.log.push({
        turn: state.turn,
        team: state.status,
        text: `${TEAM_NAMES[state.status]} wins — every enemy hero is down.`,
      });
      return;
    }
  }
}

/** Pass the turn: tick roots, wards and cooldowns, and skip a side that has nothing legal to do. */
export function endTurn(state: State) {
  const energy = energyRules(state);
  for (let guard = 0; guard < 4; guard++) {
    for (const unit of livingUnits(state, state.current)) if (unit.rooted > 0) unit.rooted -= 1;
    state.current = other(state.current);
    state.turn += 1;
    state.phase = 'main';
    state.pending = null;
    state.energy[state.current] = Math.min(energy.max, state.energy[state.current] + energy.perTurn);
    for (const unit of livingUnits(state, state.current)) {
      unit.warded = false; // Empty Grave lasts until the caster's next turn
      if (unit.cd > 0) unit.cd -= 1; // skill cooldowns tick at the start of the owner's turn
    }
    if (hasAnyAction(state)) return;
    state.log.push({
      turn: state.turn,
      team: state.current,
      text: `${TEAM_NAMES[state.current]} has no legal action and passes.`,
    });
  }
}

function hasAnyAction(state: State) {
  for (const unit of mainActors(state)) {
    if (unit.rooted) continue;
    if (moveOptions(state, unit).some((option) => (option.cost || 0) <= state.energy[unit.team])) return true;
    if (skillActions(state, unit).length) return true;
  }
  return false;
}
