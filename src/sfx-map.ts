// Which sound goes with what just happened. Pure, so it can be tested without a browser.
import type { LastAction, Unit } from './engine/index.ts';

// lastAction kinds that have a sound of the same name (src/ui/audio.ts). A new skill with its own
// sound adds its key here and a recipe there.
const DIRECT = new Set(['capture', 'backstab', 'grave', 'root', 'interrupt', 'storm', 'ice', 'summon']);

/** The sound for the engine's `lastAction` (and the units, to tell a beast's step from a hero's), or null for silence. */
export function sfxFor(lastAction: LastAction | null | undefined, units: Record<string, Unit> = {}) {
  if (!lastAction || !lastAction.kind) return null;
  if (DIRECT.has(lastAction.kind)) return lastAction.kind;
  if (lastAction.kind === 'move') return units[lastAction.unitId!]?.kind === 'beast' ? 'beast' : 'move';
  if (lastAction.kind === 'shieldbreak') return 'shield'; // an attack thrown back by Empty Grave
  return null; // skip-beast, skip-ice, skip-storm, skip-pawn and the like make no sound
}
