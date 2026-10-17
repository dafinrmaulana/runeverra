import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGAL } from '../src/legal-config.ts';

test('legal config is complete: no empty fields, no placeholders, valid contact and links', () => {
  const walk = (value, path) => {
    if (typeof value === 'string') {
      assert.ok(value.trim(), path);
      assert.ok(!/\[[A-Z ]+\]|TODO|TBD/.test(value), `${path} still a placeholder`);
    } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([name, item]) => walk(item, `${path}.${name}`));
  };
  walk(LEGAL, 'LEGAL');
  assert.match(LEGAL.contactEmail, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  for (const c of [...LEGAL.credits, ...LEGAL.honorable]) assert.match(c.url, /^https:\/\//, c.name);
  assert.match(LEGAL.siteUrl, /^https:\/\//);
});

test('privacy facts stay equal to the server: idle room lifetime and chat history kept', () => {
  const src = readFileSync('server/ws-server.ts', 'utf8');
  assert.equal(Number(src.match(/ROOM_TTL_MS = (\d+) \* 60 \* 1000/)[1]), LEGAL.roomIdleMinutes);
  assert.equal(Number(src.match(/CHAT_KEEP = (\d+)/)[1]), LEGAL.chatKept);
});
