// Shapes shared by the rules engine, the bot, the server and the UI.
// Type-only module: every import of it must be `import type` (Node strips types, it doesn't resolve them).
//
// Field names inside State, Unit and Action are short on purpose and must stay as they are: replays
// and the online protocol store them. Each one is explained where it is declared.

/** Ivory (p1) moves first; Ember (p2) second. */
export type Team = 'p1' | 'p2';
/** A square: row 0 is Ember's back rank (rank 8), column 0 is file a. */
export type Pos = { r: number; c: number };
/** A step as [rows, columns], e.g. [1, 0] is one row down the screen. */
export type Dir = [number, number];

export type UnitKind = 'hero' | 'beast' | 'creep' | 'monster' | 'caravan';
export type Unit = {
  id: string; // "<team>-<hero>", "<team>-beast", "<team>-creep-<file>", "<team>-<monster>-<n>" or "<team>-caravan"
  team: Team;
  hero: string; // hero id for heroes; for the others the unit type: 'beast', 'creep', a monster ('goblin'…), 'caravan'
  kind: UnitKind;
  pos: Pos;
  alive: boolean;
  rooted: number; // turns it still can't act (Aggressive Root)
  warded: boolean; // enemy attacks and skills on it are negated (Empty Grave)
  wardTurns?: number; // own turns the ward still lasts if nothing breaks it
  cd: number; // skill cooldown: own turns until the skill is ready again
  ownerId?: string; // a beast's Ge'nga
  moved?: boolean; // a creep that already used its double first step; a beast that already took its free solo step
  iceCharge?: number; // Aqna: 1 when she holds an ice charge
  reacts?: number; // times this hero's reaction was used
  commander?: boolean; // the team's commander: when it falls, its team loses
  stride?: string; // a unit with strides (the beast): the one picked on its first move, kept all match
};
/** Terrain on a square: map obstacles (pillar, tree…) or Aqna's ice (`owner` = her unit id). */
export type Block = { kind: string; owner?: string };

/** 'main', 'react', or a follow-up phase registered by a hero (see PhaseDef). */
export type Phase = string;

/** A decision. Exactly what listActions returns; replays and the online protocol store these. */
export type Action = {
  type: string; // move | skill | react | skip | timeout | a phase's own types (ice, storm…)
  unitId?: string; // who acts (move, skill)
  to?: Pos; // where to (move, square-targeted skill, ice)
  skill?: string; // skill key (skill)
  targetId?: string; // unit-targeted skill
  use?: boolean; // react: use the reaction or let the action happen
  pattern?: string; // storm: 'plus' or 'x'; a first move with strides: the stride picked
  team?: Team; // timeout: who ran out of time
};
/** What the match is waiting for outside the main phase. */
export type Pending = {
  type: string; // the phase name
  unitId?: string; // the unit the phase belongs to (Aqna for ice, Hexor for storm, the beast)
  // react only: the action waiting on the answer, and where to pick the turn back up
  action?: Action;
  resume?: Phase;
  resumePending?: Pending | null;
  reactorId?: string;
};
/** One unit moved by Storm Hammer, for the animation. `blocked`: it held its ground. */
export type Push = { id: string; from: Pos; to: Pos; blocked?: boolean };
/** What just happened, for effects, sounds and the log. `kind` is 'move', 'capture' or a skill key. */
export type LastAction = {
  team: Team;
  unitId: string | null;
  from: Pos | null;
  to: Pos | null;
  hits: Pos[]; // squares that took a hit
  kind: string;
  phase: Phase;
  targetId?: string;
  toward?: Pos | null;
  breach?: boolean;
  movedIce?: string | null;
  storm?: Push[];
  pattern?: string;
  broke?: string[]; // units whose Empty Grave an attack broke instead of eliminating them
  frozen?: string; // Aqna's ice froze this unit, then shattered: it was eliminated (no block is left)
  respawned?: string; // a creep broke through and this new creep joined on its starting square
};
export type LogEntry = { turn: number; team: Team | null; text: string };

/** Skill runes ("energy" in code): how many a team starts with, gains each turn, and can hold. */
export type Energy = { start: number; perTurn: number; max: number };
export type Rules = { mode: string; teamSize: number; energy: Energy; quest?: string };
/** Everything createMatch needs to rebuild a match; a replay is a Setup plus its trail of actions. */
export type Setup = {
  p1: string[];
  p2: string[];
  map: string;
  seed: number;
  creeps: boolean;
  clockMs: number;
  mode: string;
  quest?: string; // an Adventure level (src/engine/adventure.ts): its own board, units and goal
};

export type State = {
  size: number;
  turn: number;
  current: Team; // whose turn it is (in a 'react' phase, the other team decides: see toMove)
  status: 'playing' | Team; // the winner once it is over
  phase: Phase;
  pending: Pending | null;
  map: string;
  teams: Record<Team, string[]>;
  seed: number;
  setup: Setup;
  trail: Action[]; // every action applied so far, for replays
  rules: Rules;
  energy: Record<Team, number>; // runes each team holds
  units: Record<string, Unit>;
  blocks: Record<string, Block>; // by square key "r,c"
  iceBy: Record<string, string[]>; // Aqna's unit id -> her ice squares, oldest first
  log: LogEntry[];
  lastAction: LastAction | null;
};
/** Every mutator returns a new state; `ok` false means nothing happened and `reason` says why. */
export type Result = { ok: boolean; state: State; reason: string | null };

/** One square a unit's basic move can reach, and who it eliminates there. */
export type MoveOption = {
  to: Pos;
  kills: string[];
  over?: string | null;
  backstab?: boolean;
  cost?: number;
  /** Shielded enemies this attack hits: their Empty Grave breaks, nobody is eliminated, and the attacker stays put. */
  breaks?: string[];
};
/** A movement rule: `kind` names an entry of MOVE_RULES (src/engine/movement.ts). */
export type MoveRule = { kind: string; dirs?: Dir[]; range?: number; deltas?: Dir[] };

/**
 * Where a skill reaches. `cells`: a fixed shape as [depth, side] around the caster (depth toward
 * the enemy, flipped per team), never blocked; `label` names it in error messages ("root pattern").
 * `ray`: lines along `dirs`, stopped by terrain and the first unit. `sight`: the square of `range`, minus
 * squares hidden behind terrain or the caster's own units. Neither: the whole square of `range`.
 */
export type Reach = {
  cells?: Dir[];
  label?: string;
  ray?: boolean;
  dirs?: Dir[];
  sight?: boolean;
  /** The squares along these lines, up to `range`, do more (Aqna's ice strikes enemies there): shown in their own colour. */
  inner?: { dirs: Dir[]; range: number };
};
export type Skill = {
  key: string; // short id used in actions, effects and sounds: 'grave', 'root'…
  name: string;
  type: 'active' | 'move' | 'follow'; // cast as an action | part of the moves | offered after a kill
  cost: number; // runes
  text: string; // the full rules text shown in hero details
  range?: number;
  reach?: Reach;
  cooldown?: number;
  charge?: boolean;
  reaction?: boolean;
  reactionCost?: number;
  maxReactions?: number;
};

export type UnitDef = {
  name: string;
  title: string;
  cls: string;
  move: MoveRule[];
  moveText: string;
  value: number; // material value for the bot
  follower?: boolean; // only acts in its owner's follow-up phase, never as the turn's action
  /**
   * Ways of moving to pick from on the unit's first move; the one picked (Unit.stride) is its only move for
   * the rest of the match. Until then `move` is unused and every stride is offered, each move tagged with
   * its stride in Action.pattern.
   */
  strides?: Record<string, MoveRule>;
  idleText?: string; // why a follower can't act in the main phase
  /** Adventure units only: Empty Grave it starts with (a brute's hide takes one blow before it can fall). */
  hide?: boolean;
};

/**
 * Everything that makes a hero more than data. Each hook is optional; the engine calls it at one
 * fixed point of the turn (docs/heroes.md has the order), so a new hero is one file in
 * src/engine/heroes/ plus its art.
 */
export type HeroHooks = {
  /** Right after the hero is placed in createMatch (Ge'nga brings his beast). */
  spawn?(units: Record<string, Unit>, hero: Unit): void;
  /** After the hero is eliminated (Ge'nga's beast flees). */
  onEliminated?(state: State, hero: Unit, logLines: string[]): void;
  /** Unit ids an active, targeted skill may be cast on (already checked: ready, not rooted, affordable). */
  skillTargets?(state: State, hero: Unit): string[];
  /** Overrides skillTargets for skills that aim at squares or need more than a target. */
  skillActions?(state: State, hero: Unit): Action[];
  /** Apply the skill; runes and cooldown are already paid. Fill `lastAction` for effects. */
  resolveSkill?(state: State, hero: Unit, action: Action, logLines: string[], lastAction: LastAction): void;
  /** Why an illegal skill action fails, before target checks; return nothing to fall through to them. */
  explainSkill?(state: State, hero: Unit, action: Action): string | undefined;
  /** Why a target in reach still can't be picked. */
  explainTarget?(state: State, hero: Unit, target: Unit): string;
  /** After the hero's cast. Return true when it opened a follow-up phase (Aqna may still move), else the turn ends. */
  afterSkill?(state: State, hero: Unit): boolean;
  /** After the hero's move (not a cast). Return true when it opened a follow-up phase, else the turn ends. */
  afterAction?(state: State, hero: Unit, result: { killed: number }): boolean;
  /** Acting during the opponent's turn to negate one of their actions (Plantae). */
  reaction?: {
    /** May `reactor` answer what `actor` is doing (`action`)? (Already checked: alive, not rooted, skill ready.) */
    can(state: State, reactor: Unit, actor: Unit, action: Action): boolean;
    /** Pay for it and describe it; the negated action never happens and the turn ends. */
    resolve(state: State, reactor: Unit, actor: Unit, negated: Action, logLines: string[]): LastAction;
  };
};

/** How screens talk about a hero's skill. Copy only; the rules never read it. */
export type HeroUi = {
  /** What an armed skill is aimed at; 'ally' keeps a tap on an ally from switching selection. */
  targets?: 'ally' | 'enemy' | 'square';
  /** Prompt while the skill is armed (default: "<Skill>: tap a highlighted <targets>."). */
  aim?: string;
  /** Skill button text when it is ready (default: "Ready. Press to choose a target (or Q)."). */
  ready?: string;
  /** Why it has no legal cast though ready and affordable; `charge`: it needs to earn a charge first. */
  unavailable?(state: State, hero: Unit): { text: string; charge?: boolean };
  /** For a reaction prompt: the button, and what using it costs afterwards. */
  reactLabel?: string;
  reactNote?: string;
};

export type HeroDef = UnitDef & {
  role: string;
  /** Can lead the team as its commander. A team needs at least one; the first in pick order commands. */
  commander?: boolean;
  skill: Skill;
  hooks?: HeroHooks;
  ui?: HeroUi;
  short: { move: string; skill: string }; // one-glance copy for the hero picker
};

/**
 * A follow-up phase inside a turn (storm, ice, beast). `list` gives its legal actions. `resolve`
 * applies one and returns the result, or null to let the engine treat it as a unit action
 * (`unitPhase`: the beast moving goes through reactions and normal move resolution).
 */
export type PhaseDef = {
  list(state: State): Action[];
  resolve?(state: State, action: Action, context: PhaseContext): Result | null;
  /** Why an action is illegal here. For a unit phase: why this unit can't act now, or nothing. */
  explain?(state: State, action: Action, unit?: Unit): string | undefined;
  unitPhase?: boolean;
  /** A unit phase whose move is the unit's own (Aqna after her ice): its afterAction still runs. */
  ownMove?: boolean;
  /** What the deciding player is asked, and what a tap on a wrong square tells them. */
  prompt?(state: State): string;
  hint?: string;
  /** Bot only: the actions worth searching (defaults to all of them). */
  botActions?(state: State, allActions: Action[]): Action[];
};
/** Handed to PhaseDef.resolve: the state before the action, the log lines to fill, who decided. */
export type PhaseContext = { previous: State; logLines: string[]; team: Team };
