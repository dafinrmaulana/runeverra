import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

// A tampered client must get an error back, never crash the relay for every other room.
const PORT = 8799;
let server;
before(async () => {
  server = spawn('node', ['server/ws-server.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
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
const find = (ws, type) => ws.msgs.find((message) => message.t === type);
/** Wait for a message matching `pred` after index `from` (no fixed sleeps: tests run in parallel). */
async function until(ws, pred, from = 0, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(20)) {
    const m = ws.msgs.slice(from).find(pred);
    if (m) return m;
  }
  throw new Error('timed out waiting for a message');
}

test('crafted actions and hero ids are refused and the relay keeps running', async () => {
  const a = await connect();
  send(a, { t: 'hello' });
  const { code } = await until(a, (message) => message.t === 'joined');
  const b = await connect();
  send(b, { t: 'hello', code });
  await until(b, (message) => message.t === 'joined');
  // "toString" is not a hero, even though every object has one
  const from = a.msgs.length;
  send(a, { t: 'picks', picks: ['hasim', 'genga', 'magumba', 'toString'] });
  assert.deepEqual((await until(a, (message) => message.t === 'lobby', from)).you.picks, ['hasim', 'genga', 'magumba']);
  for (const w of [a, b]) send(w, { t: 'picks', picks: ['hasim', 'genga', 'magumba', 'hexor'] });
  for (const w of [a, b]) await until(w, (message) => message.t === 'lobby' && message.you.picks.length === 4);
  for (const w of [a, b]) send(w, { t: 'ready', ready: true });
  for (const w of [a, b]) await until(w, (message) => message.t === 'start');
  const p1 = find(a, 'joined').side === 'p1' ? a : b;
  const before = p1.msgs.length;
  for (const action of [
    { type: 'skill', unitId: 'p1-creep-a' }, // a creep has no skill
    { type: 'move', unitId: '__proto__', to: { r: 0, c: 0 } },
    { type: 'skill', unitId: 'constructor', targetId: 'toString' },
    { type: 'move', unitId: 'p1-hasim', to: 'nowhere' },
  ])
    send(p1, { t: 'action', action });
  await until(p1, (_message, _index, all) => all.filter((received) => received.t === 'error').length === 4, before);
  assert.equal(p1.msgs.slice(before).filter((message) => message.t === 'error').length, 4, 'one error per bad action');
  assert.equal(server.exitCode, null, 'relay still running');
  const c = await connect();
  send(c, { t: 'hello' });
  assert.ok(await until(c, (message) => message.t === 'joined'), 'relay still serves new rooms');
  for (const w of [a, b, c]) w.close();
});
