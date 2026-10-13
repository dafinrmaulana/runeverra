import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREEPS,
  createMatch, applyAction, listActions, moveOptions, livingHeroes, unitAt, blockAt, parseSquare as sq,
  getThreats, toMove, HEROES, MAPS, key,
} from '../src/arena.js';

/** Custom position. spec: { 'p1-hasim': 'd4', ... }; listed units are kept (others removed). */
function setup(spec, { current = 'p1', energy = { p1: 0, p2: 0 }, blocks = {}, p1, p2, map = 'field' } = {}) {
  const s = createMatch({ p1: p1 || ['hasim', 'hexor', 'magumba'], p2: p2 || ['genga', 'aqna', 'plantae'], map });
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

test('setup: 3 heroes each, beast beside Ge\'nga, symmetric map blocks, no first-move kills', () => {
  for (const map of Object.keys(MAPS)) {
    const s = createMatch({ p1: ['hasim', 'genga', 'hexor'], p2: ['genga', 'aqna', 'plantae'], map });
    assert.equal(livingHeroes(s, 'p1').length, 3);
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
  assert.throws(() => createMatch({ p1: ['hasim', 'hasim', 'hexor'] }));
});

test('basic movement per hero, terrain blocks, capture by moving', () => {
  const s = setup({ 'p1-hexor': 'd4', 'p1-hasim': 'a1', 'p2-aqna': 'e6', 'p2-plantae': 'h8' }, { blocks: { c6: 'rock' } });
  const hex = moveOptions(s, s.units['p1-hexor']).map((o) => o.to);
  assert.ok(!hex.some((p) => p.r === sq('c6').r && p.c === sq('c6').c), 'cannot land on terrain');
  const n = act(s, mv('p1-hexor', 'e6'));
  assert.equal(n.units['p2-aqna'].alive, false);
  const s2 = setup({ 'p1-hasim': 'a1', 'p2-aqna': 'a8', 'p2-plantae': 'h8' }, { current: 'p2' });
  reject(s2, mv('p2-plantae', 'h6')); // Plantae steps 1 only
  const n2 = act(s2, mv('p2-aqna', 'a1')); // rook slide captures
  assert.equal(n2.units['p1-hasim'].alive, false);
});

test('Hasim Backstab: jumps forward over unit or object; kills jumped enemy and landing enemy', () => {
  let s = setup({ 'p1-hasim': 'd4', 'p1-hexor': 'a1', 'p2-aqna': 'd5', 'p2-plantae': 'd6', 'p2-genga': 'h8' });
  // landing occupied by enemy plantae; jumped aqna -> both die
  s = act(s, mv('p1-hasim', 'd6'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.equal(s.units['p2-plantae'].alive, false);
  assert.deepEqual(s.units['p1-hasim'].pos, sq('d6'));
  // over an ally: no kill; over terrain: allowed
  let t = setup({ 'p1-hasim': 'd4', 'p1-hexor': 'c5', 'p2-genga': 'h8' }, { blocks: { d5: 'pillar' } });
  t = act(t, mv('p1-hasim', 'b6'));
  assert.equal(t.units['p1-hexor'].alive, true);
  const t2 = setup({ 'p1-hasim': 'd4', 'p2-genga': 'h8' }, { blocks: { d5: 'pillar' } });
  act(t2, mv('p1-hasim', 'd6'));
  // every direction works: back, back-diagonal, sideways; never with nothing to jump
  const t3 = setup({ 'p1-hasim': 'd4', 'p2-aqna': 'd3', 'p2-plantae': 'c3', 'p2-genga': 'h8', 'p2-beast': 'e4' });
  const back = act(t3, mv('p1-hasim', 'd2'));
  assert.equal(back.units['p2-aqna'].alive, false);
  const backDiag = act(t3, mv('p1-hasim', 'b2'));
  assert.equal(backDiag.units['p2-plantae'].alive, false);
  const side = act(t3, mv('p1-hasim', 'f4')); // sideways over the beast
  assert.equal(side.units['p2-beast'].alive, false);
  reject(t3, mv('p1-hasim', 'f6')); // e5 is empty: nothing to jump over
  reject(t3, mv('p1-hasim', 'b4'));
});

test('Ge\'nga: beast acts right after him (or skips), never on its own', () => {
  let s = setup({ 'p2-genga': 'd8', 'p2-beast': 'd7', 'p2-plantae': 'h8', 'p1-hasim': 'a1' }, { current: 'p2' });
  assert.match(reject(s, mv('p2-beast', 'd6')), /after Ge'nga/);
  s = act(s, mv('p2-genga', 'c8'.replace('c8', 'b8')));
  assert.equal(s.phase, 'beast');
  assert.equal(s.current, 'p2');
  assert.ok(listActions(s).some((a) => a.type === 'skip'));
  s = act(s, mv('p2-beast', 'd6'));
  assert.equal(s.current, 'p1');
  // beast flees when Ge'nga falls
  let k = setup({ 'p2-genga': 'd5', 'p2-beast': 'h7', 'p2-plantae': 'h8', 'p1-aqna': 'd1', 'p1-hasim': 'a1' }, { p1: ['aqna', 'hasim', 'hexor'] });
  k = act(k, mv('p1-aqna', 'd5'));
  assert.equal(k.units['p2-beast'].alive, false);
});

test('Magumba Empty Grave: costs 3 energy, protects an ally from captures until caster\'s next turn', () => {
  let s = setup({ 'p1-magumba': 'c3', 'p1-hasim': 'd4', 'p1-hexor': 'a1', 'p2-aqna': 'd8', 'p2-plantae': 'h8' }, { p1: ['magumba', 'hasim', 'hexor'] });
  assert.match(reject(s, { type: 'skill', unitId: 'p1-magumba', skill: 'grave', targetId: 'p1-hasim' }), /needs 3 energy/);
  s.energy.p1 = 3;
  s = act(s, { type: 'skill', unitId: 'p1-magumba', skill: 'grave', targetId: 'p1-hasim' });
  assert.equal(s.energy.p1, 0);
  assert.equal(s.units['p1-hasim'].warded, true);
  assert.match(reject(s, mv('p2-aqna', 'd4')), /Empty Grave/);
  s = act(s, mv('p2-aqna', 'e8'));
  assert.equal(s.units['p1-hasim'].warded, false, 'wears off at the start of Ivory\'s turn');
});

test('Plantae Aggressive Root: active use roots a target for its next turn', () => {
  let s = setup({ 'p2-plantae': 'd6', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { current: 'p2', energy: { p1: 0, p2: 3 } });
  s = act(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hexor' });
  assert.equal(s.current, 'p1');
  assert.match(reject(s, mv('p1-hexor', 'e6')), /roots/);
  s = act(s, mv('p1-hasim', 'a2'));
  s = act(s, mv('p2-aqna', 'h7'));
  assert.equal(s.units['p1-hexor'].rooted, 0);
  act(s, mv('p1-hexor', 'e6'));
});

test('Plantae reaction: interrupts an enemy action within 3 squares; declining resolves it', () => {
  const base = setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } });
  let s = act(base, mv('p1-hexor', 'e6'));
  assert.equal(s.phase, 'react');
  assert.equal(toMove(s), 'p2');
  assert.deepEqual(s.units['p1-hexor'].pos, sq('d4'), 'action is on hold');
  const used = act(s, { type: 'react', use: true });
  assert.deepEqual(used.units['p1-hexor'].pos, sq('d4'));
  assert.equal(used.energy.p2, 1, '3 spent, +1 at the start of Ember\'s turn');
  assert.equal(used.current, 'p2');
  const declined = act(s, { type: 'react', use: false });
  assert.deepEqual(declined.units['p1-hexor'].pos, sq('e6'));
  // out of range or not enough energy: no prompt
  const far = act(setup({ 'p2-plantae': 'h8', 'p2-aqna': 'a8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } }), mv('p1-hexor', 'e6'));
  assert.equal(far.phase, 'main');
  const poor = act(setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 2 } }), mv('p1-hexor', 'e6'));
  assert.equal(poor.phase, 'main');
});

test('Hexor Storm Hammer: pushes neighbours, chains, kills on terrain/edge, spares warded', () => {
  // Hexor b3 -> c5 hits aqna on c5. Around c5: plantae d5 (pushed to e5, chains genga e5 -> f5),
  // hasim (ally!) b6 pushed to a7, magumba c6 warded stays, ally... beast d4 pushed into rock e3 -> eliminated
  let s = setup({
    'p1-hexor': 'b3', 'p1-hasim': 'b6', 'p1-magumba': 'c6',
    'p2-aqna': 'c5', 'p2-plantae': 'd5', 'p2-genga': 'e5', 'p2-beast': 'd4',
  }, { blocks: { e3: 'rock' } });
  s.units['p1-magumba'].warded = true;
  s = act(s, mv('p1-hexor', 'c5'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.deepEqual(s.units['p2-plantae'].pos, sq('e5'));
  assert.deepEqual(s.units['p2-genga'].pos, sq('f5'));
  assert.deepEqual(s.units['p1-hasim'].pos, sq('a7'));
  assert.deepEqual(s.units['p1-magumba'].pos, sq('c6'));
  assert.equal(s.units['p2-beast'].alive, false, 'slammed into the rock');
  // board edge counts as terrain
  let e = setup({ 'p1-hexor': 'c5', 'p2-aqna': 'b7', 'p2-plantae': 'a8', 'p2-genga': 'h1' });
  e = act(e, mv('p1-hexor', 'b7'));
  assert.equal(e.units['p2-plantae'].alive, false);
});

test('Aqna Icy Step: optional ice after a kill; ice blocks everyone; oldest moves at the limit', () => {
  let s = setup({ 'p1-aqna': 'a1', 'p1-hasim': 'h1', 'p2-plantae': 'a5', 'p2-genga': 'h8' }, { p1: ['aqna', 'hasim', 'hexor'] });
  s = act(s, mv('p1-aqna', 'a5'));
  assert.equal(s.phase, 'ice');
  assert.match(reject(s, { type: 'ice', to: sq('a1') }), /within 3/);
  s = act(s, { type: 'ice', to: sq('c5') });
  assert.equal(blockAt(s, sq('c5')).kind, 'ice');
  assert.equal(s.current, 'p2');
  const sl = moveOptions(s, s.units['p1-aqna']).map((o) => o.to);
  assert.ok(!sl.some((p) => p.c >= 2 && p.r === sq('c5').r), 'her own ice blocks her slide');
  // limit
  let t = setup({ 'p1-aqna': 'a1', 'p1-hasim': 'h1', 'p2-plantae': 'a5', 'p2-genga': 'h8' }, { p1: ['aqna', 'hasim', 'hexor'] });
  t.iceBy['p1-aqna'] = [];
  const spots = ['h3', 'h4', 'g3', 'g4', 'f3', 'f4', 'e3', 'e4', 'h5', 'g5'];
  for (const n of spots) { t.blocks[key(sq(n))] = { kind: 'ice', owner: 'p1-aqna' }; t.iceBy['p1-aqna'].push(key(sq(n))); }
  t = act(t, mv('p1-aqna', 'a5'));
  t = act(t, { type: 'ice', to: sq('b6') });
  assert.equal(blockAt(t, sq('h3')), null, 'oldest block moved');
  assert.equal(t.iceBy['p1-aqna'].length, 10);
  // skip is allowed
  let u = setup({ 'p1-aqna': 'a1', 'p1-hasim': 'h1', 'p2-plantae': 'a5', 'p2-genga': 'h8' }, { p1: ['aqna', 'hasim', 'hexor'] });
  u = act(act(u, mv('p1-aqna', 'a5')), { type: 'skip' });
  assert.equal(u.current, 'p2');
});

test('energy: +1 per own turn, capped', () => {
  let s = createMatch({ map: 'field' });
  assert.deepEqual(s.energy, { p1: 1, p2: 1 });
  s = act(s, mv('p1-hasim', 'b2'));
  assert.equal(s.energy.p2, 2);
  s.energy.p1 = 6;
  s = act(s, listActions(s).find((a) => a.type === 'move' && a.unitId === 'p2-aqna'));
  assert.equal(s.energy.p1, 6);
});

test('win when every enemy hero is down (beasts do not count)', () => {
  let s = setup({ 'p1-aqna': 'a1', 'p1-hasim': 'h1', 'p2-plantae': 'a5', 'p2-beast': 'h8' }, { p1: ['aqna', 'hasim', 'hexor'] });
  s.units['p2-beast'].ownerId = 'p2-genga';
  s = act(s, mv('p1-aqna', 'a5'));
  assert.equal(s.status, 'p1');
  assert.equal(listActions(s).length, 0);
});

test('random play: every listed action is accepted, no shared squares, matches end', () => {
  let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const heroes = Object.keys(HEROES);
  let finished = 0;
  for (let g = 0; g < 60; g++) {
    const pick = () => { const h = [...heroes]; const out = []; while (out.length < 3) out.push(h.splice(Math.floor(rnd() * h.length), 1)[0]); return out; };
    let s = createMatch({ p1: pick(), p2: pick(), map: Object.keys(MAPS)[g % 5] });
    for (let n = 0; n < 400 && s.status === 'playing'; n++) {
      const acts = listActions(s);
      assert.ok(acts.length > 0, 'a playing state always has an action');
      s = act(s, acts[Math.floor(rnd() * acts.length)]);
      const pos = Object.values(s.units).filter((u) => u.alive).map((u) => key(u.pos));
      assert.equal(new Set(pos).size, pos.length);
      assert.ok(pos.every((k) => !s.blocks[k]), 'no unit inside terrain');
    }
    if (s.status !== 'playing') finished++;
  }
  assert.ok(finished > 40, `only ${finished}/60 random matches finished`);
});

test('creeps: start on a/c/e/g and are moved by their player like pawns', () => {
  let s = createMatch({ p1: ['hasim', 'hexor', 'magumba'], p2: ['genga', 'aqna', 'plantae'], map: 'field' });
  assert.deepEqual(s.units['p1-creep-a'].pos, sq('a2'));
  assert.deepEqual(s.units['p2-creep-h'].pos, sq('h7'));
  const creepMoves = listActions(s).filter((a) => a.unitId === 'p1-creep-a');
  assert.deepEqual(creepMoves.map((a) => a.to), [sq('a3')], 'one step forward only');
  reject(s, mv('p1-creep-a', 'a4'));           // no double step
  reject(s, mv('p1-creep-c', 'b2'));           // no sideways
  s = act(s, mv('p1-creep-a', 'a3'));          // uses the turn
  assert.equal(s.current, 'p2');
  assert.deepEqual(s.units['p1-creep-c'].pos, sq('c2'), 'other creeps stay put');
  reject(s, mv('p2-creep-h', 'h8'));           // never backwards
});

test('creeps: capture diagonally, are blocked straight ahead, break through for energy', () => {
  // diagonal capture of a hero
  let s = setup({ 'p1-creep-c': 'c4', 'p1-hasim': 'a1', 'p2-aqna': 'd5', 'p2-genga': 'h8' });
  s = act(s, mv('p1-creep-c', 'd5'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.deepEqual(s.units['p1-creep-c'].pos, sq('d5'));
  // can't capture straight ahead, can't step into an occupied square
  const b = setup({ 'p1-creep-c': 'c4', 'p1-hasim': 'a1', 'p2-genga': 'c5', 'p2-plantae': 'h8' });
  reject(b, mv('p1-creep-c', 'c5'));
  // breach
  let r = setup({ 'p1-creep-e': 'e7', 'p1-hasim': 'a1', 'p2-genga': 'h8' });
  r.energy = { p1: 1, p2: 0 };
  r = act(r, mv('p1-creep-e', 'e8'));
  assert.equal(r.units['p1-creep-e'].alive, false);
  assert.equal(r.energy.p1, 1 + CREEPS.breach);
  assert.ok(r.lastAction.breach);
});

test('creeps: last hit gives energy; a creep capture can win the game; rooted creeps cannot move', () => {
  let s = setup({ 'p1-hexor': 'd4', 'p1-hasim': 'a1', 'p2-creep-d': 'e6', 'p2-genga': 'h8' });
  s.energy = { p1: 1, p2: 0 };
  s = act(s, mv('p1-hexor', 'e6'));
  assert.equal(s.energy.p1, 1 + CREEPS.lastHit);
  let w = setup({ 'p1-creep-c': 'c4', 'p1-hasim': 'a1', 'p2-aqna': 'd5' });
  w = act(w, mv('p1-creep-c', 'd5'));
  assert.equal(w.status, 'p1');
  const rt = setup({ 'p1-creep-c': 'c4', 'p1-hasim': 'a1', 'p2-genga': 'h8' });
  rt.units['p1-creep-c'].rooted = 1;
  assert.match(reject(rt, mv('p1-creep-c', 'c5')), /roots/);
});

test('creeps can be turned off', () => {
  const s = createMatch({ map: 'field', creeps: false });
  assert.equal(Object.values(s.units).filter((u) => u.kind === 'creep').length, 0);
});

test('Aggressive Root has a 3-turn cooldown shared by active use and reactions', () => {
  // active use, then not available for the next 2 Ember turns, ready on the 3rd
  let s = setup({ 'p2-plantae': 'd6', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { current: 'p2', energy: { p1: 0, p2: 6 } });
  s = act(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hexor' });
  assert.equal(s.units['p2-plantae'].cd, 3);
  s = act(s, mv('p1-hasim', 'a2'));
  assert.equal(s.units['p2-plantae'].cd, 2);
  s.energy.p2 = 6;
  assert.match(reject(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hasim' }), /recharging: ready in 2 turns/);
  // and no reaction prompt while recharging
  s = act(s, mv('p2-aqna', 'h7'));
  const noPrompt = act(s, mv('p1-hexor', 'e6'));
  assert.equal(noPrompt.phase, 'main');
  // reaction also starts the cooldown
  const base = setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 6 } });
  let r = act(act(base, mv('p1-hexor', 'e6')), { type: 'react', use: true });
  assert.equal(r.units['p2-plantae'].cd, 2, 'set to 3, ticked once at the start of Ember\'s turn');
  assert.equal(listActions(r).some((a) => a.type === 'skill'), false);
});

test('Aggressive Root can interrupt only once per match', () => {
  const base = setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 6 } });
  let s = act(act(base, mv('p1-hexor', 'e6')), { type: 'react', use: true });
  assert.equal(s.units['p2-plantae'].reacts, 1);
  s.units['p2-plantae'].cd = 0; s.energy.p2 = 6;           // even fully recharged and rich...
  s = act(s, mv('p2-aqna', 'h7'));
  const again = act(s, mv('p1-hexor', 'e6'));
  assert.equal(again.phase, 'main', '...no second interrupt prompt');
  assert.deepEqual(again.units['p1-hexor'].pos, sq('e6'));
  // active rooting is still available after the interrupt is spent
  s = again; s.units['p2-plantae'].cd = 0;
  assert.ok(listActions(s).some((a) => a.type === 'skill' && a.skill === 'root'));
});
