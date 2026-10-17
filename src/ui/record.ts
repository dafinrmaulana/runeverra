// Wins and losses between the same two sides, kept across rematches.
// vs bot: per difficulty, "you" against "them" (kept in this browser);
// face to face: Ivory against Ember (kept in this browser); online: per room, for this tab only.
import { pref, setPref, type Team } from './data';

export type Tally = { a: number; b: number }; // a: you (or Ivory face to face), b: them (or Ember)

const memory = new Map<string, Tally>();
const stored = (key: string) => !key.startsWith('room-');

export function getTally(key: string): Tally {
  if (!stored(key)) return memory.get(key) || { a: 0, b: 0 };
  const all = pref<Record<string, Tally>>('record', {});
  return all[key] || { a: 0, b: 0 };
}
function setTally(key: string, tally: Tally) {
  if (!stored(key)) {
    memory.set(key, tally);
    return;
  }
  const all = pref<Record<string, Tally>>('record', {});
  all[key] = tally;
  setPref('record', all);
}
/** One finished match: `aWon` is true when side a (you, or Ivory face to face) won. */
export function addResult(key: string, aWon: boolean) {
  const t = getTally(key);
  setTally(key, aWon ? { a: t.a + 1, b: t.b } : { a: t.a, b: t.b + 1 });
}
export function resetTally(key: string) {
  setTally(key, { a: 0, b: 0 });
}

/** Which side counts as "a" for a match: the viewer, or Ivory when two share a screen. */
export const sideA = (kind: string, viewer: Team): Team => (kind === 'local' ? 'p1' : viewer);
