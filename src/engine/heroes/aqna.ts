// Aqna, Winter Hunter: a kill stores an ice charge, spent to raise an ice block — right after
// the kill (the "ice" phase) or later as her skill.
import type { Action, LastAction, Pos, State, Unit } from '../types.ts';
import { ORTHO, allSquares, chebyshev, key, other, squareName } from '../geometry.ts';
import { defineHero, definePhase } from '../registry.ts';
import { blockAt, canBeHit, label, left, livingUnits, pushLog, tokens, unitAt } from '../state.ts';
import { checkWinner, done, eliminate, endTurn } from '../turn.ts';
import { moveActions, moveOptions } from '../movement.ts';

/** Ice blocks Aqna can have out at once; past it her oldest one moves to the new spot. */
export const ICE_LIMIT = 10;

const aqna = defineHero('aqna', {
  name: 'Aqna',
  title: 'Winter Hunter',
  cls: 'shield',
  role: 'roam',
  value: 340,
  move: [{ kind: 'slide', dirs: ORTHO, range: 3 }],
  moveText: 'Moves up to 3 squares straight.',
  skill: {
    key: 'icy',
    name: 'Icy Step',
    type: 'active',
    cost: 1,
    range: 3,
    charge: true,
    text: `When she eliminates an enemy she gains an ice charge (one at most; charges don't stack). Spend it with 1 rune on a square up to 3 away: right after the kill, or later as her action on any turn you like. On an enemy (not one shielded by Empty Grave), the ice freezes it, then shatters: the enemy is eliminated and the square stays open. On an empty square, it raises an ice block that nobody can enter, not even her (up to ${ICE_LIMIT}; after that her oldest block moves). Cast as her action, it doesn't use up her turn: she may still move afterwards.`,
  },
  short: {
    move: 'Moves up to 3 straight.',
    skill:
      'A kill stores an ice charge. 1 rune, within 3: freeze an enemy until it shatters (eliminated), or raise an ice block on an empty square. She can still move after.',
  },
  ui: {
    targets: 'square',
    aim: 'Icy Step: tap an enemy to freeze and shatter it, or an empty square to raise an ice block.',
    ready: 'Ice charge ready. Press to choose where to raise it (or Q) — or save it for a later turn.',
    unavailable: (_state, hero) =>
      hero.iceCharge
        ? { text: `No empty square or open enemy within ${aqna.skill.range} squares for the ice block.` }
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
    explainSkill(_state, hero) {
      if (!hero.iceCharge)
        return 'Icy Step needs an ice charge: Aqna stores one when she eliminates an enemy (one at a time).';
      return "Ice must go within 3 of Aqna, on an empty square or an enemy that isn't shielded.";
    },
    afterAction(state, hero, { killed }) {
      if (killed === 0) return false;
      hero.iceCharge = 1; // never more than one
      if (!iceSpots(state, hero).length || state.energy[hero.team] < aqna.skill.cost) return false;
      state.phase = 'ice';
      state.pending = { type: 'ice', unitId: hero.id };
      return true;
    },
  },
});

/** Squares within Icy Step's range of Aqna for ice: empty, or an enemy the ice would eliminate. */
function iceSpots(state: State, hero: Unit): Pos[] {
  return allSquares().filter((pos) => {
    if (chebyshev(pos, hero.pos) > aqna.skill.range! || blockAt(state, pos)) return false;
    const occupant = unitAt(state, pos);
    return !occupant || canBeHit(hero, occupant);
  });
}

/**
 * Spend the ice charge on `to`. On an enemy the ice freezes it, then shatters: the enemy is eliminated and
 * the square stays open. On an empty square it raises a block that nobody can enter.
 */
function castIce(state: State, hero: Unit, to: Pos, logLines: string[], lastAction: LastAction, why: string) {
  const victim = unitAt(state, to);
  hero.iceCharge = 0;
  lastAction.kind = 'ice';
  lastAction.from = { ...hero.pos };
  lastAction.to = { ...to };
  if (victim) {
    lastAction.frozen = victim.id;
    lastAction.hits.push({ ...victim.pos });
    logLines.push(
      `${label(hero)} freezes ${label(victim)} on ${squareName(to)}, and the ice shatters. Icy Step, ${tokens(aqna.skill.cost)}: ${why}. ${left(state, hero.team)}`,
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
    `Icy Step for ${tokens(aqna.skill.cost)} (you have ${state.energy[state.current]}): tap an enemy to freeze and shatter it, or an empty square for an ice block. Or skip.`,
  hint: 'Pick a dashed square within 3 of Aqna, or Skip.',
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
  explain: (_state, action) =>
    action.type === 'ice'
      ? "Ice must go within 3 of Aqna, on an empty square or an enemy that isn't shielded."
      : "Place Aqna's ice block or skip.",
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
