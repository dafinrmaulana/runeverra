// Adventure: hand-made levels against monsters, each with its own board and goal (escort a caravan,
// clear the monsters, hold out, slay a brute). Ivory (p1) is the player, Ember (p2) the monsters, played
// by the bot. A level is data: createMatch builds it from `setup.quest`, and checkWinner asks questResult.
import type { Block, State, Team, Unit } from './types.ts';
import { DIAG, KING, ORTHO, TEAM_NAMES, chebyshev, key, parseSquare } from './geometry.ts';
import { HEROES, commanderOf, defineUnit, heroDef, isCommander, own } from './registry.ts';
import { livingHeroes, livingUnits, makeUnit } from './state.ts';
import { MAPS } from './maps.ts';
import { ENERGY } from './modes.ts';

// ---------- the monsters and the caravan ----------
defineUnit('goblin', {
  name: 'Goblin',
  title: 'Raider',
  cls: 'claw',
  value: 90,
  move: [{ kind: 'slide', dirs: KING, range: 1 }],
  moveText: 'Steps 1 square in any direction.',
});
defineUnit('wolf', {
  name: 'Dire Wolf',
  title: 'Hunter',
  cls: 'claw',
  value: 140,
  move: [
    { kind: 'slide', dirs: ORTHO, range: 2 },
    { kind: 'slide', dirs: DIAG, range: 1 },
  ],
  moveText: 'Runs up to 2 squares straight, or 1 diagonally.',
});
defineUnit('brute', {
  name: 'Brute',
  title: 'Cave Ogre',
  cls: 'shield',
  value: 380,
  hide: true,
  move: [{ kind: 'slide', dirs: KING, range: 1 }],
  moveText: 'Steps 1 square in any direction. Its thick hide takes the first blow (like Empty Grave).',
});
defineUnit('caravan', {
  name: 'Caravan',
  title: 'Merchant wagon',
  cls: 'shield',
  value: 500,
  move: [{ kind: 'walk', dirs: ORTHO, range: 1 }],
  moveText: 'Rolls 1 square straight. It never attacks. Bring it to the far edge.',
});

// ---------- the levels ----------
export type QuestGoal =
  | { kind: 'escort' } // the caravan reaches the far rank
  | { kind: 'exterminate' } // every monster is down
  | { kind: 'survive'; rounds: number } // the commander still stands after this many rounds
  | { kind: 'slay'; target: string }; // this monster type falls

export type Quest = {
  id: string;
  name: string;
  story: string;
  goalText: string;
  map: string; // theme and art; its terrain unless `blocks` is given
  blocks?: Record<string, string[]>; // exact terrain squares (not mirrored)
  heroes: [string, string][]; // [hero id, square], the first commander listed leads
  monsters: [string, string][]; // [monster type, square]
  caravan?: string; // its square
  energy: number; // the player's starting runes
  rounds?: number; // lose when this many rounds pass first
  goal: QuestGoal;
};

export const QUESTS: Quest[] = [
  {
    id: 'road-out',
    name: 'The Road Out',
    story: 'Goblins block the road out of the village. The merchants must get through.',
    goalText: 'Bring the caravan to the far edge within 20 rounds.',
    map: 'field',
    heroes: [
      ['plantae', 'c1'],
      ['hexor', 'e1'],
      ['hasim', 'd2'],
    ],
    caravan: 'd1',
    monsters: [
      ['goblin', 'c6'],
      ['goblin', 'e6'],
      ['goblin', 'd7'],
    ],
    energy: 4,
    rounds: 20,
    goal: { kind: 'escort' },
  },
  {
    id: 'goblin-den',
    name: 'Goblin Den',
    story: 'The raiders came from the old ruins. Clear them out for good.',
    goalText: 'Take down every monster within 25 rounds.',
    map: 'jungle',
    heroes: [
      ['magumba', 'd1'],
      ['aqna', 'c1'],
      ['hasim', 'e1'],
    ],
    monsters: [
      ['goblin', 'b6'],
      ['goblin', 'd6'],
      ['goblin', 'f6'],
      ['goblin', 'g7'],
      ['wolf', 'e8'],
    ],
    energy: 4,
    rounds: 25,
    goal: { kind: 'exterminate' },
  },
  {
    id: 'hold-the-line',
    name: 'Hold the Line',
    story: 'A pack is coming down from the hills. Hold the crossing until dawn.',
    goalText: 'Keep your commander alive for 10 rounds.',
    map: 'savanna',
    heroes: [
      ['plantae', 'd1'],
      ['hexor', 'c2'],
      ['genga', 'f1'],
    ],
    monsters: [
      ['goblin', 'a7'],
      ['goblin', 'c7'],
      ['goblin', 'e7'],
      ['goblin', 'g7'],
      ['wolf', 'b8'],
      ['wolf', 'h8'],
    ],
    energy: 4,
    goal: { kind: 'survive', rounds: 10 },
  },
  {
    id: 'the-brute',
    name: 'The Brute',
    story: 'An ogre leads the raids now. Its hide turns the first blade: strike twice.',
    goalText: 'Slay the Brute within 25 rounds.',
    map: 'keep',
    heroes: [
      ['magumba', 'd1'],
      ['hasim', 'c1'],
      ['aqna', 'e1'],
      ['hexor', 'f1'],
    ],
    monsters: [
      ['brute', 'd7'],
      ['goblin', 'c6'],
      ['goblin', 'e6'],
      ['goblin', 'f7'],
    ],
    energy: 4,
    rounds: 25,
    goal: { kind: 'slay', target: 'brute' },
  },
  {
    id: 'the-pass',
    name: 'The Pass',
    story: 'One last caravan must cross the desert pass, and the ogre waits at the top.',
    goalText: 'Bring the caravan to the far edge within 24 rounds.',
    map: 'oasis',
    heroes: [
      ['plantae', 'd1'],
      ['genga', 'c1'],
      ['aqna', 'f1'],
      ['hasim', 'f2'],
    ],
    caravan: 'e1',
    monsters: [
      ['wolf', 'c7'],
      ['wolf', 'f7'],
      ['goblin', 'b6'],
      ['goblin', 'g6'],
      ['goblin', 'e7'],
      ['brute', 'e8'],
    ],
    energy: 4,
    rounds: 24,
    goal: { kind: 'escort' },
  },
];

const BY_ID = Object.fromEntries(QUESTS.map((quest) => [quest.id, quest]));
export const questById = (questId: unknown) => own(BY_ID, questId) ?? null;
/** The level a match is played on, or null for a normal match. */
export const questOf = (state: State) => questById(state.rules?.quest);
/** Rounds played so far: each side moving once is one round. */
export const roundOf = (state: State) => Math.ceil(state.turn / 2);

/** The board for a level: its heroes (spawn hooks included), monsters, caravan and terrain. */
export function buildQuest(quest: Quest): Pick<State, 'units' | 'blocks' | 'teams'> {
  const units: Record<string, Unit> = {};
  const leader = commanderOf(quest.heroes.map(([heroId]) => heroId));
  for (const [heroId, square] of quest.heroes) {
    const id = `p1-${heroId}`;
    units[id] = makeUnit(id, 'p1', heroId, 'hero', parseSquare(square));
    if (heroId === leader) units[id].commander = true;
    HEROES[heroId].hooks?.spawn?.(units, units[id]);
  }
  if (quest.caravan)
    units['p1-caravan'] = makeUnit('p1-caravan', 'p1', 'caravan', 'caravan', parseSquare(quest.caravan));
  const counts: Record<string, number> = {};
  for (const [type, square] of quest.monsters) {
    counts[type] = (counts[type] || 0) + 1;
    const id = `p2-${type}-${counts[type]}`;
    const monster = makeUnit(id, 'p2', type, 'monster', parseSquare(square));
    if (heroDef(monster).hide) Object.assign(monster, { warded: true, wardTurns: 999 });
    units[id] = monster;
  }
  const blocks: Record<string, Block> = {};
  if (quest.blocks) {
    for (const [kind, squares] of Object.entries(quest.blocks))
      for (const square of squares) blocks[key(parseSquare(square))] = { kind };
  } else {
    for (const [kind, squares] of Object.entries(MAPS[quest.map].blocks))
      for (const square of squares) {
        const pos = parseSquare(square);
        blocks[key(pos)] = { kind };
        blocks[key({ r: 7 - pos.r, c: 7 - pos.c })] = { kind };
      }
  }
  // a unit placed on terrain would be stuck: the level's units win
  for (const unit of Object.values(units)) delete blocks[key(unit.pos)];
  return { units, blocks, teams: { p1: quest.heroes.map(([heroId]) => heroId), p2: [] } };
}

/** The runes each side starts a level with: the player's from the level, none for the monsters. */
export const questEnergy = (quest: Quest): Record<Team, number> => ({ p1: quest.energy, p2: 0 });
/** Rules for a level: runes as usual, no cap. */
export const questRules = (quest: Quest) => ({
  mode: 'adventure',
  teamSize: quest.heroes.length,
  energy: { ...ENERGY },
  quest: quest.id,
});

const caravanOf = (state: State) => state.units['p1-caravan'] || null;
const monstersLeft = (state: State) => livingUnits(state, 'p2').filter((unit) => unit.kind === 'monster');

/**
 * Who has won the level, and why, or null while it goes on. `clock`: also judge the round count (only at
 * the start of a turn, so a goal reached on the last move still counts).
 */
export function questResult(state: State, clock = false): { winner: Team; text: string } | null {
  const quest = questOf(state);
  if (!quest) return null;
  const lost = (text: string) => ({ winner: 'p2' as Team, text: `${text} The level is lost.` });
  const won = (text: string) => ({ winner: 'p1' as Team, text: `${text} Level complete!` });
  const leader = Object.values(state.units).find((unit) => unit.team === 'p1' && isCommander(unit));
  if (leader && !leader.alive) return lost(`Your commander, ${heroDef(leader).name}, has fallen.`);
  if (!livingHeroes(state, 'p1').length) return lost('All your heroes have fallen.');
  const caravan = caravanOf(state);
  if (quest.goal.kind === 'escort') {
    if (caravan && !caravan.alive) return lost('The caravan was destroyed.');
    if (caravan && caravan.pos.r === 0) return won('The caravan made it through.');
  }
  if (quest.goal.kind === 'exterminate' && !monstersLeft(state).length) return won('Every monster is down.');
  if (quest.goal.kind === 'slay') {
    const target = quest.goal.target;
    const left = Object.values(state.units).filter((unit) => unit.hero === target && unit.alive);
    if (!left.length) return won(`The ${heroDef({ hero: target, kind: 'monster' } as Unit).name} is slain.`);
  }
  if (clock) {
    const round = roundOf(state);
    if (quest.goal.kind === 'survive' && round > quest.goal.rounds)
      return won(`${TEAM_NAMES.p1} held out for ${quest.goal.rounds} rounds.`);
    if (quest.rounds && round > quest.rounds) return lost(`${quest.rounds} rounds have passed.`);
  }
  return null;
}

/** For the bot: how well `team` is doing at the level's goal, beyond material. */
export function questScore(state: State, team: Team): number {
  const quest = questOf(state);
  if (!quest) return 0;
  const caravan = caravanOf(state);
  const monsters = monstersLeft(state);
  const nearest = (target: Unit | undefined | null) =>
    target && monsters.length ? Math.min(...monsters.map((monster) => chebyshev(monster.pos, target.pos))) : 0;
  if (quest.goal.kind === 'escort' && caravan?.alive)
    return team === 'p1' ? 60 * (7 - caravan.pos.r) : -12 * nearest(caravan);
  if (quest.goal.kind === 'survive' && team === 'p2') {
    const leader = Object.values(state.units).find((unit) => unit.team === 'p1' && isCommander(unit) && unit.alive);
    return -12 * nearest(leader);
  }
  return 0;
}
