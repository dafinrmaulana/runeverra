// Board geometry. No state, no imports: hero files use these at load time.
import type { Dir, Pos, Team } from './types.ts';

export const BOARD_SIZE = 8;
export const TEAMS: Team[] = ['p1', 'p2'];
export const TEAM_NAMES: Record<Team, string> = { p1: 'Ivory', p2: 'Ember' };

export const ORTHO: Dir[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const DIAG: Dir[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
export const KING: Dir[] = [...ORTHO, ...DIAG];
export const KNIGHT: Dir[] = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

export const FILES = 'abcdefgh';
export const inBounds = (pos: Pos) => pos.r >= 0 && pos.r < BOARD_SIZE && pos.c >= 0 && pos.c < BOARD_SIZE;
export const samePos = (first: Pos, second: Pos) => first.r === second.r && first.c === second.c;
/** Distance in king steps (diagonals count as 1). */
export const chebyshev = (first: Pos, second: Pos) =>
  Math.max(Math.abs(first.r - second.r), Math.abs(first.c - second.c));
/** "e4"-style name of a square. */
export const squareName = (pos: Pos) => `${FILES[pos.c]}${BOARD_SIZE - pos.r}`;
export const parseSquare = (name: string): Pos => ({ c: FILES.indexOf(name[0]), r: BOARD_SIZE - Number(name[1]) });
/** "r,c": the key of a square in `state.blocks`. */
export const key = (pos: Pos) => `${pos.r},${pos.c}`;
export const other = (team: Team): Team => (team === 'p1' ? 'p2' : 'p1');
/** Row step toward the enemy side. */
export const forward = (team: Team) => (team === 'p1' ? -1 : 1);
/** Every square on the board, row by row. */
export const allSquares = (): Pos[] => {
  const out: Pos[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) out.push({ r, c });
  return out;
};
