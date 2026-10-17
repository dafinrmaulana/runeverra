// The core rules: listing legal actions (the single source of legality), explaining illegal
// ones, and applying them. Nothing here names a hero; heroes plug in through their hooks
// and phases (src/engine/heroes/). docs/heroes.md walks through the order of a turn.
import type { Action, LastAction, Result, State, Team, Unit } from './types.ts';
import { BOARD_SIZE, DIAG, TEAMS, TEAM_NAMES, inBounds, other, samePos, squareName } from './geometry.ts';
import { HEROES, PHASES, heroDef, hooksOf, own, skillOf } from './registry.ts';
import {
  blockAt,
  clone,
  energyRules,
  gainRunes,
  label,
  livingHeroes,
  livingUnits,
  pushLog,
  toMove,
  unitAt,
} from './state.ts';
import { moveOptions } from './movement.ts';
import { inSkillReach, skillActions, skillCooldown } from './skills.ts';
import { CREEPS, checkWinner, done, eliminate, endTurn, mainActors } from './turn.ts';

/** Every legal action for whoever decides now (toMove). Validation, the bot and the UI all use this. */
export function listActions(state: State): Action[] {
  if (state.status !== 'playing') return [];
  if (state.phase === 'react')
    return [
      { type: 'react', use: true },
      { type: 'react', use: false },
    ];
  const phase = own(PHASES, state.phase);
  if (phase) return phase.list(state);
  const actions: Action[] = [];
  for (const unit of mainActors(state)) {
    if (unit.rooted) continue;
    for (const option of moveOptions(state, unit)) {
      if ((option.cost || 0) <= state.energy[unit.team]) actions.push({ type: 'move', unitId: unit.id, to: option.to });
    }
    actions.push(...skillActions(state, unit));
  }
  return actions;
}

const sameAction = (first: Action, second: Action) =>
  first.type === second.type &&
  first.unitId === second.unitId &&
  first.skill === second.skill &&
  first.targetId === second.targetId &&
  first.use === second.use &&
  first.pattern === second.pattern &&
  (!first.to || (!!second.to && samePos(first.to, second.to)));

/** Is `action` legal right now? When it isn't, `reason` is a sentence for the player. */
export function validateAction(state: State, action: Action): { ok: boolean; reason?: string } {
  if (!action || typeof action !== 'object') return { ok: false, reason: 'Unknown action.' };
  if (state.status !== 'playing') return { ok: false, reason: 'The match is over. Start a new match.' };
  if (listActions(state).some((legal) => sameAction(legal, action))) return { ok: true };
  return { ok: false, reason: explain(state, action) };
}

/** Why an action that isn't in listActions was refused. */
function explain(state: State, action: Action): string {
  if (state.phase === 'react')
    return `Answer the ${skillOf(state.units[state.pending!.reactorId!])?.name} prompt first.`;
  const phase = own(PHASES, state.phase);
  if (phase && !phase.unitPhase) return phase.explain?.(state, action) ?? 'That action is not available right now.';
  const unit = own(state.units, action.unitId);
  if (!unit) return 'Choose one of your heroes.';
  if (!unit.alive) return `${label(unit)} has been eliminated.`;
  if (phase) {
    const why = phase.explain?.(state, action, unit);
    if (why) return why;
  } else if (heroDef(unit).follower) return heroDef(unit).idleText || 'That unit only follows its owner.';
  if (unit.team !== state.current) return `It is ${TEAM_NAMES[state.current]}'s turn.`;
  if (unit.rooted) return `${label(unit)} is held by roots this turn.`;
  if (action.type === 'move') return explainMove(state, unit, action);
  if (action.type === 'skill') return explainSkill(state, unit, action);
  return 'That action is not available right now.';
}

function explainMove(state: State, unit: Unit, action: Action): string {
  const to = action.to;
  if (!to || !inBounds(to)) return 'That square is off the board.';
  if (blockAt(state, to)) return 'Nobody can enter terrain.';
  const option = moveOptions(state, unit).find((candidate) => samePos(candidate.to, to));
  if (option?.cost && option.cost > state.energy[unit.team])
    return `${heroDef(unit).skill?.name} costs ${option.cost} rune; you have ${state.energy[unit.team]}.`;
  const occupant = unitAt(state, to);
  if (occupant && occupant.team === unit.team) return `${squareName(to)} is occupied by your own unit.`;
  if (occupant && occupant.warded) return `${label(occupant)} is protected by Empty Grave.`;
  return `${label(unit)} can't reach ${squareName(to)}. ${heroDef(unit).moveText}`;
}

function explainSkill(state: State, caster: Unit, action: Action): string {
  const skill = skillOf(caster);
  if (!skill) return `${label(caster)} has no skill to cast.`;
  if (skill.type !== 'active') return `${skill.name} is passive; it triggers on its own.`;
  const cooldown = skillCooldown(caster);
  if (cooldown > 0) return `${skill.name} is recharging: ready in ${cooldown} turn${cooldown > 1 ? 's' : ''}.`;
  if (state.energy[caster.team] < skill.cost)
    return `${skill.name} needs ${skill.cost} runes; you have ${state.energy[caster.team]}.`;
  const hooks = hooksOf(caster);
  const heroReason = hooks?.explainSkill?.(state, caster, action);
  if (heroReason) return heroReason;
  const target = own(state.units, action.targetId);
  if (!target || !target.alive) return 'Choose a living target.';
  if (target.id !== caster.id && !inSkillReach(state, caster, target.pos)) {
    const name = heroDef(caster).name;
    if (skill.reach?.cells) return `${label(target)} is not in ${name}'s ${skill.reach.label} pattern.`;
    if (skill.reach?.ray)
      return `${label(target)} is not on ${name}'s ${skill.reach.dirs === DIAG ? 'diagonals' : 'straight lines'} within ${skill.range} squares, or something blocks the line.`;
    return `Target is out of range (${skill.range} squares).`;
  }
  if (target.warded) return `${label(target)} is protected by Empty Grave.`;
  return hooks?.explainTarget?.(state, caster, target) ?? 'That action is not available right now.';
}

// ---------- resolution ----------
function resolveMove(state: State, action: Action, logLines: string[], lastAction: LastAction) {
  const mover = state.units[action.unitId!];
  const option = moveOptions(state, mover).find((candidate) => samePos(candidate.to, action.to!))!;
  const from = { ...mover.pos };
  const victims = option.kills.map((id) => state.units[id]);
  const jumped = option.over ? state.units[option.over] : null;
  lastAction.kind = option.backstab ? 'backstab' : victims.length ? 'capture' : 'move';
  lastAction.from = from;
  lastAction.to = { ...option.to };
  if (option.backstab) {
    state.energy[mover.team] -= option.cost || 0;
    logLines.push(
      `${label(mover)} backstabs over ${jumped ? label(jumped) : 'the terrain'} (${squareName(from)} → ${squareName(option.to)}). Backstab, free: he was next to ${jumped ? 'a unit' : 'terrain'} with an open landing square behind it.`,
    );
  } else if (victims.length) {
    logLines.push(`${label(mover)} strikes ${label(victims[0])} on ${squareName(option.to)}.`);
  } else {
    logLines.push(`${label(mover)} moves ${squareName(from)} → ${squareName(option.to)}.`);
  }
  for (const victim of victims) {
    lastAction.hits.push({ ...victim.pos });
    eliminate(state, victim, logLines, mover.team);
  }
  mover.pos = { ...option.to };
  if (mover.kind === 'creep') mover.moved = true;
  if (mover.kind === 'creep' && mover.pos.r === (mover.team === 'p1' ? 0 : BOARD_SIZE - 1)) {
    mover.alive = false;
    gainRunes(state, mover.team, CREEPS.breach);
    lastAction.breach = true;
    logLines.push(`${label(mover)} breaks through on ${squareName(mover.pos)}: +${CREEPS.breach} runes.`);
  }
  return { killed: victims.length };
}

function resolveSkill(state: State, action: Action, logLines: string[], lastAction: LastAction) {
  const caster = state.units[action.unitId!];
  const skill = HEROES[caster.hero].skill;
  state.energy[caster.team] -= skill.cost;
  if (skill.cooldown) caster.cd = skill.cooldown;
  hooksOf(caster)!.resolveSkill!(state, caster, action, logLines, lastAction);
}

const newLastAction = (state: State, action: Action): LastAction => ({
  team: toMove(state),
  unitId: action.unitId || null,
  from: null,
  to: null,
  hits: [],
  kind: action.type,
  phase: state.phase,
});

/**
 * Apply an action and return the new state; the input state is never changed. `trusted` skips
 * validation and is only for callers that took the action straight from listActions(state)
 * (the bot) or decide it outside the rules (a clock's timeout). Everything else is validated.
 */
export function applyAction(state: State, action: Action, { trusted = false } = {}): Result {
  if (action && action.type === 'timeout') return applyTimeout(state, action, trusted);
  if (!trusted) {
    const check = validateAction(state, action);
    if (!check.ok) return { ok: false, reason: check.reason!, state };
  }
  const next = clone(state);
  next.trail.push(structuredClone(action)); // every decision, for replays: createMatch(setup) + trail
  const logLines: string[] = [];

  if (next.phase === 'react') return answerReaction(next, action, logLines);

  const phase = own(PHASES, next.phase);
  const settled = phase?.resolve?.(next, action, { previous: state, logLines, team: toMove(next) });
  if (settled) return settled;

  // A unit action (main phase or a unit phase like the beast's): can the opponent react?
  const reactor = findReactor(next, action);
  if (reactor) {
    next.pending = { type: 'react', action, resume: next.phase, resumePending: next.pending, reactorId: reactor.id };
    next.phase = 'react';
    return done(next);
  }
  return finishUnitAction(next, action, newLastAction(next, action), logLines);
}

// Running out of time is decided outside the rules (by a clock), so only trusted callers may end a match this way.
function applyTimeout(state: State, action: Action, trusted: boolean): Result {
  if (!trusted || state.status !== 'playing' || !TEAMS.includes(action.team!))
    return { ok: false, reason: 'Not allowed.', state };
  const next = clone(state);
  next.trail.push(structuredClone(action));
  next.status = other(action.team!);
  next.phase = 'main';
  next.pending = null;
  next.log.push({
    turn: next.turn,
    team: next.status,
    text: `${TEAM_NAMES[action.team!]} ran out of time. ${TEAM_NAMES[next.status]} wins.`,
  });
  return done(next);
}

/** The opponent answered a reaction prompt: negate the waiting action, or let it happen. */
function answerReaction(state: State, answer: Action, logLines: string[]): Result {
  const pending = state.pending!;
  const negated = pending.action!;
  const actor = state.units[negated.unitId!];
  const reactor = state.units[pending.reactorId!];
  state.phase = pending.resume!;
  state.pending = pending.resumePending ?? null;
  if (answer.use) {
    state.lastAction = hooksOf(reactor)!.reaction!.resolve(state, reactor, actor, negated, logLines);
    pushLog(state, logLines, reactor.team);
    endTurn(state);
    return done(state);
  }
  logLines.push(`${label(reactor)} lets it happen.`);
  pushLog(state, logLines, reactor.team);
  logLines.length = 0;
  return finishUnitAction(state, negated, newLastAction(state, negated), logLines);
}

/** Resolve a move or a cast, then either open the hero's follow-up phase or end the turn. */
function finishUnitAction(state: State, action: Action, lastAction: LastAction, logLines: string[]): Result {
  const actor = state.units[action.unitId!];
  const following = !!own(PHASES, state.phase)?.unitPhase; // e.g. the beast stepping after Ge'nga
  let killed = 0;
  if (action.type === 'move') killed = resolveMove(state, action, logLines, lastAction).killed;
  else resolveSkill(state, action, logLines, lastAction);
  pushLog(state, logLines, actor.team);
  state.lastAction = lastAction;
  checkWinner(state);
  if (state.status !== 'playing') return done(state);

  state.phase = 'main';
  state.pending = null;
  if (action.type !== 'skill' && !following && actor.alive) {
    // a cast ends the turn
    if (hooksOf(actor)?.afterAction?.(state, actor, { killed })) return done(state);
  }
  endTurn(state);
  return done(state);
}

/** The opponent's hero that may answer this unit action right now, if any. */
function findReactor(state: State, action: Action): Unit | null {
  const actor = own(state.units, action.unitId);
  if (!actor || actor.warded) return null;
  for (const hero of livingHeroes(state, other(actor.team))) {
    const reaction = hooksOf(hero)?.reaction;
    if (reaction && !hero.rooted && skillCooldown(hero) === 0 && reaction.can(state, hero, actor)) return hero;
  }
  return null;
}

/** Units of `team` that the opponent could eliminate with one basic move next turn (board as is). */
export function getThreats(state: State, team: Team) {
  const threatened = new Set<string>();
  const opponent = other(team);
  const energy = energyRules(state);
  for (const enemy of livingUnits(state, opponent)) {
    if (enemy.rooted) continue;
    const budget = Math.min(energy.max, state.energy[opponent] + energy.perTurn);
    for (const option of moveOptions(state, enemy)) {
      if ((option.cost || 0) <= budget) for (const id of option.kills) threatened.add(id);
    }
  }
  return threatened;
}
