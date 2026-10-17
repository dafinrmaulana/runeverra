// Aqna, Winter Hunter: a kill stores an ice charge, spent to raise an ice block — right after
// the kill (the "ice" phase) or later as her skill.
import type { Action, LastAction, Pos, State, Unit } from '../types.ts';
import { ORTHO, chebyshev, key, other, squareName } from '../geometry.ts';
import { inInnerReach, skillReach } from '../skills.ts';
import { defineHero, definePhase } from '../registry.ts';
import { blockAt, label, left, livingUnits, pushLog, tokens, unitAt } from '../state.ts';
import { checkWinner, done, eliminate, endTurn } from '../turn.ts';
import { moveActions, moveOptions } from '../movement.ts';

/** Ice blocks Aqna can have out at once; past it her oldest one moves to the new spot. */
export const ICE_LIMIT = 10;
/** Runes on top of Icy Step's cost when the ice hits an enemy (to freeze it, or to break its shield). */
export const ICE_STRIKE_EXTRA = 1;
/** How far the ice strikes an enemy: straight lines (a plus, like her move, one square further); a block on an empty square reaches the whole 7x7 field. */
export const ICE_STRIKE_RANGE = 3;

const aqna = defineHero('aqna', {
  name: 'Aqna',
  title: 'Winter Hunter',
  cls: 'shield',
  role: 'mage',
  value: 340,
  move: [{ kind: 'slide', dirs: ORTHO, range: 2 }],
  moveText: 'Moves up to 2 squares straight.',
  skill: {
    key: 'icy',
    name: 'Icy Step',
    type: 'active',
    cost: 1,
    range: 3,
    // every square within 3 (7x7) for a block, up to 3 straight (a plus) to strike an enemy; terrain or her own units in the way hide what's behind
    reach: { sight: true, label: 'ice field', inner: { dirs: ORTHO, range: ICE_STRIKE_RANGE } },
    charge: true,
    text: `When she eliminates an enemy she gains an ice charge (one at most; charges don't stack). Spend it in her ice field: an ice block on an empty square within 3 of her, or a strike on an enemy up to 3 squares straight (up, down, left or right, like her move but one further), except where terrain or one of her own units stands in the way; enemies don't block it. Right after the kill, or later as her action on any turn you like. On an empty square (1 rune), it raises an ice block nobody can enter, not even her (up to ${ICE_LIMIT}; after that her oldest block moves). On an enemy (2 runes), the ice freezes it, then shatters: the enemy is eliminated and the square stays open; an enemy shielded by Empty Grave only loses its shield. Cast as her action, it doesn't use up her turn: she may still move afterwards.`,
  },
  short: {
    move: 'Moves up to 2 straight.',
    skill:
      'A kill stores an ice charge. An ice block within 3 (1 rune), or up to 3 straight freeze an enemy until it shatters, or break its shield (2 runes). Allies and terrain block it. She can still move after.',
  },
  ui: {
    targets: 'square',
    aim: 'Icy Step: rose squares can strike an enemy (freeze and shatter, 2 runes); blue ones only take an ice block (1 rune).',
    ready: 'Ice charge ready. Press to choose where to raise it (or Q) — or save it for a later turn.',
    unavailable: (_state, hero) =>
      hero.iceCharge
        ? {
            text: 'No empty square within 3 or enemy up to 3 straight from her (not hidden behind terrain or allies) she can afford.',
          }
        : {
            text: 'No ice charge yet: eliminate an enemy with her to store one (it keeps until spent, and never stacks).',
            charge: true,
          },
  },
  hooks: {
    skillActions: (state, hero) =>
      hero.iceCharge
        ? iceSpots(state, hero).map((to) => ({ type: 'skill', unitId: hero.id, skill: aqna.skill.key, to }))
        : [],
    resolveSkill(state, hero, action, logLines, lastAction) {
      castIce(
        state,
        hero,
        action.to!,
        logLines,
        lastAction,
        'she spends the ice charge she stored from an earlier kill',
      );
    },
    // The ice doesn't use up her turn: she may still move afterwards.
    afterSkill(state, hero) {
      if (hero.rooted || !moveOptions(state, hero).length) return false;
      state.phase = 'icewalk';
      state.pending = { type: 'icewalk', unitId: hero.id };
      return true;
    },
    explainSkill(state, hero) {
      if (!hero.iceCharge)
        return 'Icy Step needs an ice charge: Aqna stores one when she eliminates an enemy (one at a time).';
      return iceRule(state, hero);
    },
    afterAction(state, hero, { killed }) {
      if (killed === 0) return false;
      hero.iceCharge = 1; // never more than one
      if (!iceSpots(state, hero).length) return false;
      state.phase = 'ice';
      state.pending = { type: 'ice', unitId: hero.id };
      return true;
    },
  },
});

/** Runes the ice costs on `to`: more on an enemy. */
const iceCost = (state: State, to: Pos) => aqna.skill.cost + (unitAt(state, to) ? ICE_STRIKE_EXTRA : 0);

/** Squares in her ice field she can afford: empty ones, or enemies (shielded ones too). */
function iceSpots(state: State, hero: Unit): Pos[] {
  return skillReach(state, hero).filter((pos) => {
    if (blockAt(state, pos)) return false;
    const occupant = unitAt(state, pos);
    if (occupant && (occupant.team === hero.team || !inInnerReach(hero, pos))) return false;
    return state.energy[hero.team] >= iceCost(state, pos);
  });
}

/** Why a spot was refused. */
const iceRule = (state: State, hero: Unit) =>
  `Ice goes where Aqna can see, not behind terrain or her allies: an empty square within 3 for ${tokens(aqna.skill.cost)}, or an enemy up to 3 straight for ${tokens(aqna.skill.cost + ICE_STRIKE_EXTRA)} (you have ${state.energy[hero.team]}).`;

/**
 * Spend the ice charge on `to`. On an enemy the ice freezes it, then shatters: the enemy is eliminated and
 * the square stays open. On an empty square it raises a block that nobody can enter.
 */
function castIce(state: State, hero: Unit, to: Pos, logLines: string[], lastAction: LastAction, why: string) {
  const victim = unitAt(state, to);
  hero.iceCharge = 0;
  if (victim) state.energy[hero.team] -= ICE_STRIKE_EXTRA; // striking an enemy costs more than a block
  lastAction.kind = 'ice';
  lastAction.from = { ...hero.pos };
  lastAction.to = { ...to };
  if (victim?.warded) {
    // Empty Grave takes it: the shield shatters, the enemy lives
    victim.warded = false;
    victim.wardTurns = 0;
    lastAction.broke = [victim.id];
    lastAction.hits.push({ ...victim.pos });
    logLines.push(
      `${label(hero)}'s ice shatters the Empty Grave on ${label(victim)}. Icy Step, ${tokens(aqna.skill.cost + ICE_STRIKE_EXTRA)}: ${why}. ${left(state, hero.team)}`,
    );
    return;
  }
  if (victim) {
    lastAction.frozen = victim.id;
    lastAction.hits.push({ ...victim.pos });
    logLines.push(
      `${label(hero)} freezes ${label(victim)} on ${squareName(to)}, and the ice shatters. Icy Step, ${tokens(aqna.skill.cost + ICE_STRIKE_EXTRA)}: ${why}. ${left(state, hero.team)}`,
    );
    eliminate(state, victim, logLines, hero.team);
    return;
  }
  const movedFrom = raiseIce(state, hero, to);
  lastAction.movedIce = movedFrom;
  logLines.push(
    `${movedFrom ? `${label(hero)} moves an ice block to ${squareName(to)}.` : `${label(hero)} raises an ice block on ${squareName(to)}.`} Icy Step, ${tokens(aqna.skill.cost)}: ${why}${movedFrom ? `, and with ${ICE_LIMIT} blocks out her oldest one moved` : ''}. ${left(state, hero.team)}`,
  );
}

/** Put one of Aqna's ice blocks on `to`, spending her charge. Returns the square her oldest block left, if one had to move. */
function raiseIce(state: State, hero: Unit, to: Pos) {
  const herIce = state.iceBy[hero.id] || (state.iceBy[hero.id] = []);
  let movedFrom: string | null = null;
  if (herIce.length >= ICE_LIMIT) {
    movedFrom = herIce.shift()!;
    delete state.blocks[movedFrom];
  }
  state.blocks[key(to)] = { kind: 'ice', owner: hero.id };
  herIce.push(key(to));
  return movedFrom;
}

// Right after Aqna's kill: raise ice with the charge she just gained, or keep it.
definePhase('ice', {
  prompt: (state) =>
    `Icy Step (you have ${state.energy[state.current]}): an empty square for an ice block (${tokens(aqna.skill.cost)}), or an enemy to freeze and shatter (${tokens(aqna.skill.cost + ICE_STRIKE_EXTRA)}). Or skip.`,
  hint: 'Pick a dashed square (a block within 3, an enemy up to 3 straight), or Skip.',
  list(state) {
    const actions: Action[] = iceSpots(state, state.units[state.pending!.unitId!]).map((to) => ({ type: 'ice', to }));
    actions.push({ type: 'skip' });
    return actions;
  },
  resolve(state, action, { previous, logLines, team }) {
    const hero = state.units[state.pending!.unitId!];
    state.phase = 'main';
    state.pending = null;
    if (action.type === 'ice') {
      state.energy[hero.team] -= aqna.skill.cost;
      state.lastAction = {
        team: hero.team,
        unitId: hero.id,
        from: null,
        to: null,
        hits: [],
        kind: 'ice',
        phase: 'ice',
      };
      castIce(state, hero, action.to!, logLines, state.lastAction, 'she just eliminated an enemy');
    } else {
      state.lastAction = { ...previous.lastAction!, kind: 'skip-ice', phase: 'ice' };
      logLines.push(`${label(hero)} keeps her ice charge for a later turn.`);
    }
    pushLog(state, logLines, team);
    checkWinner(state);
    if (state.status === 'playing') endTurn(state);
    return done(state);
  },
  explain: (state, action) =>
    action.type === 'ice' ? iceRule(state, state.units[state.pending!.unitId!]) : "Place Aqna's ice or skip.",
  // Bot: only the spots that hinder an enemy most are worth searching.
  botActions(state, allActions) {
    const enemies = livingUnits(state, other(state.current));
    const nearestEnemy = (pos: Pos) => Math.min(...enemies.map((enemy) => chebyshev(enemy.pos, pos)), 9);
    const spots = allActions
      .filter((action) => action.type === 'ice')
      .map((action) => ({ action, distance: nearestEnemy(action.to!) }))
      .sort((first, second) => first.distance - second.distance)
      .slice(0, 6)
      .map((entry) => entry.action);
    return [...spots, { type: 'skip' }];
  },
});

// Right after Icy Step cast as her action: she may still move (a normal move of hers), or skip.
definePhase('icewalk', {
  unitPhase: true,
  ownMove: true,
  prompt: () => 'Aqna may still move this turn, or skip.',
  hint: 'Move Aqna to a marked square, or Skip.',
  list(state) {
    const hero = state.units[state.pending!.unitId!];
    const actions: Action[] = hero.alive && !hero.rooted ? moveActions(state, hero) : [];
    actions.push({ type: 'skip' });
    return actions;
  },
  resolve(state, action, { previous }) {
    if (action.type !== 'skip') return null; // her move is an ordinary move: the engine resolves it
    state.phase = 'main';
    state.pending = null;
    state.lastAction = { ...previous.lastAction!, kind: 'skip-walk' };
    endTurn(state);
    return done(state);
  },
  explain: (state, _action, unit) =>
    unit && unit.id !== state.pending?.unitId ? 'Only Aqna may move now, after her ice. Or skip.' : undefined,
});
