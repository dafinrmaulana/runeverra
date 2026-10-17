import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutesToMs,
  createClock,
  remaining,
  setRunning,
  expired,
  snapshot,
  fromSnapshot,
  formatClock,
} from '../src/clock.ts';

test('minutesToMs accepts 1-60 whole minutes, anything else is Classic (0)', () => {
  assert.equal(minutesToMs(5), 300000);
  assert.equal(minutesToMs('3'), 180000);
  for (const bad of [0, -1, 61, NaN, 'x', undefined]) assert.equal(minutesToMs(bad), 0);
});

test('only the running side loses time; switching charges the elapsed time', () => {
  let c = createClock(60000);
  assert.equal(remaining(c, 'p1', 0), 60000);
  c = setRunning(c, 'p1', 1000);
  assert.equal(remaining(c, 'p1', 4000), 57000);
  assert.equal(remaining(c, 'p2', 4000), 60000);
  c = setRunning(c, 'p2', 4000);
  assert.equal(remaining(c, 'p1', 9000), 57000, 'p1 stopped');
  assert.equal(remaining(c, 'p2', 9000), 55000);
});

test('expired reports the running side that hit 0, never the idle one', () => {
  let c = setRunning(createClock(1000), 'p2', 0);
  assert.equal(expired(c, 999), null);
  assert.equal(expired(c, 1000), 'p2');
  assert.equal(remaining(c, 'p2', 5000), 0, 'never negative');
  c = setRunning(c, null, 400);
  assert.equal(expired(c, 99999), null, 'paused clock never expires');
});

test('interrupt: the clock follows whoever decides (caller passes toMove), so the actor stops draining', () => {
  let c = setRunning(createClock(10000), 'p1', 0); // p1 acts
  c = setRunning(c, 'p2', 2000); // p2 is asked whether to interrupt
  assert.equal(remaining(c, 'p1', 6000), 8000);
  assert.equal(remaining(c, 'p2', 6000), 6000);
});

test('snapshot round-trips to another timeline', () => {
  const c = setRunning(createClock(10000), 'p1', 100);
  const snap = snapshot(c, 1100);
  assert.deepEqual(snap, { ms: { p1: 9000, p2: 10000 }, running: 'p1' });
  const mirror = fromSnapshot(snap, 50000);
  assert.equal(remaining(mirror, 'p1', 52000), 7000);
});

test('formatClock rounds up to whole seconds as m:ss', () => {
  assert.equal(formatClock(300000), '5:00');
  assert.equal(formatClock(59001), '1:00');
  assert.equal(formatClock(61000), '1:01');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(-5), '0:00');
});
