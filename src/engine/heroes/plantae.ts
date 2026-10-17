// Plantae, Jungle Keeper: Aggressive Root, cast on her turn or as a reaction on the enemy's.
import type { Dir } from '../types.ts';
import { ORTHO, other } from '../geometry.ts';
import { defineHero } from '../registry.ts';
import { dist, label, left, livingUnits, tokens } from '../state.ts';
import { inSkillReach } from '../skills.ts';

// A 3x3 block right in front of her, as [depth, side] (see Reach). Never beside or behind her.
const ROOT_PATTERN = [1, 2, 3].flatMap((depth) => [-1, 0, 1].map((side): Dir => [depth, side]));

const plantae = defineHero('plantae', {
  name: 'Plantae',
  title: 'Jungle Keeper',
  cls: 'leaf',
  role: 'support',
  value: 270,
  move: [{ kind: 'slide', dirs: ORTHO, range: 1 }],
  moveText: 'Steps 1 square straight.',
  skill: {
    key: 'root',
    name: 'Aggressive Root',
    type: 'active',
    cost: 3,
    range: 3,
    reach: { cells: ROOT_PATTERN, label: 'root' },
    reaction: true,
    reactionCost: 3,
    cooldown: 3,
    text: "Roots an enemy in the 3x3 block right in front of her — never beside or behind her, and nothing in between blocks it. It can't act on its next turn. It can instead be cast during the opponent's turn (3 runes), when an enemy in that block acts: that action is negated. After either use, it recharges for 3 of your turns.",
  },
  short: {
    move: 'Steps 1 straight.',
    skill: '3 runes: root an enemy in the 3x3 block in front of her, or cancel an enemy action there on their turn.',
  },
  ui: {
    targets: 'enemy',
    unavailable: () => ({
      text: "No enemy in the block in front of her can be rooted (protected or already rooted ones don't count).",
    }),
    reactLabel: 'Root it',
    reactNote: 'Aggressive Root then recharges for 3 of your turns.',
  },
  hooks: {
    skillTargets: (state, hero) =>
      livingUnits(state, other(hero.team))
        .filter((enemy) => inSkillReach(state, hero, enemy.pos) && !enemy.warded && !enemy.rooted)
        .map((enemy) => enemy.id),
    resolveSkill(state, hero, action, logLines, lastAction) {
      const skill = plantae.skill;
      const target = state.units[action.targetId!];
      lastAction.kind = skill.key;
      lastAction.from = { ...hero.pos };
      lastAction.to = null;
      lastAction.hits.push({ ...target.pos });
      lastAction.targetId = target.id;
      target.rooted = 1;
      logLines.push(
        `${label(hero)} roots ${label(target)}: it can't act next turn. Aggressive Root, ${tokens(skill.cost)}: ${label(target)} is ${dist(hero, target)} in the block in front of her, within range ${skill.range}; recharges for ${skill.cooldown} turns. ${left(state, hero.team)}`,
      );
    },
    explainTarget: (_state, _hero, target) =>
      target.rooted ? `${label(target)} is already rooted.` : 'Aggressive Root only works on enemies.',
    reaction: {
      can(state, reactor, actor) {
        const skill = plantae.skill;
        if (skill.maxReactions != null && (reactor.reacts || 0) >= skill.maxReactions) return false;
        if (state.energy[reactor.team] < (skill.reactionCost ?? skill.cost)) return false;
        return inSkillReach(state, reactor, actor.pos);
      },
      resolve(state, reactor, actor, negated, logLines) {
        const skill = plantae.skill;
        const cost = skill.reactionCost ?? skill.cost;
        state.energy[reactor.team] -= cost;
        reactor.cd = skill.cooldown || 0;
        reactor.reacts = (reactor.reacts || 0) + 1;
        // where the negated action was going, so the animation can pull the actor back from it
        const toward = negated.to || (negated.targetId ? state.units[negated.targetId]?.pos : null) || null;
        logLines.push(
          `${label(reactor)} interrupts with Aggressive Root! ${label(actor)}'s action is negated. Interrupt, ${tokens(cost)}: ${label(actor)} acted ${dist(reactor, actor)} in the block in front of Plantae, within range ${skill.range}; recharges for ${skill.cooldown} turns. ${left(state, reactor.team)}`,
        );
        return {
          team: reactor.team,
          unitId: reactor.id,
          from: { ...reactor.pos },
          to: null,
          hits: [{ ...actor.pos }],
          kind: 'interrupt',
          targetId: actor.id,
          toward: toward && { ...toward },
          phase: 'react',
        };
      },
    },
  },
});
