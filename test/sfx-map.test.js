import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction } from '../src/engine/index.ts';
import { sfxFor } from '../src/sfx-map.ts';
import { DEMO_MATCH } from '../src/demo-match.ts';

test('every skill and takedown has its own sound; skips are silent; a beast steps lighter than a hero', () => {
  for (const k of ['capture', 'backstab', 'grave', 'root', 'interrupt', 'storm', 'ice', 'summon'])
    assert.equal(sfxFor({ kind: k }), k);
  assert.equal(sfxFor({ kind: 'move', unitId: 'b' }, { b: { kind: 'beast' } }), 'beast');
  assert.equal(sfxFor({ kind: 'move', unitId: 'h' }, { h: { kind: 'hero' } }), 'move');
  assert.equal(sfxFor({ kind: 'shieldbreak' }), 'shield');
  for (const k of ['skip-beast', 'skip-ice', 'skip-storm', 'skip-pawn', 'react', undefined])
    assert.equal(sfxFor({ kind: k }), null);
  assert.equal(sfxFor(null), null);
});

test('replaying the demo match, every action that changes the board gets a sound and the skip follow-ups do not', () => {
  let g = createMatch(DEMO_MATCH.setup);
  const heard = new Set();
  for (const a of DEMO_MATCH.trail) {
    const before = g;
    g = applyAction(g, a).state;
    const name = sfxFor(g.lastAction !== before.lastAction ? g.lastAction : null, g.units);
    // (an action waiting on the opponent's interrupt prompt sounds once it is answered)
    if ((a.type === 'move' || a.type === 'skill') && g.phase !== 'react')
      assert.ok(name, `${a.type} ${JSON.stringify(g.lastAction?.kind)} should make a sound`);
    if (name) heard.add(name);
  }
  assert.ok(heard.size >= 4, `heard ${[...heard].join(',')}`);
});
