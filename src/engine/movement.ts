// Basic moves. A hero's `move` lists rules by kind; each kind is one function here, so a new
// way of moving is one entry in MOVE_RULES that any hero can then use.
import type { MoveOption, MoveRule, State, Unit } from './types.ts';
import { KING, forward, inBounds, key } from './geometry.ts';
import { heroDef } from './registry.ts';
import { blockAt, canBeHit, unitAt } from './state.ts';

/** Adds the squares `rule` lets `unit` reach, via `addOption` (duplicates are dropped for you). */
type MoveRuleFn = (state: State, unit: Unit, rule: MoveRule, addOption: (option: MoveOption) => void) => void;

export const MOVE_RULES: Record<string, MoveRuleFn> = {
  // Lines along `dirs` up to `range`: stops at the first unit or terrain, may capture the first enemy.
  slide(state, unit, rule, addOption) {
    for (const [dRow, dCol] of rule.dirs!) {
      for (let step = 1; step <= rule.range!; step++) {
        const to = { r: unit.pos.r + dRow * step, c: unit.pos.c + dCol * step };
        if (!inBounds(to) || blockAt(state, to)) break;
        const occupant = unitAt(state, to);
        if (occupant) {
          if (canBeHit(unit, occupant)) addOption({ to, kills: [occupant.id] });
          break;
        }
        addOption({ to, kills: [] });
      }
    }
  },
  // Fixed jumps over anything.
  leap(state, unit, rule, addOption) {
    for (const [dRow, dCol] of rule.deltas!) {
      const to = { r: unit.pos.r + dRow, c: unit.pos.c + dCol };
      if (!inBounds(to) || blockAt(state, to)) continue;
      const occupant = unitAt(state, to);
      if (!occupant) addOption({ to, kills: [] });
      else if (canBeHit(unit, occupant)) addOption({ to, kills: [occupant.id] });
    }
  },
  // Chess pawn: 1 forward onto an empty square (2 on its first move), captures diagonally forward.
  creep(state, unit, _rule, addOption) {
    const ahead = forward(unit.team);
    for (const dCol of [-1, 1]) {
      const to = { r: unit.pos.r + ahead, c: unit.pos.c + dCol };
      const occupant = inBounds(to) && unitAt(state, to);
      if (occupant && canBeHit(unit, occupant)) addOption({ to, kills: [occupant.id] });
    }
    const oneStep = { r: unit.pos.r + ahead, c: unit.pos.c };
    const oneStepOpen = inBounds(oneStep) && !blockAt(state, oneStep) && !unitAt(state, oneStep);
    if (oneStepOpen) addOption({ to: oneStep, kills: [] });
    if (!unit.moved && oneStepOpen) {
      // first move only, chess-pawn style: both squares must be empty, never a capture
      const twoSteps = { r: unit.pos.r + ahead * 2, c: unit.pos.c };
      if (inBounds(twoSteps) && !blockAt(state, twoSteps) && !unitAt(state, twoSteps))
        addOption({ to: twoSteps, kills: [] });
    }
  },
  // Hasim: in any of the 8 directions, jump over one adjacent unit or terrain onto the square behind
  // it. An enemy jumped over is eliminated, and so is one on the landing square. Costs the hero's skill.
  backstab(state, unit, _rule, addOption) {
    for (const [dRow, dCol] of KING) {
      const jumpedSquare = { r: unit.pos.r + dRow, c: unit.pos.c + dCol };
      const landing = { r: unit.pos.r + 2 * dRow, c: unit.pos.c + 2 * dCol };
      if (!inBounds(jumpedSquare) || !inBounds(landing)) continue;
      const jumped = unitAt(state, jumpedSquare);
      if (!jumped && !blockAt(state, jumpedSquare)) continue; // nothing to jump over
      if (blockAt(state, landing)) continue;
      const landedOn = unitAt(state, landing);
      if (landedOn && !canBeHit(unit, landedOn)) continue;
      const kills = [];
      if (jumped && canBeHit(unit, jumped)) kills.push(jumped.id);
      if (landedOn) kills.push(landedOn.id);
      addOption({
        to: landing,
        kills,
        over: jumped ? jumped.id : null,
        backstab: true,
        cost: heroDef(unit).skill?.cost || 0,
      });
    }
  },
};

/** Every basic-move option for a unit: where it can go and who it eliminates there. Ignores whose turn it is. */
export function moveOptions(state: State, unit: Unit): MoveOption[] {
  const options: MoveOption[] = [];
  const seen = new Set<string>();
  const addOption = (option: MoveOption) => {
    const square = key(option.to);
    if (!seen.has(square)) {
      seen.add(square);
      options.push(option);
    }
  };
  for (const rule of heroDef(unit).move) MOVE_RULES[rule.kind](state, unit, rule, addOption);
  return options;
}
