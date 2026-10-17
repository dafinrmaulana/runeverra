// Where skills reach and which casts are legal. What a skill does lives with its hero.
import type { Action, Pos, Skill, State, Unit } from './types.ts';
import { forward, inBounds, samePos } from './geometry.ts';
import { hooksOf, skillOf } from './registry.ts';
import { blockAt, unitAt } from './state.ts';

/** Turns until a hero's active skill is ready again (0 = ready). */
export const skillCooldown = (unit: Unit) => unit.cd || 0;

/**
 * The squares a hero's skill reaches from where it stands. A skill with `reach.cells` covers a fixed
 * shape; with `reach.ray` it follows its directions square by square, up to `range`, stopping at
 * terrain and at the first unit (which it reaches); any other skill with a `range` covers every
 * square within that many steps.
 */
export function skillReach(state: State, caster: Unit, skill: Skill | undefined = skillOf(caster)): Pos[] {
  if (!skill?.range) return [];
  const squares: Pos[] = [];
  if (skill.reach?.cells) {
    // [depth, side]: depth is steps toward the enemy side (flipped per team), side is columns
    // left(-)/right(+), the same for both teams. Nothing in between blocks it — it's not a line
    // of sight, it's a shape stamped on the board.
    const ahead = forward(caster.team);
    for (const [depth, side] of skill.reach.cells) {
      const pos = { r: caster.pos.r + ahead * depth, c: caster.pos.c + side };
      if (inBounds(pos)) squares.push(pos);
    }
    return squares;
  }
  if (skill.reach?.ray) {
    for (const [dRow, dCol] of skill.reach.dirs!) {
      for (let step = 1; step <= skill.range; step++) {
        const pos = { r: caster.pos.r + dRow * step, c: caster.pos.c + dCol * step };
        if (!inBounds(pos) || blockAt(state, pos)) break;
        squares.push(pos);
        if (unitAt(state, pos)) break;
      }
    }
    return squares;
  }
  for (let r = caster.pos.r - skill.range; r <= caster.pos.r + skill.range; r++) {
    for (let c = caster.pos.c - skill.range; c <= caster.pos.c + skill.range; c++) {
      const pos = { r, c };
      if (inBounds(pos) && !samePos(pos, caster.pos)) squares.push(pos);
    }
  }
  return squares;
}
export const inSkillReach = (state: State, caster: Unit, pos: Pos) =>
  skillReach(state, caster).some((square) => samePos(square, pos));

/** Units a hero's targeted active skill could be cast on, ignoring runes and roots. */
export function skillTargets(state: State, hero: Unit): string[] {
  const skill = skillOf(hero);
  if (!skill || skill.type !== 'active' || skillCooldown(hero) > 0) return [];
  return hooksOf(hero)?.skillTargets?.(state, hero) ?? [];
}

/** Every legal active-skill action for a hero right now (ignores whose turn it is). */
export function skillActions(state: State, hero: Unit): Action[] {
  const skill = skillOf(hero);
  if (
    !skill ||
    skill.type !== 'active' ||
    hero.rooted ||
    skillCooldown(hero) > 0 ||
    state.energy[hero.team] < skill.cost
  )
    return [];
  const hooks = hooksOf(hero);
  if (hooks?.skillActions) return hooks.skillActions(state, hero);
  return skillTargets(state, hero).map((targetId) => ({ type: 'skill', unitId: hero.id, skill: skill.key, targetId }));
}
