import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction } from '../src/arena.js';
import { DEMO_MATCH } from '../src/demo-match.js';

test('the home demo match replays legally to a winner and shows a variety of skills', () => {
  let g = createMatch(DEMO_MATCH.setup);
  const kinds = new Set();
  for (const [i, a] of DEMO_MATCH.trail.entries()) {
    const res = applyAction(g, a);
    assert.ok(res.ok, `ply ${i} should be legal: ${res.reason}`);
    g = res.state;
    if (g.lastAction?.kind) kinds.add(g.lastAction.kind);
  }
  assert.notEqual(g.status, 'playing', 'the demo ends with a winner');
  for (const k of ['capture', 'storm', 'grave', 'summon', 'ice']) assert.ok(kinds.has(k), `shows ${k}`);
});
