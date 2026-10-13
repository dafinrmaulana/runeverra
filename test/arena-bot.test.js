import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, listActions, parseSquare as sq, toMove } from '../src/arena.js';
import { chooseAction, pickTeam } from '../src/arena-bot.js';

function setup(spec, opts = {}) {
  const s = createMatch({ p1: ['hasim', 'hexor', 'magumba', 'plantae'], p2: ['genga', 'aqna', 'plantae', 'hasim'], map: 'field', ...opts });
  for (const id of Object.keys(s.units)) { if (spec[id]) s.units[id].pos = sq(spec[id]); else delete s.units[id]; }
  return s;
}

test('bot takes a winning capture at every level', () => {
  for (const lvl of ['easy', 'normal', 'hard']) {
    const s = setup({ 'p1-hexor': 'd4', 'p1-hasim': 'a1', 'p2-aqna': 'e6' });
    const { action } = chooseAction(s, lvl);
    assert.equal(applyAction(s, action).state.status, 'p1', lvl);
  }
});

test('bot answers follow-up phases and reaction prompts with legal choices', () => {
  // reaction: Ember Plantae may interrupt Ivory Hexor
  let s = setup({ 'p1-hexor': 'd4', 'p1-hasim': 'a1', 'p2-plantae': 'd7', 'p2-aqna': 'h8' });
  s.energy.p2 = 3;
  s = applyAction(s, { type: 'move', unitId: 'p1-hexor', to: sq('e6') }).state;
  assert.equal(toMove(s), 'p2');
  const r = chooseAction(s, 'normal');
  assert.equal(r.action.type, 'react');
  assert.ok(applyAction(s, r.action).ok);
  // storm phase: Hexor captured with 2 tokens in the bank
  let t = setup({ 'p1-hexor': 'b3', 'p1-hasim': 'a1', 'p2-aqna': 'c5', 'p2-plantae': 'd5', 'p2-genga': 'h8' });
  t.energy.p1 = 2;
  t = applyAction(t, { type: 'move', unitId: 'p1-hexor', to: sq('c5') }).state;
  assert.equal(t.phase, 'storm');
  const st = chooseAction(t, 'normal');
  assert.ok(['storm', 'skip'].includes(st.action.type));
  assert.ok(applyAction(t, st.action).ok);
});

test('bot plays whole matches with random teams without illegal actions', () => {
  for (let g = 0; g < 3; g++) {
    let s = createMatch({ p1: pickTeam(g * 2 + 1), p2: pickTeam(g * 2 + 2), map: ['oasis', 'jungle', 'keep'][g] });
    for (let n = 0; n < 60 && s.status === 'playing'; n++) {
      const pick = chooseAction(s, 'easy');
      assert.ok(listActions(s).length > 0);
      const r = applyAction(s, pick.action);
      assert.ok(r.ok, r.reason);
      s = r.state;
    }
  }
});

test('pickTeam returns 4 distinct real heroes', () => {
  for (let i = 0; i < 20; i++) {
    const t = pickTeam(i);
    assert.equal(new Set(t).size, 4);
    assert.doesNotThrow(() => createMatch({ p1: t, p2: t }));
  }
});
