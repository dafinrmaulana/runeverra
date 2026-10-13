import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyAction } from '../src/engine.js';
import { chooseAction, listActions } from '../src/bot.js';

const sq = (n) => ({ c: 'abcdefgh'.indexOf(n[0]), r: 8 - Number(n[1]) });
function setup(spec, current = 'p1') {
  const s = createInitialState();
  for (const id of Object.keys(s.units)) { if (spec[id]) s.units[id].pos = sq(spec[id]); else delete s.units[id]; }
  s.current = current;
  return s;
}

test('bot takes a winning capture', () => {
  for (const lvl of ['easy', 'normal', 'hard']) {
    const s = setup({ 'p2-rook': 'a8', 'p2-bishop': 'h8', 'p1-knight': 'a4' }, 'p2');
    const { action } = chooseAction(s, lvl);
    const r = applyAction(s, action);
    assert.ok(r.ok);
    assert.equal(r.state.status, 'p2', `${lvl} should win immediately`);
  }
});

test('normal and hard bots do not leave a hero to a free capture', () => {
  // Ember Mage on c5 is attacked by the Ivory Guardian on c1; nothing defends it.
  const s = setup({ 'p2-bishop': 'c5', 'p2-rook': 'h8', 'p2-knight': 'g8', 'p1-rook': 'c1', 'p1-knight': 'a1' }, 'p2');
  for (const lvl of ['normal', 'hard']) {
    const { action } = chooseAction(s, lvl);
    const after = applyAction(s, action).state;
    const reply = listActions(after).some((a) => a.type === 'move' && a.to.r === after.units['p2-bishop'].pos.r
      && a.to.c === after.units['p2-bishop'].pos.c && after.units['p2-bishop'].alive && !after.units['p2-bishop'].status.shield);
    assert.equal(reply, false, `${lvl} left the Mage hanging with ${JSON.stringify(action)}`);
  }
});

test('bot only ever returns legal actions and is deterministic for a given seed', () => {
  let s = createInitialState(); s.seed = 42;
  let t = createInitialState(); t.seed = 42;
  for (let i = 0; i < 30 && s.status === 'playing'; i++) {
    const a = chooseAction(s, 'normal').action;
    const b = chooseAction(t, 'normal').action;
    assert.deepEqual(a, b);
    const r = applyAction(s, a); assert.ok(r.ok, r.reason);
    s = r.state; t = applyAction(t, b).state;
  }
});
