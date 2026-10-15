import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGAL } from '../src/legal-config.js';

test('legal config is complete: no empty fields, no placeholders, valid contact and links', () => {
  const walk = (v, path) => {
    if (typeof v === 'string') { assert.ok(v.trim(), path); assert.ok(!/\[[A-Z ]+\]|TODO|TBD/.test(v), `${path} still a placeholder`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
  };
  walk(LEGAL, 'LEGAL');
  assert.match(LEGAL.contactEmail, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  for (const c of [...LEGAL.credits, ...LEGAL.honorable]) assert.match(c.url, /^https:\/\//, c.name);
  assert.match(LEGAL.siteUrl, /^https:\/\//);
});

test('privacy facts stay equal to the server: idle room lifetime and chat history kept', () => {
  const src = readFileSync('server/ws-server.mjs', 'utf8');
  assert.equal(Number(src.match(/ROOM_TTL_MS = (\d+) \* 60 \* 1000/)[1]), LEGAL.roomIdleMinutes);
  assert.equal(Number(src.match(/CHAT_KEEP = (\d+)/)[1]), LEGAL.chatKept);
});
