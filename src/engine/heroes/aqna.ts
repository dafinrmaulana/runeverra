// Aqna, Winter Hunter: a kill stores an ice charge, spent to raise an ice block — right after
// the kill (the "ice" phase) or later as her skill.
import type { Action, Pos, State, Unit } from '../types.ts';
import { ORTHO, allSquares, chebyshev, key, other, squareName } from '../geometry.ts';
import { defineHero, definePhase } from '../registry.ts';
import { blockAt, label, left, livingUnits, pushLog, tokens, unitAt } from '../state.ts';
import { done, endTurn } from '../turn.ts';

/** Ice blocks Aqna can have out at once; past it her oldest one moves to the new spot. */
export const ICE_LIMIT = 10;

const aqna = defineHero('aqna', {
  name: 'Aqna',
  title: 'Winter Hunter',
  cls: 'shield',
  role: 'roam',
  value: 340,
  move: [{ kind: 'slide', dirs: ORTHO, range: 2 }],
  moveText: 'Moves up to 2 squares straight.',
  skill: {
    key: 'icy',
    name: 'Icy Step',
    type: 'active',
    cost: 1,
    range: 3,
    charge: true,
    text: `When she eliminates an enemy she gains an ice charge (one at most; charges don't stack). Spend it with 1 rune to raise an ice block up to 3 squares away: right after the kill, or later as her action on any turn you like. Nobody can enter ice, including her. Up to ${ICE_LIMIT} blocks; after that her oldest block moves to the new spot.`,
  },
  short: {
    move: 'Moves up to 2 straight.',
    skill:
      'A kill stores an ice charge (never stacks). Spend it anytime, 1 rune: raise a block within 3 that nobody can pass.',
  },
  ui: {
    targets: 'square',
    aim: 'Icy Step: tap a highlighted square to raise ice.',
    ready: 'Ice charge ready. Press to choose where to raise it (or Q) — or save it for a later turn.',
    unavailable: (_state, hero) =>
      hero.iceCharge
        ? { text: `No empty square within ${aqna.skill.range} squares for the ice block.` }
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
      const to = action.to!;
      const movedFrom = raiseIce(state, hero, to);
      lastAction.kind = 'ice';
      lastAction.from = { ...hero.pos };
      lastAction.to = { ...to };
      lastAction.movedIce = movedFrom;
      logLines.push(
        `${movedFrom ? `${label(hero)} moves an ice block to ${squareName(to)}.` : `${label(hero)} raises an ice block on ${squareName(to)}.`} Icy Step, ${tokens(aqna.skill.cost)}: she spends the ice charge she stored from an earlier kill. ${left(state, hero.team)}`,
      );
    },
    explainSkill(_state, hero) {
      if (!hero.iceCharge)
        return 'Icy Step needs an ice charge: Aqna stores one when she eliminates an enemy (one at a time).';
      return 'Ice must go on an empty square within 3 of Aqna.';
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

/** Empty squares within Icy Step's range of Aqna. */
function iceSpots(state: State, hero: Unit): Pos[] {
  return allSquares().filter(
    (pos) => chebyshev(pos, hero.pos) <= aqna.skill.range! && !unitAt(state, pos) && !blockAt(state, pos),
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
  hero.iceCharge = 0;
  return movedFrom;
}

// Right after Aqna's kill: raise ice with the charge she just gained, or keep it.
definePhase('ice', {
  prompt: (state) =>
    `Icy Step: tap a dashed square to raise ice for ${tokens(aqna.skill.cost)} (you have ${state.energy[state.current]}), or skip.`,
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
      const to = action.to!;
      state.energy[hero.team] -= aqna.skill.cost;
      const movedFrom = raiseIce(state, hero, to);
      state.lastAction = {
        team: hero.team,
        unitId: hero.id,
        from: { ...hero.pos },
        to: { ...to },
        hits: [],
        kind: 'ice',
        phase: 'ice',
        movedIce: movedFrom,
      };
      logLines.push(
        `${movedFrom ? `${label(hero)} moves an ice block to ${squareName(to)}.` : `${label(hero)} raises an ice block on ${squareName(to)}.`} Icy Step, ${tokens(aqna.skill.cost)}: she just eliminated an enemy${movedFrom ? `, and with ${ICE_LIMIT} blocks out her oldest one moved` : ''}. ${left(state, hero.team)}`,
      );
    } else {
      state.lastAction = { ...previous.lastAction!, kind: 'skip-ice', phase: 'ice' };
      logLines.push(`${label(hero)} keeps her ice charge for a later turn.`);
    }
    pushLog(state, logLines, team);
    endTurn(state);
    return done(state);
  },
  explain: (_state, action) =>
    action.type === 'ice' ? 'Ice must go on an empty square within 3 of Aqna.' : "Place Aqna's ice block or skip.",
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
