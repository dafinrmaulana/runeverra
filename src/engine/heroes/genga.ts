// Ge'nga, Beast Master: starts with a beast that steps right after him (the "beast" phase),
// and can summon it back once it falls.
import type { Action, Pos, State, Unit } from '../types.ts';
import { KING, ORTHO, forward, inBounds, squareName } from '../geometry.ts';
import { defineHero, definePhase, defineUnit } from '../registry.ts';
import { beastOf, blockAt, label, left, makeUnit, tokens, unitAt } from '../state.ts';
import { moveOptions } from '../movement.ts';
import { done, endTurn } from '../turn.ts';

export const BEAST = defineUnit('beast', {
  name: 'Beast',
  title: "Ge'nga's companion",
  cls: 'claw',
  value: 150,
  move: [{ kind: 'slide', dirs: KING, range: 1 }],
  moveText: "Steps 1 square in any direction, right after Ge'nga acts.",
  follower: true,
  idleText: "The beast only acts right after Ge'nga.",
});

/** Ge'nga's dead beast (the unit to bring back), or null while it is alive. */
export const fallenBeastOf = (state: State, genga: Unit) =>
  beastOf(state, genga)
    ? null
    : Object.values(state.units).find((unit) => unit.kind === 'beast' && unit.ownerId === genga.id) || null;

/** Empty squares next to Ge'nga where his fallen beast can be summoned. */
export function summonSpots(state: State, genga: Unit): Pos[] {
  if (genga.hero !== 'genga' || !fallenBeastOf(state, genga)) return [];
  const spots = [];
  for (const [dRow, dCol] of KING) {
    const pos = { r: genga.pos.r + dRow, c: genga.pos.c + dCol };
    if (inBounds(pos) && !blockAt(state, pos) && !unitAt(state, pos)) spots.push(pos);
  }
  return spots;
}

const genga = defineHero('genga', {
  name: "Ge'nga",
  title: 'Beast Master',
  cls: 'claw',
  role: 'roam',
  value: 300,
  move: [{ kind: 'slide', dirs: ORTHO, range: 1 }],
  moveText: 'Steps 1 square straight.',
  skill: {
    key: 'summon',
    name: 'Wild Company',
    type: 'active',
    cost: 3,
    range: 1,
    text: "Starts the match with a beast at his side. Right after Ge'nga acts, the beast may also step 1 square in any direction (free; it can capture, but has no special moves). Active: once the beast has fallen, spend 3 runes to summon it again on an empty square next to Ge'nga. If Ge'nga falls, the beast flees.",
  },
  short: {
    move: 'Steps 1 straight.',
    skill: 'His beast steps 1 any way, free, right after him. 3 runes: summon it back once it falls.',
  },
  ui: {
    targets: 'square',
    aim: "Tap a highlighted square next to Ge'nga to summon the beast.",
    unavailable: (state, hero) => ({
      text: beastOf(state, hero)
        ? 'The beast is still alive: Wild Company only works once it has fallen.'
        : "No empty square next to Ge'nga to summon the beast.",
    }),
  },
  hooks: {
    spawn(units, hero) {
      const id = `${hero.team}-beast`;
      const besideHim = { r: hero.pos.r + forward(hero.team), c: hero.pos.c };
      units[id] = { ...makeUnit(id, hero.team, 'beast', 'beast', besideHim), ownerId: hero.id };
    },
    onEliminated(state, hero, logLines) {
      const beast = beastOf(state, hero);
      if (beast) {
        beast.alive = false;
        logLines.push(`${label(beast)} flees the battlefield.`);
      }
    },
    skillActions: (state, hero) =>
      summonSpots(state, hero).map((to) => ({ type: 'skill', unitId: hero.id, skill: genga.skill.key, to })),
    resolveSkill(state, hero, action, logLines, lastAction) {
      const beast = fallenBeastOf(state, hero)!;
      const to = action.to!;
      Object.assign(beast, { alive: true, pos: { ...to }, rooted: 0, warded: false, cd: 0 });
      lastAction.kind = 'summon';
      lastAction.from = { ...hero.pos };
      lastAction.to = { ...to };
      lastAction.hits.push({ ...to });
      lastAction.targetId = beast.id;
      logLines.push(
        `${label(hero)} calls the wild: ${label(beast)} returns on ${squareName(to)}. Wild Company, ${tokens(genga.skill.cost)}: the beast had fallen and ${squareName(to)} is next to Ge'nga. ${left(state, hero.team)}`,
      );
    },
    explainSkill(state, hero) {
      if (beastOf(state, hero)) return 'The beast is still alive. Wild Company can only summon it after it falls.';
      return "Summon the beast on an empty square next to Ge'nga.";
    },
    afterAction(state, hero) {
      const beast = beastOf(state, hero);
      if (!beast || beast.rooted || !moveOptions(state, beast).length) return false;
      state.phase = 'beast';
      state.pending = { type: 'beast', unitId: beast.id };
      return true;
    },
  },
});

// Right after Ge'nga acts, his beast may step (a normal unit move) or skip.
definePhase('beast', {
  unitPhase: true,
  prompt: () => 'Wild Company: move the beast now (free), or skip.',
  hint: 'Move the beast to a marked square, or Skip.',
  list(state) {
    const beast = state.units[state.pending!.unitId!];
    const actions: Action[] =
      beast.alive && !beast.rooted
        ? moveOptions(state, beast)
            .filter((option) => !option.backstab)
            .map((option) => ({ type: 'move', unitId: beast.id, to: option.to }))
        : [];
    actions.push({ type: 'skip' });
    return actions;
  },
  resolve(state, action, { previous }) {
    if (action.type !== 'skip') return null; // a step is an ordinary move: the engine resolves it
    state.phase = 'main';
    state.pending = null;
    state.lastAction = { ...previous.lastAction!, kind: 'skip-beast' };
    endTurn(state);
    return done(state);
  },
  explain: (_state, _action, unit) =>
    unit && unit.kind !== 'beast' ? 'The beast acts now. Move it or skip.' : undefined,
});
