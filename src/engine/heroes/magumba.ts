// Magumba, Shadow Shaman: Empty Grave wards himself or an ally until his next turn.
import type { Dir } from '../types.ts';
import { DIAG } from '../geometry.ts';
import { defineHero } from '../registry.ts';
import { dist, label, left, livingUnits, tokens } from '../state.ts';
import { inSkillReach } from '../skills.ts';

// A fan widening as it reaches out, 2 squares deep, as [depth, side] (see Reach).
const SHIELD_FAN: Dir[] = [
  [1, -1],
  [1, 0],
  [1, 1],
  [2, -2],
  [2, -1],
  [2, 0],
  [2, 1],
  [2, 2],
];

const magumba = defineHero('magumba', {
  name: 'Magumba',
  title: 'Shadow Shaman',
  cls: 'leaf',
  role: 'support',
  value: 280,
  move: [{ kind: 'slide', dirs: DIAG, range: 1 }],
  moveText: 'Steps 1 square diagonally.',
  skill: {
    key: 'grave',
    name: 'Empty Grave',
    type: 'active',
    cost: 2,
    range: 2,
    reach: { cells: SHIELD_FAN, label: 'shield' },
    text: 'Targets himself or one ally in a fan ahead of him, up to 2 squares deep, widening as it goes — nothing in between blocks it. Until your next turn, every enemy attack or skill against that unit is negated. Also removes Root from it.',
  },
  short: {
    move: 'Steps 1 diagonally.',
    skill: '2 runes: shield himself or an ally in the fan ahead of him (2 deep) until your next turn.',
  },
  ui: {
    targets: 'ally',
    unavailable: () => ({ text: 'No ally in his shield fan can take Empty Grave.' }),
  },
  hooks: {
    skillTargets: (state, hero) =>
      livingUnits(state, hero.team)
        .filter((ally) => (ally.id === hero.id || inSkillReach(state, hero, ally.pos)) && !ally.warded)
        .map((ally) => ally.id),
    resolveSkill(state, hero, action, logLines, lastAction) {
      const skill = magumba.skill;
      const target = state.units[action.targetId!];
      const self = target.id === hero.id;
      lastAction.kind = skill.key;
      lastAction.from = { ...hero.pos };
      lastAction.to = null;
      lastAction.hits.push({ ...target.pos });
      lastAction.targetId = target.id;
      target.warded = true;
      target.rooted = 0;
      logLines.push(
        `${self ? `${label(hero)} wraps himself in Empty Grave.` : `${label(hero)} casts Empty Grave on ${label(target)}.`} Empty Grave, ${tokens(skill.cost)}: ${self ? 'he targets himself' : `${label(target)} is ${dist(hero, target)} in his shield fan, within range ${skill.range}`}; enemy attacks on ${self ? 'him' : 'it'} are negated until ${label(hero)}'s next turn. ${left(state, hero.team)}`,
      );
    },
    explainTarget: () => 'Empty Grave only works on your own units.',
  },
});
