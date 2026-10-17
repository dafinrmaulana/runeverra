// Hexor, Iron Knight: after a kill he may slam (the "storm" phase), pushing the units around him.
import type { Pos, Push, State, Unit } from '../types.ts';
import { BOARD_SIZE, DIAG, KING, KNIGHT, ORTHO, inBounds, samePos } from '../geometry.ts';
import { defineHero, definePhase } from '../registry.ts';
import { blockAt, label, left, pushLog, tokens, unitAt } from '../state.ts';
import { checkWinner, done, endTurn } from '../turn.ts';

// Storm Hammer pushes each unit in its pattern this many squares away from Hexor.
const STORM_PUSH = 2;

const hexor = defineHero('hexor', {
  name: 'Hexor',
  title: 'Iron Knight',
  cls: 'shield',
  role: 'roam',
  value: 350,
  move: [{ kind: 'leap', deltas: KNIGHT }],
  moveText: 'Jumps in an L, like a chess knight.',
  skill: {
    key: 'storm',
    name: 'Storm Hammer',
    type: 'follow',
    cost: 2,
    range: 1,
    text: "After Hexor eliminates an enemy, you may spend runes to slam: pick a pattern, + (straight) or X (diagonal), and every unit on those 4 squares around him is pushed 2 squares away. If terrain, the board edge or another unit is in the way, it stops on the last empty square; if it can't move straight at all, it slides into an empty square beside it instead (holding its ground only when there is none). Nobody is ever eliminated by the slam itself.",
  },
  short: {
    move: 'Jumps in an L, like a knight.',
    skill: 'After a kill, 2 runes: slam the 4 squares around him (+ or X), pushing units 2 squares away.',
  },
  hooks: {
    afterAction(state, hero, { killed }) {
      if (killed === 0 || state.energy[hero.team] < hexor.skill.cost) return false;
      state.phase = 'storm';
      state.pending = { type: 'storm', unitId: hero.id };
      return true;
    },
  },
});

/**
 * A pushed unit that can't move even 1 square straight away slides into an empty square next to
 * it instead, never toward Hexor: first the two squares angled away from him, then the two to the
 * side. Between two equal choices, the one nearer the middle of the board wins. Null if none.
 */
function stormSidestep(state: State, from: Pos, push: { dRow: number; dCol: number }) {
  const middle = (BOARD_SIZE - 1) / 2;
  const distanceToMiddle = (pos: Pos) => (pos.r - middle) ** 2 + (pos.c - middle) ** 2;
  const choices = [];
  for (const [dRow, dCol] of KING) {
    if (dRow === push.dRow && dCol === push.dCol) continue; // the blocked push itself
    const dot = dRow * push.dRow + dCol * push.dCol;
    if (dot < 0) continue; // toward Hexor
    const cos = dot / (Math.hypot(dRow, dCol) * Math.hypot(push.dRow, push.dCol));
    const tier = cos > 0.5 ? 0 : 1; // angled away first, then sideways
    const pos = { r: from.r + dRow, c: from.c + dCol };
    if (inBounds(pos) && !blockAt(state, pos) && !unitAt(state, pos))
      choices.push({ pos, tier, distance: distanceToMiddle(pos) });
  }
  choices.sort((first, second) => first.tier - second.tier || first.distance - second.distance);
  return choices[0]?.pos || null;
}

/**
 * Storm Hammer: the 4 units next to Hexor in the chosen pattern (+ straight, X diagonal) are
 * pushed up to STORM_PUSH squares straight away from him. Terrain, the board edge or another unit
 * stops a push early: the unit takes whatever empty squares are left. If not even 1 is left, it
 * slides into an empty square beside it (stormSidestep), or holds its ground when there is none.
 * Nobody is ever eliminated by the slam itself, and a warded unit holds its ground.
 * Returns each push, for the animation.
 */
function stormHammer(state: State, caster: Unit, pattern: string | undefined): Push[] {
  const pushes: Push[] = [];
  const center = caster.pos;
  for (const [dRow, dCol] of pattern === 'x' ? DIAG : ORTHO) {
    const square = { r: center.r + dRow, c: center.c + dCol };
    if (!inBounds(square)) continue;
    const unit = unitAt(state, square);
    if (!unit || unit.id === caster.id) continue;
    const from = { ...unit.pos };
    let to = from;
    if (!unit.warded) {
      for (let step = 1; step <= STORM_PUSH; step++) {
        const next = { r: from.r + dRow * step, c: from.c + dCol * step };
        if (!inBounds(next) || blockAt(state, next) || unitAt(state, next)) break;
        to = next;
      }
      if (samePos(to, from)) to = stormSidestep(state, from, { dRow, dCol }) || from;
    }
    if (samePos(to, from)) {
      pushes.push({ id: unit.id, from, to: { ...from }, blocked: true });
    } else {
      pushes.push({ id: unit.id, from, to: { ...to } });
      unit.pos = { ...to };
    }
  }
  return pushes;
}

// Right after Hexor's kill: slam in a + or an X, or skip.
definePhase('storm', {
  prompt: (state) =>
    `Storm Hammer: slam for ${tokens(hexor.skill.cost)} (you have ${state.energy[state.current]}) and push the 4 units in a pattern around Hexor 2 squares away, or skip.`,
  hint: 'Choose Slam or Skip.',
  list: () => [{ type: 'storm', pattern: 'plus' }, { type: 'storm', pattern: 'x' }, { type: 'skip' }],
  resolve(state, action, { previous, logLines }) {
    const hero = state.units[state.pending!.unitId!];
    state.phase = 'main';
    state.pending = null;
    if (action.type === 'storm') {
      const cost = hexor.skill.cost;
      state.energy[hero.team] -= cost;
      logLines.push(
        `${label(hero)}'s Storm Hammer shakes the ground in a ${action.pattern === 'x' ? 'X' : '+'}. Storm Hammer, ${tokens(cost)}: he just eliminated an enemy. ${left(state, hero.team)}`,
      );
      const from = { ...hero.pos };
      const storm = stormHammer(state, hero, action.pattern);
      state.lastAction = {
        team: hero.team,
        unitId: hero.id,
        from,
        to: { ...from },
        hits: [],
        kind: 'storm',
        phase: 'storm',
        storm,
        pattern: action.pattern,
      };
      pushLog(state, logLines, hero.team);
      checkWinner(state);
      if (state.status !== 'playing') return done(state);
    } else {
      state.lastAction = { ...previous.lastAction!, kind: 'skip-storm' };
    }
    endTurn(state);
    return done(state);
  },
  explain: () => 'Choose a Storm Hammer pattern (+ or X), or skip.',
});
