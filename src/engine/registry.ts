// The engine's lookup tables. Hero files (src/engine/heroes/) fill them in when they load;
// the engine only reads them while a match runs, never at load time.
import type { HeroDef, PhaseDef, Unit, UnitDef } from './types.ts';

// Roles describe how a hero plays: Roam, Fighter and Assassin move 2 (Hexor's L counts as 2 steps), a Mage wins with its skill,
// Support moves 1 but reaches with its skill. A commander (HeroDef.commander) is a second role on top.
export const ROLES: Record<string, string> = {
  roam: 'Roam',
  fighter: 'Fighter',
  mage: 'Mage',
  assassin: 'Assassin',
  support: 'Support',
  commander: 'Commander',
};
export const CLASSES: Record<string, { name: string }> = {
  claw: { name: 'Claw' },
  leaf: { name: 'Leaf' },
  shield: { name: 'Shield' },
};

/** Every hero by id. Picker order is registration order (src/engine/heroes/index.ts). */
export const HEROES: Record<string, HeroDef> = {};
/** Non-hero units by kind (beast, creep). */
export const UNITS: Record<string, UnitDef> = {};
/** Follow-up phases by name (storm, ice, beast). */
export const PHASES: Record<string, PhaseDef> = {};

export function defineHero(heroId: string, definition: HeroDef) {
  if (hasOwnKey(HEROES, heroId)) throw new Error(`Hero defined twice: ${heroId}`);
  HEROES[heroId] = definition;
  return definition;
}
export function defineUnit(kind: string, definition: UnitDef) {
  UNITS[kind] = definition;
  return definition;
}
export function definePhase(phaseName: string, definition: PhaseDef) {
  if (phaseName === 'main' || phaseName === 'react') throw new Error(`Reserved phase: ${phaseName}`);
  PHASES[phaseName] = definition;
  return definition;
}

const hasOwnKey = (object: object, maybeKey: unknown): maybeKey is string =>
  typeof maybeKey === 'string' && Object.prototype.hasOwnProperty.call(object, maybeKey);
/**
 * table[key], but only for the table's own keys. Ids come from clients, and "__proto__" or
 * "toString" must never resolve to something.
 */
export const own = <T>(table: Record<string, T>, maybeKey: unknown): T | undefined =>
  hasOwnKey(table, maybeKey) ? table[maybeKey] : undefined;
export const isHero = (heroId: unknown): heroId is string => hasOwnKey(HEROES, heroId);

/** The definition behind any unit: its hero, or the beast / creep definition. */
export const heroDef = (unit: Unit): UnitDef & Partial<HeroDef> =>
  unit.kind === 'hero' ? HEROES[unit.hero] : UNITS[unit.kind];
/** Is this unit its team's commander (the hero whose fall ends the match)? */
export const isCommander = (unit: Unit) => unit.kind === 'hero' && !!unit.commander;
/** Can this hero lead a team as its commander? */
export const canCommand = (heroId: string) => !!own(HEROES, heroId)?.commander;
/**
 * The hero that commands a team: the first one in pick order that can. A player with two such heroes
 * chooses by putting their commander first (the hero picker does this).
 */
export const commanderOf = (picks: readonly string[]) => picks.find(canCommand) ?? null;
/** Why a team of hero ids can't play, or null when it can: it needs a hero that can command. */
export function teamProblem(picks: readonly string[]): string | null {
  if (commanderOf(picks)) return null;
  const names = Object.keys(HEROES)
    .filter(canCommand)
    .map((heroId) => HEROES[heroId].name)
    .join(' or ');
  return `Pick a commander (${names}).`;
}
export const skillOf = (unit: Unit) => (unit.kind === 'hero' ? own(HEROES, unit.hero)?.skill : undefined);
export const hooksOf = (unit: Unit) => (unit.kind === 'hero' ? own(HEROES, unit.hero)?.hooks : undefined);
