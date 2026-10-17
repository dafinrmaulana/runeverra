// Runeverra rules engine: pure, deterministic functions over one game state. No DOM, no randomness.
// Every mutator returns a NEW state and never changes its input. Heroes plug in from ./heroes/.
import './heroes/index.ts'; // registers the roster before anything below is used

export type * from './types.ts';
export * from './geometry.ts';
export {
  ROLES,
  CLASSES,
  HEROES,
  UNITS,
  PHASES,
  defineHero,
  defineUnit,
  definePhase,
  heroDef,
  skillOf,
  isHero,
  own,
} from './registry.ts';
export { MODES, ENERGY, TEAM_SIZE } from './modes.ts';
export type { Mode } from './modes.ts';
export { MAPS } from './maps.ts';
export type { MapDef } from './maps.ts';
export { livingUnits, livingHeroes, unitAt, blockAt, label, toMove, beastOf } from './state.ts';
export { MOVE_RULES, moveOptions } from './movement.ts';
export { skillCooldown, skillReach, inSkillReach, skillTargets, skillActions } from './skills.ts';
export { CREEPS, HERO_BOUNTY, bountyFor } from './turn.ts';
export { CREEP, SLOTS, createMatch } from './match.ts';
export type { MatchOptions } from './match.ts';
export { listActions, validateAction, applyAction, getThreats } from './rules.ts';
export { BEAST, fallenBeastOf, summonSpots, ICE_LIMIT } from './heroes/index.ts';
