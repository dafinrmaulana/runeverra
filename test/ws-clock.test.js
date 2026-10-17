import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 8798;
let server;

before(async () => {
  server = spawn('node', ['server/ws-server.ts'], {
    env: { ...process.env, PORT: String(PORT), CLOCK_UNIT_MS: '100' },
    stdio: 'pipe',
  });
  await new Promise((res) => server.stdout.on('data', (chunk) => String(chunk).includes('listening') && res()));
});
after(() => server.kill());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function connect() {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.msgs = [];
    ws.on('message', (data) => ws.msgs.push(JSON.parse(data)));
    ws.on('open', () => res(ws));
  });
}
const send = (ws, message) => ws.send(JSON.stringify(message));
const find = (ws, type, from = 0) => ws.msgs.slice(from).find((message) => message.t === type);
const PICKS = ['hasim', 'genga', 'magumba', 'hexor'];

async function startMatch(minutes) {
  const a = await connect();
  send(a, { t: 'hello' });
  await sleep(160);
  const joined = find(a, 'joined');
  const b = await connect();
  send(b, { t: 'hello', code: joined.code });
  await sleep(160);
  if (minutes !== undefined) send(a, { t: 'clock', minutes });
  for (const w of [a, b]) send(w, { t: 'picks', picks: PICKS });
  await sleep(60);
  for (const w of [a, b]) send(w, { t: 'ready', ready: true });
  await sleep(160);
  return { a, b, joined, code: joined.code };
}

test('the host sets the time; start carries a running clock; the side to move times out for both', async () => {
  const { a, b } = await startMatch(2); // 2 "minutes" = 200 ms here
  const start = find(a, 'start');
  assert.ok(start.clock.ms.p1 <= 200 && start.clock.ms.p1 > 100);
  assert.equal(start.clock.running, 'p1');
  await sleep(400);
  for (const w of [a, b]) {
    const m = w.msgs.find((message) => message.t === 'move' && message.action.type === 'timeout');
    assert.ok(m, 'both sides hear the timeout');
    assert.equal(m.action.team, 'p1');
  }
  a.close();
  b.close();
});

test('a guest cannot change the time', async () => {
  const a = await connect();
  send(a, { t: 'hello' });
  await sleep(160);
  const code = find(a, 'joined').code;
  const b = await connect();
  send(b, { t: 'hello', code });
  await sleep(160);
  send(a, { t: 'clock', minutes: 3 });
  await sleep(60);
  send(b, { t: 'clock', minutes: 9 });
  await sleep(60);
  const last = [...a.msgs].reverse().find((message) => message.t === 'lobby');
  assert.equal(last.clockMs, 300);
  a.close();
  b.close();
});

test('Classic (no time set) has no clock at all', async () => {
  const { a, b } = await startMatch();
  assert.equal(find(a, 'start').clock, null);
  a.close();
  b.close();
});

test('opponent away pauses my clock; coming back resumes it', async () => {
  const { a, b, code } = await startMatch(30); // 3000 ms: far from timing out during the test
  const joinedB = find(b, 'joined');
  b.close();
  await sleep(250);
  const paused = [...a.msgs].reverse().find((message) => message.t === 'clock');
  assert.ok(paused, 'p1 hears the pause');
  assert.equal(paused.clock.running, null);
  const frozen = paused.clock.ms.p1;
  await sleep(200);
  const b2 = await connect();
  send(b2, { t: 'hello', code, side: joinedB.side, token: joinedB.token });
  await sleep(200);
  const sync = find(b2, 'sync');
  assert.ok(sync.clock, 'returning player gets a clock');
  assert.equal(sync.clock.running, 'p1', 'p1 is running again');
  assert.ok(Math.abs(sync.clock.ms.p1 - frozen) < 60, 'p1 did not drain while b was away');
  a.close();
  b2.close();
});

test('changing the time after the guest is Ready clears Ready, so both must agree again', async () => {
  const a = await connect();
  send(a, { t: 'hello' });
  await sleep(160);
  const code = find(a, 'joined').code;
  const b = await connect();
  send(b, { t: 'hello', code });
  await sleep(160);
  for (const w of [a, b]) send(w, { t: 'picks', picks: PICKS });
  await sleep(60);
  send(b, { t: 'ready', ready: true });
  await sleep(60);
  send(a, { t: 'clock', minutes: 5 });
  await sleep(60);
  const last = [...b.msgs].reverse().find((message) => message.t === 'lobby');
  assert.equal(last.you.ready, false, 'guest has to confirm the new time');
  send(a, { t: 'ready', ready: true });
  await sleep(200);
  assert.equal(find(a, 'start'), undefined, 'no match starts on a time the guest has not accepted');
  a.close();
  b.close();
});
