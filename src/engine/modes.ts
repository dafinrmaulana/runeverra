// Game modes: the numbers a match is played with. createMatch copies the chosen mode into
// `state.rules`, and the engine reads them from there, so a mode never needs engine changes.
import type { Energy } from './types.ts';

export type Mode = { name: string; teamSize: number; creeps: boolean; energy: Energy };

export const MODES: Record<string, Mode> = {
  // Skill runes ("energy" in code): every skill costs runes according to its impact.
  // No real cap on runes: `max` only keeps the number finite (states travel as JSON).
  classic: { name: 'Classic', teamSize: 4, creeps: true, energy: { start: 4, perTurn: 0, max: 99 } },
};

export const ENERGY = MODES.classic.energy;
export const TEAM_SIZE = MODES.classic.teamSize;
