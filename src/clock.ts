// Chess-style clock as plain data, so it serializes over the wire and the engine stays
// deterministic (the clock is never part of the game state). Every function takes `now` in
// ms from whatever timeline the caller uses; nothing here reads a real clock.
import type { Team } from './engine/index.ts';

export const MAX_MIN = 60;
const SIDES: Team[] = ['p1', 'p2'];

export type Clock = {
  ms: Record<Team, number>; // each side's bank, as of `since`
  running: Team | null; // whose time is running (null: paused)
  since: number; // when `running` started, on the caller's timeline
};
/** What goes over the wire: banks already charged up to the moment it was taken. */
export type ClockSnapshot = { ms: Record<Team, number>; running: Team | null };

/** Whole minutes 1..MAX_MIN to ms; anything else is 0 = no clock (Classic). */
export function minutesToMs(minutes: unknown) {
  const whole = Math.round(Number(minutes));
  return Number.isFinite(whole) && whole >= 1 && whole <= MAX_MIN ? whole * 60000 : 0;
}

export const createClock = (msPerSide: number): Clock => ({
  ms: { p1: msPerSide, p2: msPerSide },
  running: null,
  since: 0,
});

export function remaining(clock: Clock, side: Team, now: number) {
  const bank = clock.ms[side];
  return clock.running === side ? Math.max(0, bank - (now - clock.since)) : bank;
}

/** Charge the running side up to `now`, then run `side` (null pauses). Returns a new clock. */
export function setRunning(clock: Clock, side: Team | null, now: number): Clock {
  const ms = { ...clock.ms };
  if (clock.running) ms[clock.running] = remaining(clock, clock.running, now);
  return { ms, running: side, since: now };
}

/** The running side whose bank is empty, else null. */
export function expired(clock: Clock, now: number) {
  return SIDES.find((side) => clock.running === side && remaining(clock, side, now) <= 0) || null;
}

export const snapshot = (clock: Clock, now: number): ClockSnapshot => ({
  ms: { p1: remaining(clock, 'p1', now), p2: remaining(clock, 'p2', now) },
  running: clock.running,
});
export const fromSnapshot = (snap: ClockSnapshot, now: number): Clock => ({
  ms: { p1: snap.ms.p1, p2: snap.ms.p2 },
  running: snap.running,
  since: now,
});

/** m:ss, rounded up so 0:00 only shows when the bank is really empty. */
export function formatClock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
