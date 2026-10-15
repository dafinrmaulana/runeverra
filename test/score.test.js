import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScore, BAR, BARS, LOOP_SECONDS, EIGHTH } from '../src/score.js';

const score = buildScore();
const D_MINOR = new Set([0, 2, 3, 5, 7, 8, 10, 1 /* C# leading tone allowed */]);

test('the theme is a seamless loop of 48 bars of 6/8, sorted and inside its own length', () => {
  assert.equal(BARS, 48);
  assert.ok(Math.abs(LOOP_SECONDS - BARS * 6 * EIGHTH) < 1e-9);
  for (let i = 1; i < score.length; i++) assert.ok(score[i].t >= score[i - 1].t, 'sorted');
  for (const n of score) assert.ok(n.t >= 0 && n.t < LOOP_SECONDS, `note at ${n.t} is inside the loop`);
  assert.ok(score.length > 400, `plenty of notes (${score.length})`);
});

test('it builds up: nothing but drone and drums in the first bars, the full band later', () => {
  const voicesIn = (a, b) => new Set(score.filter((n) => n.t >= a * BAR && n.t < b * BAR).map((n) => n.voice));
  assert.deepEqual([...voicesIn(0, 4)].sort(), ['pad', 'timpani']);
  assert.ok(voicesIn(4, 8).has('cello'));
  for (const v of ['cello', 'timpani', 'drum', 'pad', 'lead', 'horn', 'choir']) assert.ok(voicesIn(24, 40).has(v), `${v} plays in the climax`);
});

test('every pitched note is in D minor and in a playable range', () => {
  for (const n of score) {
    if (['timpani', 'drum'].includes(n.voice)) continue;
    assert.ok(D_MINOR.has(((n.midi % 12) + 12 - 2) % 12 + 0 === 0 ? 0 : ((n.midi - 2 + 120) % 12)), `${n.voice} ${n.midi}`);
    assert.ok(n.midi >= 30 && n.midi <= 91, `${n.voice} ${n.midi} in range`);
    assert.ok(n.vel > 0 && n.vel <= 1 && n.dur > 0, 'sane velocity and length');
  }
});
