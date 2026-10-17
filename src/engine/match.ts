// Setting up a match: heroes on their slots, creeps on the flank lanes, the map's terrain.
import type { Block, State, Team, Unit } from './types.ts';
import { BOARD_SIZE, FILES, TEAMS, key, parseSquare } from './geometry.ts';
import { HEROES, commanderOf, defineUnit, isHero, own } from './registry.ts';
import { makeUnit } from './state.ts';
import { CREEPS } from './turn.ts';
import { MAPS } from './maps.ts';
import { MODES } from './modes.ts';

export const CREEP = defineUnit('creep', {
  name: 'Creep',
  title: 'Minion',
  cls: 'claw',
  value: 80,
  move: [{ kind: 'creep' }],
  moveText:
    'Steps 1 square forward onto an empty square, or captures an enemy diagonally in front; 2 squares forward on its first move, if both squares are empty. Never moves back or sideways.',
});

/** Starting squares, in pick order. */
export const SLOTS: Record<Team, string[]> = { p1: ['c1', 'd1', 'e1', 'f1'], p2: ['f8', 'e8', 'd8', 'c8'] };

export type MatchOptions = {
  p1?: string[];
  p2?: string[]; // hero ids in pick order
  map?: string;
  seed?: number;
  creeps?: boolean; // defaults to the mode's
  clockMs?: number; // per side; 0 = untimed (the clock itself lives outside the engine)
  mode?: string; // a key of MODES
};

export function createMatch({
  p1,
  p2,
  map = 'oasis',
  seed = 0,
  creeps,
  clockMs = 0,
  mode = 'classic',
}: MatchOptions = {}): State {
  const gameMode = own(MODES, mode) || MODES.classic;
  const withCreeps = creeps ?? gameMode.creeps;
  const teams = { p1: p1 || ['hasim', 'hexor', 'magumba', 'plantae'], p2: p2 || ['genga', 'aqna', 'plantae', 'hasim'] };
  const units: Record<string, Unit> = {};
  for (const team of TEAMS) {
    const picks = teams[team];
    if (!Array.isArray(picks) || picks.length !== gameMode.teamSize)
      throw new Error(`Each team needs exactly ${gameMode.teamSize} heroes.`);
    if (new Set(picks).size !== gameMode.teamSize) throw new Error('A team cannot pick the same hero twice.');
    const commander = commanderOf(picks);
    picks.forEach((heroId, slot) => {
      if (!isHero(heroId)) throw new Error(`Unknown hero: ${heroId}`);
      const id = `${team}-${heroId}`;
      units[id] = makeUnit(id, team, heroId, 'hero', parseSquare(SLOTS[team][slot]));
      if (heroId === commander) units[id].commander = true;
      HEROES[heroId].hooks?.spawn?.(units, units[id]);
    });
  }
  if (withCreeps) {
    for (const file of CREEPS.files) {
      const ivorySquare = parseSquare(`${file}2`);
      units[`p1-creep-${file}`] = makeUnit(`p1-creep-${file}`, 'p1', 'creep', 'creep', ivorySquare);
      const emberSquare = { r: 7 - ivorySquare.r, c: 7 - ivorySquare.c };
      const emberFile = FILES[emberSquare.c];
      units[`p2-creep-${emberFile}`] = makeUnit(`p2-creep-${emberFile}`, 'p2', 'creep', 'creep', emberSquare);
    }
  }
  const blocks: Record<string, Block> = {};
  const battlefield = own(MAPS, map) || MAPS.oasis;
  for (const [kind, squares] of Object.entries(battlefield.blocks)) {
    for (const name of squares) {
      const pos = parseSquare(name);
      blocks[key(pos)] = { kind };
      blocks[key({ r: 7 - pos.r, c: 7 - pos.c })] = { kind }; // the mirrored half
    }
  }
  const { start } = gameMode.energy;
  return {
    size: BOARD_SIZE,
    turn: 1,
    current: 'p1',
    status: 'playing',
    phase: 'main',
    pending: null,
    map,
    teams,
    seed,
    setup: { p1: teams.p1, p2: teams.p2, map, seed, creeps: withCreeps, clockMs, mode },
    trail: [],
    rules: { mode, teamSize: gameMode.teamSize, energy: { ...gameMode.energy } },
    energy: { p1: start, p2: start },
    units,
    blocks,
    iceBy: {},
    log: [{ turn: 0, team: null, text: `Match begins on ${battlefield.name}. Ivory moves first.` }],
    lastAction: null,
  };
}
