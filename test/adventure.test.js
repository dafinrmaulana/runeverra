import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, listActions, moveOptions, QUESTS, key } from '../src/engine/index.ts';

const play = (state, action) => {
  const result = applyAction(state, action);
  assert.ok(result.ok, result.reason);
  return result.state;
};

test('every adventure level builds: units on open squares, the player first, a commander, a goal in the log', () => {
  for (const quest of QUESTS) {
    const s = createMatch({ quest: quest.id });
    assert.equal(s.setup.quest, quest.id);
    assert.equal(s.current, 'p1');
    const squares = Object.values(s.units).map((unit) => key(unit.pos));
    assert.equal(new Set(squares).size, squares.length, `${quest.id}: no shared squares`);
    assert.ok(
      squares.every((square) => !s.blocks[square]),
      `${quest.id}: nobody on terrain`,
    );
    assert.ok(
      Object.values(s.units).some((unit) => unit.commander && unit.team === 'p1'),
      `${quest.id}: a commander`,
    );
    assert.ok(listActions(s).length > 0);
    assert.deepEqual(createMatch(s.setup).units, s.units, 'a replay rebuilds the same level');
  }
});

test('escort: the caravan never attacks, wins at the far edge, and its loss loses the level', () => {
  let s = createMatch({ quest: 'road-out' });
  const caravan = s.units['p1-caravan'];
  s.units['p2-goblin-1'].pos = { r: caravan.pos.r - 1, c: caravan.pos.c };
  assert.ok(!moveOptions(s, s.units['p1-caravan']).some((option) => option.kills.length), 'it never attacks');
  s = createMatch({ quest: 'road-out' });
  s.units['p1-caravan'].pos = { r: 1, c: 3 };
  const won = play(s, { type: 'move', unitId: 'p1-caravan', to: { r: 0, c: 3 } });
  assert.equal(won.status, 'p1');
  const lost = createMatch({ quest: 'road-out' });
  lost.current = 'p2';
  lost.units['p2-goblin-1'].pos = { r: 6, c: 2 };
  let after = play(lost, { type: 'move', unitId: 'p2-goblin-1', to: lost.units['p1-caravan'].pos });
  if (after.phase === 'react') after = play(after, { type: 'react', use: false }); // Plantae lets it happen
  assert.equal(after.status, 'p2');
});

test('exterminate, slay and survive goals; the round limit; a brute takes two blows; monster kills give a rune', () => {
  const den = createMatch({ quest: 'goblin-den' });
  for (const unit of Object.values(den.units)) if (unit.team === 'p2' && unit.id !== 'p2-goblin-1') unit.alive = false;
  den.units['p2-goblin-1'].pos = { r: 6, c: 4 };
  den.energy.p1 = 0;
  const cleared = play(den, { type: 'move', unitId: 'p1-hasim', to: { r: 6, c: 4 } });
  assert.equal(cleared.status, 'p1', 'the last monster down');
  assert.equal(cleared.energy.p1, 1, '+1 rune for a monster');

  const brute = createMatch({ quest: 'the-brute' });
  const ogre = brute.units['p2-brute-1'];
  assert.equal(ogre.warded, true, 'its hide');
  ogre.pos = { r: 6, c: 2 };
  let hit = play(brute, { type: 'move', unitId: 'p1-hasim', to: { r: 6, c: 2 } });
  assert.equal(hit.units['p2-brute-1'].alive, true, 'the first blow only breaks the hide');
  assert.equal(hit.status, 'playing');
  hit.current = 'p1';
  hit = play(hit, { type: 'move', unitId: 'p1-hasim', to: { r: 6, c: 2 } });
  assert.equal(hit.status, 'p1', 'the second one slays it');

  let hold = createMatch({ quest: 'hold-the-line' });
  hold.turn = 20;
  hold = play(hold, { type: 'move', unitId: 'p1-hexor', to: { r: 4, c: 1 } });
  assert.equal(hold.status, 'p1', 'held out for 10 rounds');

  let late = createMatch({ quest: 'goblin-den' });
  late.turn = 60;
  late = play(late, { type: 'move', unitId: 'p1-hasim', to: { r: 6, c: 4 } });
  assert.equal(late.status, 'p2', 'out of rounds');
});
