// Online play over a shared "room": pure helpers, no DOM, no network.
//
// The engine is deterministic, so a match is fully described by its setup plus the
// decisions each side made. Each player shares only their own decisions, encoded as
// indexes into listActions(state) at the moment they decided, and every client replays
// both lists in turn order (toMove decides whose list the next entry comes from).
// Indexes make the log tiny (a long match is a few hundred bytes) and can never encode
// an illegal action: an index past the end of the list is simply rejected.
import { applyAction, listActions, toMove, createMatch } from './arena.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const CODE_LENGTH = 5;

/** A short room code, e.g. "K7Q2M". `rand` returns [0, 1). */
export function newRoomCode(rand = Math.random) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return out;
}

/** Normalise what a player typed: uppercase, letters and digits only. null if not a code. */
export function cleanCode(text) {
  const c = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_CHARS.includes(ch)) ? c : null;
}

/** The named room for a code (the platform wants lowercase names). */
export const roomName = (code) => `hg-${code.toLowerCase()}`;

export const encodeMoves = (list) => list.map((n) => n.toString(36)).join('.');
export function decodeMoves(text) {
  if (typeof text !== 'string' || !text) return [];
  const out = [];
  for (const part of text.split('.')) {
    const n = parseInt(part, 36);
    if (!Number.isInteger(n) || n < 0 || n > 4096) return out; // stop at garbage
    out.push(n);
  }
  return out;
}

const samePos = (a, b) => (!a && !b) || (a && b && a.r === b.r && a.c === b.c);
export const sameAction = (a, b) => a.type === b.type && a.unitId === b.unitId && a.skill === b.skill
  && a.targetId === b.targetId && a.use === b.use && samePos(a.to, b.to);

/** Index of `action` in listActions(state), or -1. */
export const actionIndex = (state, action) => listActions(state).findIndex((a) => sameAction(a, action));

/** The action an index stands for in this state, or null. */
export function actionAt(state, index) {
  const acts = listActions(state);
  return Number.isInteger(index) && index >= 0 && index < acts.length ? acts[index] : null;
}

/** The match both clients build from the agreed setup. */
export function matchFromConfig(cfg) {
  return createMatch({ p1: cfg.p1, p2: cfg.p2, map: cfg.map, creeps: cfg.creeps !== false, seed: cfg.seed || 0 });
}

/**
 * The next decision to replay: whose turn it is and the entry from their list, or null
 * when that side has not decided yet. `applied` counts entries already used per side.
 */
export function nextMove(state, moves, applied) {
  if (state.status !== 'playing') return null;
  const side = toMove(state);
  const list = moves[side] || [];
  if (applied[side] >= list.length) return null;
  const action = actionAt(state, list[applied[side]]);
  return { side, action, index: list[applied[side]], bad: !action };
}

/** Replay both lists from the setup. Stops at the first entry that isn't legal. */
export function replay(cfg, moves) {
  let state = matchFromConfig(cfg);
  const applied = { p1: 0, p2: 0 };
  for (let n = nextMove(state, moves, applied); n; n = nextMove(state, moves, applied)) {
    if (n.bad) return { state, applied, error: `Bad move from ${n.side}` };
    state = applyAction(state, n.action).state;
    applied[n.side] += 1;
  }
  return { state, applied, error: null };
}
