// Chess-style clock as plain data, so it serializes over the wire and the engine stays
// deterministic (the clock is never part of the game state). Every function takes `now` in
// ms from whatever timeline the caller uses; nothing here reads a real clock.
export const MAX_MIN = 60;
const SIDES = ['p1', 'p2'];

/** Whole minutes 1..MAX_MIN to ms; anything else is 0 = no clock (Classic). */
export function minutesToMs(m) {
  const n = Math.round(Number(m));
  return Number.isFinite(n) && n >= 1 && n <= MAX_MIN ? n * 60000 : 0;
}

export const createClock = (ms) => ({ ms: { p1: ms, p2: ms }, running: null, since: 0 });

export function remaining(c, side, now) {
  const base = c.ms[side];
  return c.running === side ? Math.max(0, base - (now - c.since)) : base;
}

/** Charge the running side up to `now`, then run `side` (null pauses). Returns a new clock. */
export function setRunning(c, side, now) {
  const ms = { ...c.ms };
  if (c.running) ms[c.running] = remaining(c, c.running, now);
  return { ms, running: side, since: now };
}

/** The running side whose bank is empty, else null. */
export function expired(c, now) {
  return SIDES.find((s) => c.running === s && remaining(c, s, now) <= 0) || null;
}

export const snapshot = (c, now) => ({ ms: { p1: remaining(c, 'p1', now), p2: remaining(c, 'p2', now) }, running: c.running });
export const fromSnapshot = (snap, now) => ({ ms: { p1: snap.ms.p1, p2: snap.ms.p2 }, running: snap.running, since: now });

/** m:ss, rounded up so 0:00 only shows when the bank is really empty. */
export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
