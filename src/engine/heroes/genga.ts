// Ge'nga, Beast Master: starts with a beast that steps right after him (the "beast" phase),
// and can summon it back once it falls.
import type { Action, Pos, State, Unit } from '../types.ts';
import { DIAG, KING, ORTHO, forward, inBounds, squareName } from '../geometry.ts';
import { defineHero, definePhase, defineUnit } from '../registry.ts';
import { beastOf, blockAt, canBeHit, label, left, makeUnit, tokens, unitAt } from '../state.ts';
import { moveActions, moveOptions } from '../movement.ts';
import { done, eliminate, endTurn } from '../turn.ts';

export const BEAST = defineUnit('beast', {
  name: 'Beast',
  title: "Ge'nga's companion",
  cls: 'claw',
  value: 160,
  move: [{ kind: 'slide', dirs: KING, range: 1 }],
  // On its first move the player picks how it moves for the rest of the match (a summon doesn't reset it).
  strides: {
    any: { kind: 'slide', dirs: KING, range: 1 },
    plus: { kind: 'slide', dirs: ORTHO, range: 2 },
    cross: { kind: 'slide', dirs: DIAG, range: 2 },
  },
  moveText:
    "Moves right after Ge'nga acts. On its first move you pick how it moves for the whole match: 1 square in any direction, up to 2 straight (plus), or up to 2 diagonally (cross). That first move may also be its own turn.",
  follower: true,
  idleText: "The beast only acts right after Ge'nga (it moved on its own once already).",
});

/** Ge'nga's dead beast (the unit to bring back), or null while it is alive. */
export const fallenBeastOf = (state: State, genga: Unit) =>
  beastOf(state, genga)
    ? null
    : Object.values(state.units).find((unit) => unit.kind === 'beast' && unit.ownerId === genga.id) || null;

/** Squares next to Ge'nga where his fallen beast can be summoned: empty, or held by an enemy it would crush. */
export function summonSpots(state: State, genga: Unit): Pos[] {
  if (genga.hero !== 'genga' || !fallenBeastOf(state, genga)) return [];
  const spots = [];
  for (const [dRow, dCol] of KING) {
    const pos = { r: genga.pos.r + dRow, c: genga.pos.c + dCol };
    if (!inBounds(pos) || blockAt(state, pos)) continue;
    const occupant = unitAt(state, pos);
    if (!occupant || canBeHit(genga, occupant)) spots.push(pos);
  }
  return spots;
}

const genga = defineHero('genga', {
  name: "Ge'nga",
  title: 'Beast Master',
  cls: 'claw',
  role: 'fighter',
  value: 300,
  move: [{ kind: 'slide', dirs: ORTHO, range: 1 }],
  moveText: 'Steps 1 square straight.',
  skill: {
    key: 'summon',
    name: 'Wild Company',
    type: 'active',
    cost: 3,
    range: 1,
    text: "Starts the match with a beast at his side. Right after Ge'nga acts, the beast may also move (free; it can capture). On its first move you choose how it moves for the whole match, summons included: 1 square any way, up to 2 straight (plus), or up to 2 diagonally (cross). That first move may also be taken on its own as your turn. Active: once the beast has fallen, spend 3 runes to summon it again next to Ge'nga, on an empty square or onto an enemy, which it eliminates. If Ge'nga falls, the beast flees.",
  },
  short: {
    move: 'Steps 1 straight.',
    skill:
      'His beast moves free right after him (its move is picked once, on its first move). 3 runes: summon it back, even onto an enemy.',
  },
  ui: {
    targets: 'square',
    aim: "Tap a highlighted square next to Ge'nga to summon the beast (an enemy there is eliminated).",
    unavailable: (state, hero) => ({
      text: beastOf(state, hero)
        ? 'The beast is still alive: Wild Company only works once it has fallen.'
        : "No square next to Ge'nga to summon the beast: they are all blocked, held by allies or shielded.",
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
      const crushed = unitAt(state, to);
      Object.assign(beast, { alive: true, pos: { ...to }, rooted: 0, warded: false, wardTurns: 0, cd: 0 });
      lastAction.kind = 'summon';
      lastAction.from = { ...hero.pos };
      lastAction.to = { ...to };
      lastAction.hits.push({ ...to });
      lastAction.targetId = beast.id;
      logLines.push(
        `${label(hero)} calls the wild: ${label(beast)} returns on ${squareName(to)}. Wild Company, ${tokens(genga.skill.cost)}: the beast had fallen and ${squareName(to)} is next to Ge'nga. ${left(state, hero.team)}`,
      );
      if (crushed) {
        logLines.push(`${label(beast)} lands on ${label(crushed)}.`);
        eliminate(state, crushed, logLines, hero.team);
      }
    },
    explainSkill(state, hero) {
      if (beastOf(state, hero)) return 'The beast is still alive. Wild Company can only summon it after it falls.';
      return "Summon the beast next to Ge'nga: on an empty square, or onto an enemy that isn't shielded.";
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
      beast.alive && !beast.rooted ? moveActions(state, beast, (option) => !option.backstab) : [];
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
