import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch,
  applyAction,
  listActions,
  validateAction,
  defineHero,
  HEROES,
  ORTHO,
  parseSquare as sq,
} from '../src/engine/index.ts';

test('a hero is one definition: the engine plays it without knowing its name', () => {
  // A plain mover plus a targeted skill, defined the way src/engine/heroes/*.ts do it.
  defineHero('tester', {
    name: 'Tester',
    title: 'Test Dummy',
    cls: 'claw',
    role: 'roam',
    value: 100,
    move: [{ kind: 'slide', dirs: ORTHO, range: 1 }],
    moveText: 'Steps 1 straight.',
    skill: { key: 'mark', name: 'Mark', type: 'active', cost: 1, range: 8, text: 'Roots any enemy hero.' },
    short: { move: 'Steps 1 straight.', skill: 'Roots any enemy hero.' },
    hooks: {
      skillTargets: (state, unit) =>
        Object.values(state.units)
          .filter((other) => other.alive && other.team !== unit.team && other.kind === 'hero')
          .map((other) => other.id),
      resolveSkill(state, unit, action, lines, last) {
        state.units[action.targetId].rooted = 1;
        last.kind = 'mark';
        lines.push(`${unit.id} marks ${action.targetId}.`);
      },
    },
  });
  assert.throws(() => defineHero('tester', HEROES.tester), /twice/);
  let s = createMatch({
    p1: ['tester', 'hasim', 'hexor', 'aqna'],
    p2: ['genga', 'plantae', 'magumba', 'hasim'],
    creeps: false,
    map: 'field',
  });
  assert.ok(listActions(s).some((action) => action.unitId === 'p1-tester' && action.type === 'move'));
  s = applyAction(s, { type: 'skill', unitId: 'p1-tester', skill: 'mark', targetId: 'p2-genga' }).state;
  assert.equal(s.units['p2-genga'].rooted, 1);
  assert.equal(s.current, 'p2');
  assert.equal(s.energy.p1, 3);
});

test('ids that are not own keys never resolve to heroes or units', () => {
  assert.throws(() => createMatch({ p1: ['hasim', 'hexor', 'aqna', 'toString'] }), /Unknown hero/);
  const s = createMatch();
  for (const action of [
    { type: 'skill', unitId: 'p1-creep-a', skill: 'x' },
    { type: 'move', unitId: '__proto__', to: sq('a1') },
    { type: 'skill', unitId: 'p1-magumba', skill: 'grave', targetId: 'constructor' },
    null,
    'move',
    { type: 'move', unitId: 'p1-hasim', to: 'zz' },
  ]) {
    const v = validateAction(s, action);
    assert.equal(v.ok, false);
    assert.equal(typeof v.reason, 'string');
  }
});

test('a match carries its mode: rune limits come from state.rules', () => {
  const s = createMatch();
  assert.deepEqual(s.rules, { mode: 'classic', teamSize: 4, energy: { start: 4, perTurn: 0, max: 99 } });
  assert.equal(s.setup.mode, 'classic');
  assert.deepEqual(createMatch(s.setup).rules, s.rules); // replays rebuild the same rules
});
