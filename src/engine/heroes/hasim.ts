// Hasim, Desert Assassin. No hooks: Backstab is a movement rule (MOVE_RULES.backstab).
import { KING } from '../geometry.ts';
import { defineHero } from '../registry.ts';

defineHero('hasim', {
  name: 'Hasim',
  title: 'Desert Assassin',
  cls: 'claw',
  role: 'assassin',
  value: 330,
  move: [{ kind: 'slide', dirs: KING, range: 1 }, { kind: 'backstab' }],
  moveText: 'Steps 1 square in any direction.',
  skill: {
    key: 'backstab',
    name: 'Backstab',
    type: 'move',
    cost: 0,
    text: 'Signature move, free (no runes): jumps in any direction over one adjacent unit or object. An enemy jumped over is eliminated; an enemy on the landing square is eliminated too.',
  },
  short: {
    move: 'Steps 1 square any way.',
    skill: 'Free jump over the unit next to him: kills what he jumps and what he lands on.',
  },
});
