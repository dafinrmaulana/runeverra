import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, listActions } from '../src/arena.js';
import { matchFromConfig } from '../src/online.js';

const teams = { p1: ['hasim', 'hexor', 'magumba', 'plantae'], p2: ['genga', 'aqna', 'plantae', 'hasim'] };

test('a trusted timeout ends the match for the other side, and is logged', () => {
  const g = createMatch(teams);
  const res = applyAction(g, { type: 'timeout', team: 'p1' }, { trusted: true });
  assert.equal(res.ok, true);
  assert.equal(res.state.status, 'p2');
  assert.match(res.state.log.at(-1).text, /Ivory ran out of time/);
  assert.equal(res.state.trail.at(-1).type, 'timeout');
  assert.equal(g.status, 'playing', 'input state untouched');
});

test('an untrusted timeout (tampered client) is rejected', () => {
  const g = createMatch(teams);
  const res = applyAction(g, { type: 'timeout', team: 'p2' });
  assert.equal(res.ok, false);
  assert.equal(res.state.status, 'playing');
});

test('a timeout after the match is over, or for a bogus team, is rejected', () => {
  const g = applyAction(createMatch(teams), { type: 'timeout', team: 'p1' }, { trusted: true }).state;
  assert.equal(applyAction(g, { type: 'timeout', team: 'p2' }, { trusted: true }).ok, false);
  assert.equal(applyAction(createMatch(teams), { type: 'timeout', team: 'x' }, { trusted: true }).ok, false);
});

test('a timeout mid-match leaves a clean finished state', () => {
  let g = createMatch(teams);
  g = applyAction(g, listActions(g)[0]).state;
  const res = applyAction(g, { type: 'timeout', team: 'p2' }, { trusted: true });
  assert.equal(res.state.status, 'p1');
  assert.equal(res.state.phase, 'main');
  assert.equal(res.state.pending, null);
});

test('replaying the trail (with the timeout trusted) reaches the same end', () => {
  let g = createMatch(teams);
  g = applyAction(g, listActions(g)[0]).state;
  g = applyAction(g, { type: 'timeout', team: 'p2' }, { trusted: true }).state;
  let r = createMatch(g.setup);
  for (const a of g.trail) r = applyAction(r, a, { trusted: a.type === 'timeout' }).state;
  assert.equal(r.status, g.status);
});

test('setup remembers clockMs; Classic has none', () => {
  assert.equal(matchFromConfig({ ...teams, clockMs: 300000 }).setup.clockMs, 300000);
  assert.equal(matchFromConfig({ ...teams }).setup.clockMs, 0);
});
