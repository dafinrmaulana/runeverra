import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, listActions, toMove } from '../src/arena.js';
import {
  newRoomCode, cleanCode, roomName, encodeMoves, decodeMoves, actionIndex, matchFromConfig, replay, nextMove,
} from '../src/online.js';

test('room codes: 5 unambiguous characters, typed codes are normalised', () => {
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 50; i++) {
    const c = newRoomCode(rnd);
    assert.match(c, /^[A-HJKMNP-Z2-9]{5}$/);
    assert.equal(cleanCode(` ${c.toLowerCase().slice(0, 2)}-${c.slice(2)} `), c);
  }
  assert.equal(cleanCode('ABC'), null);
  assert.equal(cleanCode('ABCD0'), null, '0 is never used');
  assert.equal(roomName('K7Q2M'), 'hg-k7q2m');
});

test('move lists encode compactly and decode back; garbage stops decoding', () => {
  const list = [0, 5, 35, 36, 300, 12];
  assert.deepEqual(decodeMoves(encodeMoves(list)), list);
  assert.deepEqual(decodeMoves(''), []);
  assert.deepEqual(decodeMoves(undefined), []);
  assert.deepEqual(decodeMoves('3.4.!!.5'), [3, 4]);
});

test('two clients replaying each side\'s own list reach the same match', () => {
  const cfg = { p1: ['hasim', 'hexor', 'magumba', 'plantae'], p2: ['genga', 'aqna', 'plantae', 'hasim'], map: 'jungle', creeps: true };
  let seed = 9; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let s = matchFromConfig(cfg);
  const moves = { p1: [], p2: [] };
  for (let n = 0; n < 250 && s.status === 'playing'; n++) {
    const acts = listActions(s);
    const a = acts[Math.floor(rnd() * acts.length)];
    const side = toMove(s);
    moves[side].push(actionIndex(s, a));
    s = applyAction(s, a).state;
  }
  const r = replay(cfg, moves);
  assert.equal(r.error, null);
  assert.equal(r.state.turn, s.turn);
  assert.equal(r.state.status, s.status);
  assert.deepEqual(r.state.units, s.units);
  assert.deepEqual(r.state.energy, s.energy);
  assert.equal(r.applied.p1 + r.applied.p2, moves.p1.length + moves.p2.length);
  assert.ok(encodeMoves(moves.p1).length < 1200, 'fits easily in a 4 KiB presence object');

  // the opponent's list arriving late: replay waits at the first missing decision
  const partial = replay(cfg, { p1: moves.p1, p2: moves.p2.slice(0, 3) });
  assert.equal(partial.error, null);
  assert.equal(toMove(partial.state), 'p2');
  assert.equal(nextMove(partial.state, { p1: moves.p1, p2: moves.p2.slice(0, 3) }, partial.applied), null);
});

test('an index that is not a legal action is rejected, never applied', () => {
  const cfg = { p1: ['hasim', 'hexor', 'magumba', 'plantae'], p2: ['genga', 'aqna', 'plantae', 'hasim'], map: 'field' };
  const r = replay(cfg, { p1: [4000], p2: [] });
  assert.match(r.error, /Bad move/);
  assert.equal(r.state.turn, 1);
});
