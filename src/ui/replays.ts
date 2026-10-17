// Finished matches kept for review: the setup and every decision (the engine's trail), which is
// enough to rebuild each position exactly. Kept in this browser, newest first.
import { pref, setPref, type Team } from './data';
import type { Action, MatchOptions } from '../engine/index.ts';

export type Replay = {
  id: string;
  at: number;
  kind: 'bot' | 'local' | 'online';
  label: string;
  viewer: Team;
  winner: Team | null;
  setup: MatchOptions;
  trail: Action[];
};

const KEY = 'replays';
const MAX = 15;

export function listReplays(): Replay[] {
  const all = pref<Replay[]>(KEY, []);
  return Array.isArray(all) ? all : [];
}
export function saveReplay(replay: Omit<Replay, 'id' | 'at'>) {
  const entry: Replay = {
    ...replay,
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    at: Date.now(),
  };
  setPref(KEY, [entry, ...listReplays()].slice(0, MAX));
  return entry;
}
export function deleteReplay(id: string) {
  setPref(
    KEY,
    listReplays().filter((replay) => replay.id !== id),
  );
}
