import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 8797;
let server;
before(async () => {
  server = spawn('node', ['server/ws-server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('listening') && res()));
});
after(() => server.kill());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = () => new Promise((res) => {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  ws.msgs = [];
  ws.on('message', (d) => ws.msgs.push(JSON.parse(d)));
  ws.on('open', () => res(ws));
});
const send = (ws, m) => ws.send(JSON.stringify(m));
const chats = (ws) => ws.msgs.filter((m) => m.t === 'chat');

async function room() {
  const a = await connect(); send(a, { t: 'hello' }); await sleep(160);
  const joinedA = a.msgs.find((m) => m.t === 'joined');
  const b = await connect(); send(b, { t: 'hello', code: joinedA.code }); await sleep(160);
  return { a, b, joinedA, joinedB: b.msgs.find((m) => m.t === 'joined') };
}

test('a chat message reaches both players, tagged with the sender side', async () => {
  const { a, b } = await room();
  send(a, { t: 'chat', text: 'gg  wp' }); await sleep(160);
  for (const w of [a, b]) {
    assert.equal(chats(w).length, 1);
    assert.equal(chats(w)[0].side, 'p1');
    assert.equal(chats(w)[0].text, 'gg wp', 'whitespace collapsed');
    assert.ok(chats(w)[0].ts > 0);
  }
  a.close(); b.close();
});

test('text is cleaned and capped; empty and non-string messages are dropped', async () => {
  const { a, b } = await room();
  send(a, { t: 'chat', text: 'x'.repeat(500) });
  send(a, { t: 'chat', text: 'a\u0000b\u0007c\nd' });
  send(a, { t: 'chat', text: '   ' });
  send(a, { t: 'chat', text: { evil: true } });
  await sleep(200);
  const got = chats(b);
  assert.equal(got.length, 2);
  assert.equal(got[0].text.length, 200);
  assert.equal(got[1].text, 'a b c d', 'control characters become spaces');
  a.close(); b.close();
});

test('more than 5 messages in 5 seconds are refused with a chat-specific notice', async () => {
  const { a, b } = await room();
  for (let i = 0; i < 8; i++) send(a, { t: 'chat', text: `m${i}` });
  await sleep(250);
  assert.equal(chats(b).length, 5);
  assert.ok(a.msgs.some((m) => m.t === 'chatlimit'));
  assert.ok(!a.msgs.some((m) => m.t === 'error'), 'must not use the game error (the client reconnects on those)');
  a.close(); b.close();
});

test('a player who rejoins gets the recent history', async () => {
  const { a, b, joinedB } = await room();
  send(a, { t: 'chat', text: 'hello' }); await sleep(160);
  const code = a.msgs.find((m) => m.t === 'joined').code;
  b.close(); await sleep(160);
  const b2 = await connect();
  send(b2, { t: 'hello', code, side: joinedB.side, token: joinedB.token }); await sleep(200);
  const log = b2.msgs.find((m) => m.t === 'chatlog');
  assert.ok(log, 'history sent on rejoin');
  assert.deepEqual(log.log.map((m) => m.text), ['hello']);
  a.close(); b2.close();
});
