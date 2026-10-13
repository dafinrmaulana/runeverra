import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREEPS,
  createMatch, applyAction, listActions, moveOptions, livingHeroes, unitAt, blockAt, parseSquare as sq,
  getThreats, toMove, HEROES, MAPS, key, ENERGY, TEAM_SIZE,
} from '../src/arena.js';

/** Custom position. spec: { 'p1-hasim': 'd4', ... }; listed units are kept (others removed). */
function setup(spec, { current = 'p1', energy = { p1: 0, p2: 0 }, blocks = {}, p1, p2, map = 'field' } = {}) {
  const s = createMatch({ p1: p1 || ['hasim', 'hexor', 'magumba', 'plantae'], p2: p2 || ['genga', 'aqna', 'plantae', 'hasim'], map });
  for (const id of Object.keys(s.units)) {
    if (spec[id]) s.units[id].pos = sq(spec[id]); else delete s.units[id];
  }
  for (const [n, kind] of Object.entries(blocks)) s.blocks[key(sq(n))] = { kind };
  s.current = current; s.energy = { ...energy };
  return s;
}
const act = (s, a) => { const r = applyAction(s, a); assert.ok(r.ok, r.reason); return r.state; };
const reject = (s, a) => { const r = applyAction(s, a); assert.equal(r.ok, false); assert.equal(r.state, s); return r.reason; };
const mv = (unitId, to) => ({ type: 'move', unitId, to: sq(to) });

test('setup: 4 heroes each, beast beside Ge\'nga, symmetric map blocks, no first-move kills', () => {
  assert.equal(TEAM_SIZE, 4);
  for (const map of Object.keys(MAPS)) {
    const s = createMatch({ p1: ['hasim', 'genga', 'hexor', 'aqna'], p2: ['genga', 'aqna', 'plantae', 'magumba'], map });
    assert.equal(livingHeroes(s, 'p1').length, 4);
    assert.equal(livingHeroes(s, 'p2').length, 4);
    assert.ok(s.units['p1-beast'] && s.units['p2-beast']);
    for (const k of Object.keys(s.blocks)) {
      const [r, c] = k.split(',').map(Number);
      assert.ok(s.blocks[`${7 - r},${7 - c}`], `${map} not symmetric at ${k}`);
    }
    const heroThreats = (t) => [...getThreats(s, t)].filter((id) => s.units[id].kind === 'hero');
    assert.deepEqual(heroThreats('p1'), [], `${map}: a hero can be hit on move 1`);
    assert.deepEqual(heroThreats('p2'), [], `${map}: a hero can be hit on move 1`);
    assert.equal(Object.values(s.units).filter((u) => u.kind === 'creep').length, 8);
  }
  assert.throws(() => createMatch({ p1: ['hasim', 'hasim', 'hexor', 'aqna'] }));
  assert.throws(() => createMatch({ p1: ['hasim', 'hexor', 'aqna'] }));
});

test('roles: Roam moves 2 straight, Assassin 2 in any direction, Support 1, Hexor is a Roam with an L jump', () => {
  assert.equal(HEROES.aqna.role, 'roam');
  assert.equal(HEROES.hexor.role, 'roam');
  assert.equal(HEROES.hasim.role, 'assassin');
  assert.equal(HEROES.plantae.role, 'support');
  assert.equal(ENERGY.max, 4);
  const s = setup({ 'p1-hasim': 'd4', 'p1-hexor': 'a1', 'p2-aqna': 'h4', 'p2-plantae': 'h8' });
  const names = (u) => moveOptions(s, s.units[u]).map((o) => 'abcdefgh'[o.to.c] + (8 - o.to.r)).sort();
  assert.deepEqual(names('p1-hasim'), ['b2', 'b4', 'b6', 'c3', 'c4', 'c5', 'd2', 'd3', 'd5', 'd6', 'e3', 'e4', 'e5', 'f2', 'f4', 'f6']);
  assert.deepEqual(names('p2-aqna'), ['f4', 'g4', 'h2', 'h3', 'h5', 'h6']);
  assert.deepEqual(names('p2-plantae'), ['g8', 'h7']);
});

test('basic movement per hero, terrain blocks, capture by moving', () => {
  const s = setup({ 'p1-hexor': 'd4', 'p1-hasim': 'a1', 'p2-aqna': 'e6', 'p2-plantae': 'h8' }, { blocks: { c6: 'rock' } });
  const hex = moveOptions(s, s.units['p1-hexor']).map((o) => o.to);
  assert.ok(!hex.some((p) => p.r === sq('c6').r && p.c === sq('c6').c), 'cannot land on terrain');
  const n = act(s, mv('p1-hexor', 'e6'));
  assert.equal(n.units['p2-aqna'].alive, false);
  const s2 = setup({ 'p1-hasim': 'a3', 'p2-aqna': 'a5', 'p2-plantae': 'h8' }, { current: 'p2' });
  reject(s2, mv('p2-plantae', 'h6')); // Plantae steps 1 only
  reject(s2, mv('p2-aqna', 'a2'));    // Aqna slides at most 2
  const n2 = act(s2, mv('p2-aqna', 'a3'));
  assert.equal(n2.units['p1-hasim'].alive, false);
});

test('Hasim Backstab: free signature move in any direction; kills jumped enemy and landing enemy', () => {
  let s = setup({ 'p1-hasim': 'd4', 'p1-hexor': 'a1', 'p2-aqna': 'd5', 'p2-plantae': 'd6', 'p2-genga': 'h8' });
  assert.equal(s.energy.p1, 0);
  s = act(s, mv('p1-hasim', 'd6'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.equal(s.units['p2-plantae'].alive, false);
  assert.deepEqual(s.units['p1-hasim'].pos, sq('d6'));
  assert.equal(s.energy.p1, 0, 'costs no tokens');
  // over an ally: no kill; over terrain: allowed
  let t = setup({ 'p1-hasim': 'd4', 'p1-hexor': 'c5', 'p2-genga': 'h8' }, { blocks: { d5: 'pillar' } });
  t = act(t, mv('p1-hasim', 'b6'));
  assert.equal(t.units['p1-hexor'].alive, true);
  act(setup({ 'p1-hasim': 'd4', 'p2-genga': 'h8' }, { blocks: { d5: 'pillar' } }), mv('p1-hasim', 'd6'));
  // back, back-diagonal, sideways
  const t3 = setup({ 'p1-hasim': 'd4', 'p2-aqna': 'd3', 'p2-plantae': 'c3', 'p2-genga': 'h8', 'p2-beast': 'e4' });
  assert.equal(act(t3, mv('p1-hasim', 'd2')).units['p2-aqna'].alive, false);
  assert.equal(act(t3, mv('p1-hasim', 'b2')).units['p2-plantae'].alive, false);
  assert.equal(act(t3, mv('p1-hasim', 'f4')).units['p2-beast'].alive, false);
  // over an empty square it is just a 2-square move: nobody dies; never 3 squares
  const plain = act(t3, mv('p1-hasim', 'f6'));
  assert.equal(Object.values(plain.units).filter((u) => !u.alive).length, 0);
  reject(t3, mv('p1-hasim', 'd7'));
});

test('Ge\'nga: the beast follow-up costs 1 token and is only offered when affordable', () => {
  let s = setup({ 'p2-genga': 'd8', 'p2-beast': 'd7', 'p2-plantae': 'h8', 'p1-hasim': 'a1' }, { current: 'p2', energy: { p1: 0, p2: 1 } });
  assert.match(reject(s, mv('p2-beast', 'd6')), /after Ge'nga/);
  s = act(s, mv('p2-genga', 'b8'));
  assert.equal(s.phase, 'beast');
  assert.equal(s.current, 'p2');
  assert.ok(listActions(s).some((a) => a.type === 'skip'));
  const skipped = act(s, { type: 'skip' });
  assert.equal(skipped.energy.p2, 1, 'skipping is free');
  s = act(s, mv('p2-beast', 'd6'));
  assert.equal(s.current, 'p1');
  assert.equal(s.energy.p2, 0);
  const poor = act(setup({ 'p2-genga': 'd8', 'p2-beast': 'd7', 'p2-plantae': 'h8', 'p1-hasim': 'a1' }, { current: 'p2' }), mv('p2-genga', 'b8'));
  assert.equal(poor.current, 'p1', 'no token: no beast phase');
  // beast flees when Ge'nga falls
  let k = setup({ 'p2-genga': 'd5', 'p2-beast': 'h7', 'p2-plantae': 'h8', 'p1-aqna': 'd3', 'p1-hasim': 'a1' }, { p1: ['aqna', 'hasim', 'hexor', 'magumba'] });
  k = act(k, mv('p1-aqna', 'd5'));
  assert.equal(k.units['p2-beast'].alive, false);
});

test('Magumba Empty Grave: costs 2 tokens, protects an ally from captures until caster\'s next turn', () => {
  let s = setup({ 'p1-magumba': 'c3', 'p1-hasim': 'd4', 'p1-hexor': 'a1', 'p2-aqna': 'd6', 'p2-plantae': 'h8' }, { p1: ['magumba', 'hasim', 'hexor', 'aqna'], energy: { p1: 1, p2: 0 } });
  assert.match(reject(s, { type: 'skill', unitId: 'p1-magumba', skill: 'grave', targetId: 'p1-hasim' }), /needs 2 tokens/);
  s.energy.p1 = 2;
  s = act(s, { type: 'skill', unitId: 'p1-magumba', skill: 'grave', targetId: 'p1-hasim' });
  assert.equal(s.energy.p1, 0);
  assert.equal(s.units['p1-hasim'].warded, true);
  assert.match(reject(s, mv('p2-aqna', 'd4')), /Empty Grave/);
  s = act(s, mv('p2-aqna', 'e6'));
  assert.equal(s.units['p1-hasim'].warded, false, 'wears off at the start of Ivory\'s turn');
});

test('Plantae Aggressive Root: 2 tokens, roots a target for its next turn', () => {
  let s = setup({ 'p2-plantae': 'd6', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { current: 'p2', energy: { p1: 0, p2: 2 } });
  s = act(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hexor' });
  assert.equal(s.energy.p2, 0);
  assert.equal(s.current, 'p1');
  assert.match(reject(s, mv('p1-hexor', 'e6')), /roots/);
  s = act(s, mv('p1-hasim', 'a2'));
  s = act(s, mv('p2-aqna', 'h7'));
  assert.equal(s.units['p1-hexor'].rooted, 0);
  act(s, mv('p1-hexor', 'e6'));
});

test('Plantae interrupt: 3 tokens, negates the action, then Plantae is rooted on its next turn (the hole)', () => {
  const base = setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } });
  const s = act(base, mv('p1-hexor', 'e6'));
  assert.equal(s.phase, 'react');
  assert.equal(toMove(s), 'p2');
  assert.deepEqual(s.units['p1-hexor'].pos, sq('d4'), 'action is on hold');
  let used = act(s, { type: 'react', use: true });
  assert.deepEqual(used.units['p1-hexor'].pos, sq('d4'));
  assert.equal(used.current, 'p2', 'Ivory\'s turn is over; Ember plays normally');
  assert.equal(used.energy.p2, 0, '3 spent, no refill on the new turn');
  assert.equal(used.units['p2-plantae'].rooted, 1);
  assert.ok(!listActions(used).some((a) => a.unitId === 'p2-plantae'), 'Plantae is stuck this turn');
  assert.match(reject(used, mv('p2-plantae', 'd6')), /roots/);
  assert.ok(used.log.some((l) => /rooted in place/.test(l.text)));
  used = act(used, mv('p2-aqna', 'h7'));
  assert.equal(used.units['p2-plantae'].rooted, 0, 'free again afterwards');
  const declined = act(s, { type: 'react', use: false });
  assert.deepEqual(declined.units['p1-hexor'].pos, sq('e6'));
  // out of range or not enough tokens: no prompt
  const far = act(setup({ 'p2-plantae': 'h8', 'p2-aqna': 'a8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } }), mv('p1-hexor', 'e6'));
  assert.equal(far.phase, 'main');
  const poor = act(setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 2 } }), mv('p1-hexor', 'e6'));
  assert.equal(poor.phase, 'main');
});

test('Hexor Storm Hammer: optional 2-token slam after a capture; pushes, chains, kills on terrain/edge, spares warded', () => {
  const pos = {
    'p1-hexor': 'b3', 'p1-hasim': 'b6', 'p1-magumba': 'c6',
    'p2-aqna': 'c5', 'p2-plantae': 'd5', 'p2-genga': 'e5', 'p2-beast': 'd4',
  };
  let s = setup(pos, { blocks: { e3: 'rock' }, energy: { p1: 2, p2: 0 } });
  s.units['p1-magumba'].warded = true;
  s = act(s, mv('p1-hexor', 'c5'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.equal(s.phase, 'storm');
  assert.deepEqual(listActions(s), [{ type: 'storm' }, { type: 'skip' }]);
  const skipped = act(s, { type: 'skip' });
  assert.equal(skipped.current, 'p2');
  assert.deepEqual(skipped.units['p2-plantae'].pos, sq('d5'), 'skip: nobody is pushed');
  assert.equal(skipped.energy.p2, 0, 'tokens do not refill each turn');
  s = act(s, { type: 'storm' });
  assert.equal(s.energy.p1, 0);
  assert.equal(s.lastAction.kind, 'storm');
  assert.deepEqual(s.units['p2-plantae'].pos, sq('e5'));
  assert.deepEqual(s.units['p2-genga'].pos, sq('f5'));
  assert.deepEqual(s.units['p1-hasim'].pos, sq('a7'));
  assert.deepEqual(s.units['p1-magumba'].pos, sq('c6'));
  assert.equal(s.units['p2-beast'].alive, false, 'slammed into the rock');
  // not enough tokens: no storm phase
  const poor = act(setup(pos, { blocks: { e3: 'rock' }, energy: { p1: 1, p2: 0 } }), mv('p1-hexor', 'c5'));
  assert.equal(poor.phase, 'main');
  assert.equal(poor.current, 'p2');
  // board edge counts as terrain
  let e = setup({ 'p1-hexor': 'c5', 'p2-aqna': 'b7', 'p2-plantae': 'a8', 'p2-genga': 'h1' }, { energy: { p1: 2, p2: 0 } });
  e = act(act(e, mv('p1-hexor', 'b7')), { type: 'storm' });
  assert.equal(e.units['p2-plantae'].alive, false);
});

test('Aqna Icy Step: 1 token for ice after a kill; ice blocks everyone; oldest moves at the limit', () => {
  const pos = { 'p1-aqna': 'a3', 'p1-hasim': 'h1', 'p2-plantae': 'a5', 'p2-genga': 'h8' };
  const poor = act(setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'] }), mv('p1-aqna', 'a5'));
  assert.equal(poor.phase, 'main', 'no token: no ice');
  let s = setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } });
  s = act(s, mv('p1-aqna', 'a5'));
  assert.equal(s.phase, 'ice');
  assert.match(reject(s, { type: 'ice', to: sq('a1') }), /within 3/);
  s = act(s, { type: 'ice', to: sq('c5') });
  assert.equal(blockAt(s, sq('c5')).kind, 'ice');
  assert.equal(s.current, 'p2');
  assert.equal(s.energy.p1, 0);
  const sl = moveOptions(s, s.units['p1-aqna']).map((o) => o.to);
  assert.ok(!sl.some((p) => p.c >= 2 && p.r === sq('c5').r), 'her own ice blocks her slide');
  // limit
  let t = setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } });
  t.iceBy['p1-aqna'] = [];
  const spots = ['h3', 'h4', 'g3', 'g4', 'f3', 'f4', 'e3', 'e4', 'h5', 'g5'];
  for (const n of spots) { t.blocks[key(sq(n))] = { kind: 'ice', owner: 'p1-aqna' }; t.iceBy['p1-aqna'].push(key(sq(n))); }
  t = act(t, mv('p1-aqna', 'a5'));
  t = act(t, { type: 'ice', to: sq('b6') });
  assert.equal(blockAt(t, sq('h3')), null, 'oldest block moved');
  assert.equal(t.iceBy['p1-aqna'].length, 10);
  // skip is allowed and free
  let u = setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } });
  u = act(act(u, mv('p1-aqna', 'a5')), { type: 'skip' });
  assert.equal(u.current, 'p2');
  assert.equal(u.energy.p1, 1);
});

test('tokens: start full at 4, never refill per turn, only creeps give more (capped at 4)', () => {
  let s = createMatch({ map: 'field' });
  assert.deepEqual(s.energy, { p1: 4, p2: 4 });
  s = act(s, mv('p1-hasim', 'c2'));
  assert.equal(s.energy.p2, 4);
  s.energy = { p1: 1, p2: 1 };
  s = act(s, mv('p2-creep-a', 'a6'));
  s = act(s, mv('p1-creep-a', 'a3'));
  assert.deepEqual(s.energy, { p1: 1, p2: 1 }, 'no +1 per turn');
  assert.equal(CREEPS.lastHit, 1);
  assert.equal(CREEPS.breach, 1);
  // a creep kill at full tokens stays at the cap
  let k = setup({ 'p1-aqna': 'd4', 'p1-hasim': 'a1', 'p2-creep-b': 'd6', 'p2-genga': 'h8' }, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 4, p2: 0 } });
  k = act(k, mv('p1-aqna', 'd6'));
  if (k.phase === 'ice') k = act(k, { type: 'skip' });
  assert.equal(k.energy.p1, 4);
});

test('win when every enemy hero is down (beasts do not count)', () => {
  let s = setup({ 'p1-aqna': 'a3', 'p1-hasim': 'h1', 'p2-plantae': 'a5', 'p2-beast': 'h8' }, { p1: ['aqna', 'hasim', 'hexor', 'magumba'] });
  s.units['p2-beast'].ownerId = 'p2-genga';
  s = act(s, mv('p1-aqna', 'a5'));
  assert.equal(s.status, 'p1');
  assert.equal(listActions(s).length, 0);
});

test('random play: every listed action is accepted, no shared squares, tokens stay in range', () => {
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const heroes = Object.keys(HEROES);
  let finished = 0;
  for (let g = 0; g < 60; g++) {
    const pick = () => { const h = [...heroes]; const out = []; while (out.length < 4) out.push(h.splice(Math.floor(rnd() * h.length), 1)[0]); return out; };
    let s = createMatch({ p1: pick(), p2: pick(), map: Object.keys(MAPS)[g % 5] });
    for (let n = 0; n < 400 && s.status === 'playing'; n++) {
      const acts = listActions(s);
      assert.ok(acts.length > 0, 'a playing state always has an action');
      s = act(s, acts[Math.floor(rnd() * acts.length)]);
      const pos = Object.values(s.units).filter((u) => u.alive).map((u) => key(u.pos));
      assert.equal(new Set(pos).size, pos.length);
      assert.ok(pos.every((k) => !s.blocks[k]), 'no unit inside terrain');
      for (const t of ['p1', 'p2']) assert.ok(s.energy[t] >= 0 && s.energy[t] <= ENERGY.max + 2, `tokens out of range: ${s.energy[t]}`);
    }
    if (s.status !== 'playing') finished++;
  }
  assert.ok(finished > 30, `only ${finished}/60 random matches finished`);
});

test('creeps: start on the flank files and are moved by their player like pawns', () => {
  let s = createMatch({ map: 'field' });
  assert.deepEqual(s.units['p1-creep-a'].pos, sq('a2'));
  assert.deepEqual(s.units['p1-creep-b'].pos, sq('b2'));
  assert.deepEqual(s.units['p2-creep-h'].pos, sq('h7'));
  assert.deepEqual(s.units['p2-creep-a'].pos, sq('a7'));
  const creepMoves = listActions(s).filter((a) => a.unitId === 'p1-creep-a');
  assert.deepEqual(creepMoves.map((a) => a.to), [sq('a3')], 'one step forward only');
  reject(s, mv('p1-creep-a', 'a4'));
  reject(s, mv('p1-creep-b', 'c2'));
  s = act(s, mv('p1-creep-a', 'a3'));
  assert.equal(s.current, 'p2');
  assert.deepEqual(s.units['p1-creep-b'].pos, sq('b2'), 'other creeps stay put');
  reject(s, mv('p2-creep-h', 'h8'));
});

test('creeps: capture diagonally, are blocked straight ahead, break through for tokens', () => {
  let s = setup({ 'p1-creep-b': 'c4', 'p1-hasim': 'a1', 'p2-aqna': 'd5', 'p2-genga': 'h8' });
  s = act(s, mv('p1-creep-b', 'd5'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.deepEqual(s.units['p1-creep-b'].pos, sq('d5'));
  const b = setup({ 'p1-creep-b': 'c4', 'p1-hasim': 'a1', 'p2-genga': 'c5', 'p2-plantae': 'h8' });
  reject(b, mv('p1-creep-b', 'c5'));
  let r = setup({ 'p1-creep-g': 'e7', 'p1-hasim': 'a1', 'p2-genga': 'h8' });
  r.energy = { p1: 1, p2: 0 };
  r = act(r, mv('p1-creep-g', 'e8'));
  assert.equal(r.units['p1-creep-g'].alive, false);
  assert.equal(r.energy.p1, 1 + CREEPS.breach);
  assert.ok(r.lastAction.breach);
});

test('creeps: last hit gives a token; a creep capture can win the game; rooted creeps cannot move', () => {
  let s = setup({ 'p1-aqna': 'd4', 'p1-hasim': 'a1', 'p2-creep-b': 'd6', 'p2-genga': 'h8' }, { p1: ['aqna', 'hasim', 'hexor', 'magumba'] });
  s.energy = { p1: 0, p2: 0 };
  s = act(s, mv('p1-aqna', 'd6'));
  assert.equal(s.energy.p1, CREEPS.lastHit);
  let w = setup({ 'p1-creep-b': 'c4', 'p1-hasim': 'a1', 'p2-aqna': 'd5' });
  w = act(w, mv('p1-creep-b', 'd5'));
  assert.equal(w.status, 'p1');
  const rt = setup({ 'p1-creep-b': 'c4', 'p1-hasim': 'a1', 'p2-genga': 'h8' });
  rt.units['p1-creep-b'].rooted = 1;
  assert.match(reject(rt, mv('p1-creep-b', 'c5')), /roots/);
});

test('creeps can be turned off', () => {
  const s = createMatch({ map: 'field', creeps: false });
  assert.equal(Object.values(s.units).filter((u) => u.kind === 'creep').length, 0);
});

test('Aggressive Root has a 3-turn cooldown shared by active use and interrupts', () => {
  let s = setup({ 'p2-plantae': 'd6', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { current: 'p2', energy: { p1: 0, p2: 4 } });
  s = act(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hexor' });
  assert.equal(s.units['p2-plantae'].cd, 3);
  s = act(s, mv('p1-hasim', 'a2'));
  assert.equal(s.units['p2-plantae'].cd, 2);
  s.energy.p2 = 4;
  assert.match(reject(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hasim' }), /recharging: ready in 2 turns/);
  s = act(s, mv('p2-aqna', 'h7'));
  const noPrompt = act(s, mv('p1-hexor', 'e6'));
  assert.equal(noPrompt.phase, 'main');
  // an interrupt also starts the cooldown
  const base = setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 4 } });
  let r = act(act(base, mv('p1-hexor', 'e6')), { type: 'react', use: true });
  assert.equal(r.units['p2-plantae'].cd, 2, 'set to 3, ticked at the start of Ember\'s turn');
  r = act(r, mv('p2-aqna', 'h7'));
  r = act(r, mv('p1-hasim', 'a2'));
  assert.equal(r.units['p2-plantae'].cd, 1);
  assert.equal(listActions(r).some((a) => a.type === 'skill'), false);
});

test('Aggressive Root can interrupt again once recharged (no per-match cap)', () => {
  const base = setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 4 } });
  let s = act(act(base, mv('p1-hexor', 'e6')), { type: 'react', use: true });
  assert.equal(s.units['p2-plantae'].reacts, 1);
  s = act(s, mv('p2-aqna', 'h7'));
  s.units['p2-plantae'].cd = 0; s.energy.p2 = 4;
  const again = act(s, mv('p1-hexor', 'e6'));
  assert.equal(again.phase, 'react', 'a second interrupt is offered');
});

test('Storm Hammer never kills Hexor\'s own allies: blocked allies stay put', () => {
  const opts = { energy: { p1: 2, p2: 0 } };
  let s = setup({ 'p1-hexor': 'c5', 'p1-hasim': 'a8', 'p1-creep-b': 'c8', 'p2-aqna': 'b7', 'p2-plantae': 'a7', 'p2-genga': 'h1' }, opts);
  s = act(act(s, mv('p1-hexor', 'b7')), { type: 'storm' });
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.equal(s.units['p2-plantae'].alive, false, 'enemy off the board is eliminated');
  assert.equal(s.units['p1-hasim'].alive, true, 'ally is not eliminated');
  assert.deepEqual(s.units['p1-hasim'].pos, sq('a8'));
  assert.equal(s.units['p1-creep-b'].alive, true);
  assert.deepEqual(s.units['p1-creep-b'].pos, sq('c8'));
  let t = setup({ 'p1-hexor': 'b3', 'p1-hasim': 'd5', 'p2-aqna': 'c5', 'p2-genga': 'h1' }, { ...opts, blocks: { e5: 'rock' } });
  t = act(act(t, mv('p1-hexor', 'c5')), { type: 'storm' });
  assert.equal(t.units['p1-hasim'].alive, true);
  assert.deepEqual(t.units['p1-hasim'].pos, sq('d5'));
});

test('creeps: lanes are the flank files and no map puts terrain in them', () => {
  for (const map of Object.keys(MAPS)) {
    const m = createMatch({ map });
    const creeps = Object.values(m.units).filter((u) => u.kind === 'creep');
    assert.equal(creeps.length, 8);
    for (const c of creeps) {
      assert.ok('abgh'.includes('abcdefgh'[c.pos.c]), `${map}: creep on a centre file`);
      for (let r = 0; r < 8; r++) assert.equal(blockAt(m, { r, c: c.pos.c }), null, `${map}: terrain in creep lane ${'abcdefgh'[c.pos.c]}`);
    }
  }
  // terrain still blocks a creep straight ahead (no sidestep, no hop)
  const s = setup({ 'p1-creep-b': 'c3', 'p1-hasim': 'a1', 'p2-genga': 'h8' }, { blocks: { c4: 'pillar' } });
  assert.equal(listActions(s).filter((a) => a.unitId === 'p1-creep-b').length, 0);
});
