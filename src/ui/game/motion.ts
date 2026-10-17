// Piece animations shared by the board and the effects layer.
import type { Pos } from '../../engine/index.ts';

export type LungeOptions = {
  reach?: number; // share of the way toward `to` it travels, 0..1
  duration?: number; // ms for the whole lunge and return
  back?: number; // overshoot past home on the way back, in squares
  hold?: number; // share of `duration` at which it lands (the impact)
};

/**
 * Throw a piece toward a square and bring it back: it covers `reach` of the way, holds, then snaps
 * home with a small overshoot. `from` and `to` are display squares. Returns ms until the impact.
 */
export function lungeBack(
  piece: HTMLElement | null | undefined,
  from: Pos,
  to: Pos,
  { reach = 0.62, duration = 640, back = 0.22, hold = 0.3 }: LungeOptions = {},
) {
  const dCol = to.c - from.c;
  const dRow = to.r - from.r;
  const at = (share: number) => `translate(${(from.c + dCol * share) * 100}%, ${(from.r + dRow * share) * 100}%)`;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!piece || reduceMotion || !piece.animate) return 0;
  piece.animate(
    [
      { transform: at(0) },
      { transform: at(reach), offset: hold, easing: 'cubic-bezier(.5,0,.9,.6)' },
      { transform: at(reach * 0.92), offset: hold + 0.12 },
      { transform: at(-back), offset: 0.78, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { transform: at(0) },
    ],
    { duration },
  );
  return Math.round(duration * hold);
}
