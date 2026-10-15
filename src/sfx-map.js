// Which sound goes with what just happened. Pure, so it can be tested without a browser.
const DIRECT = new Set(['capture', 'backstab', 'grave', 'root', 'interrupt', 'storm', 'ice', 'summon']);

/** The sound for the engine's `lastAction` (and the units, to tell a beast's step from a hero's), or null for silence. */
export function sfxFor(last, units = {}) {
  if (!last || !last.kind) return null;
  if (DIRECT.has(last.kind)) return last.kind;
  if (last.kind === 'move') return units[last.unitId]?.kind === 'beast' ? 'beast' : 'move';
  return null; // skip-beast, skip-ice, skip-storm and the like make no sound
}
