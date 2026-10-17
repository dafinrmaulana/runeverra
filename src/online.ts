// Online play over a shared "room": pure helpers, no DOM, no network.
//
// The engine is deterministic, so a match is fully described by its setup plus the
// decisions each side made. Each player shares only their own decisions, encoded as
// indexes into listActions(state) at the moment they decided, and every client replays
// both lists in turn order (toMove decides whose list the next entry comes from).
// Indexes make the log tiny (a long match is a few hundred bytes) and can never encode
// an illegal action: an index past the end of the list is simply rejected.
import type { Action, Pos, State, Team } from './engine/index.ts';
import { applyAction, listActions, toMove, createMatch } from './engine/index.ts';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const CODE_LENGTH = 5;

/** What both players agreed on before the match: enough to build the same starting state. */
export type MatchConfig = {
  p1: string[];
  p2: string[];
  map?: string;
  creeps?: boolean;
  seed?: number;
  clockMs?: number;
};
/** Each side's decisions so far, as indexes into listActions. */
export type MoveLists = Partial<Record<Team, number[]>>;
/** How many entries of each side's list have been replayed already. */
export type AppliedCounts = Record<Team, number>;

/** A short room code, e.g. "K7Q2M". `random` returns a number in [0, 1). */
export function newRoomCode(random: () => number = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return code;
}

/** Normalise what a player typed: uppercase, letters and digits only. null if not a code. */
export function cleanCode(typed: unknown) {
  const code = String(typed || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return code.length === CODE_LENGTH && [...code].every((char) => CODE_CHARS.includes(char)) ? code : null;
}

/** The named room for a code (the platform wants lowercase names). */
export const roomName = (code: string) => `hg-${code.toLowerCase()}`;

/** "3.a.1f": action indexes in base 36, joined by dots. */
export const encodeMoves = (indexes: number[]) => indexes.map((index) => index.toString(36)).join('.');
export function decodeMoves(encoded: unknown): number[] {
  if (typeof encoded !== 'string' || !encoded) return [];
  const indexes: number[] = [];
  for (const part of encoded.split('.')) {
    const index = parseInt(part, 36);
    if (!Number.isInteger(index) || index < 0 || index > 4096) return indexes; // stop at garbage
    indexes.push(index);
  }
  return indexes;
}

const samePos = (first?: Pos, second?: Pos) =>
  (!first && !second) || (!!first && !!second && first.r === second.r && first.c === second.c);
export const sameAction = (first: Action, second: Action) =>
  first.type === second.type &&
  first.unitId === second.unitId &&
  first.skill === second.skill &&
  first.targetId === second.targetId &&
  first.use === second.use &&
  first.pattern === second.pattern &&
  samePos(first.to, second.to);

/** Index of `action` in listActions(state), or -1. */
export const actionIndex = (state: State, action: Action) =>
  listActions(state).findIndex((legal) => sameAction(legal, action));

/** The action an index stands for in this state, or null. */
export function actionAt(state: State, index: number) {
  const actions = listActions(state);
  return Number.isInteger(index) && index >= 0 && index < actions.length ? actions[index] : null;
}

/** The match both clients build from the agreed setup. */
export function matchFromConfig(config: MatchConfig) {
  return createMatch({
    p1: config.p1,
    p2: config.p2,
    map: config.map,
    creeps: config.creeps !== false,
    seed: config.seed || 0,
    clockMs: config.clockMs || 0,
  });
}

/**
 * The next decision to replay: whose turn it is and the entry from their list, or null
 * when that side has not decided yet. `bad` means the entry is not a legal action here.
 */
export function nextMove(state: State, moves: MoveLists, applied: AppliedCounts) {
  if (state.status !== 'playing') return null;
  const side = toMove(state);
  const list = moves[side] || [];
  if (applied[side] >= list.length) return null;
  const index = list[applied[side]];
  const action = actionAt(state, index);
  return { side, action, index, bad: !action };
}

/** Replay both lists from the setup. Stops at the first entry that isn't legal. */
export function replay(config: MatchConfig, moves: MoveLists) {
  let state = matchFromConfig(config);
  const applied: AppliedCounts = { p1: 0, p2: 0 };
  for (let next = nextMove(state, moves, applied); next; next = nextMove(state, moves, applied)) {
    if (next.bad) return { state, applied, error: `Bad move from ${next.side}` };
    state = applyAction(state, next.action!).state;
    applied[next.side] += 1;
  }
  return { state, applied, error: null };
}
