import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyAction, validateAction, getLegalMoves, getAbilityTargets,
  getThreats, livingUnits, unitAt, HEROES, RULES,
} from '../src/engine.js';

const sq = (name) => ({ c: 'abcdefgh'.indexOf(name[0]), r: 8 - Number(name[1]) });

/** Build a custom position. spec: { id: 'e4', ... } ; ids not listed are removed. */
function setup(spec, current = 'p1') {
  const s = createInitialState();
  for (const id of Object.keys(s.units)) {
    if (spec[id]) s.units[id].pos = sq(spec[id]);
    else delete s.units[id];
  }
  s.current = current;
  return s;
}
const act = (s, a) => {
  const r = applyAction(s, a);
  assert.ok(r.ok, r.reason);
  return r.state;
};
const reject = (s, a) => {
  const r = applyAction(s, a);
  assert.equal(r.ok, false);
  assert.equal(r.state, s, 'rejected action must return the same state');
  assert.equal(r.state.current, s.current);
  assert.ok(r.reason.length > 0);
  return r.reason;
};

test('1. a legal move works and passes the turn', () => {
  const s = createInitialState();
  const n = act(s, { type: 'move', unitId: 'p1-knight', to: sq('c3') });
  assert.deepEqual(n.units['p1-knight'].pos, sq('c3'));
  assert.equal(n.current, 'p2');
  assert.deepEqual(s.units['p1-knight'].pos, sq('b1'), 'original state untouched');
});

test('2. illegal moves are rejected', () => {
  const s = createInitialState();
  reject(s, { type: 'move', unitId: 'p1-knight', to: sq('b3') });
  reject(s, { type: 'move', unitId: 'p1-bishop', to: sq('f5') });
  reject(s, { type: 'move', unitId: 'p2-knight', to: sq('c6') }); // not p2's turn
  assert.match(reject(s, { type: 'move', unitId: 'p1-rook', to: sq('f1') }), /own hero/); // ally square
});

test('3. blockers stop sliders, knights jump', () => {
  const s = setup({ 'p1-rook': 'd1', 'p1-bishop': 'd3', 'p1-knight': 'b1', 'p2-rook': 'h8' });
  reject(s, { type: 'move', unitId: 'p1-rook', to: sq('d5') });
  act(s, { type: 'move', unitId: 'p1-rook', to: sq('d2') });
  const s2 = setup({ 'p1-bishop': 'a1', 'p1-rook': 'c3', 'p2-rook': 'h8' });
  reject(s2, { type: 'move', unitId: 'p1-bishop', to: sq('e5') });
  const s3 = setup({ 'p1-knight': 'b1', 'p1-rook': 'b2', 'p1-bishop': 'c2', 'p2-rook': 'h8' });
  // c2/b2 surround the knight but it still jumps to c3
  act(s3, { type: 'move', unitId: 'p1-knight', to: sq('c3') });
});

test('4a. Blink Strike: knight-move landing next to the enemy', () => {
  const s = setup({ 'p1-knight': 'b1', 'p2-rook': 'd3', 'p2-bishop': 'h8' });
  const targets = getAbilityTargets(s, 'p1-knight', 'blink');
  assert.ok(targets.every((t) => t.targetId === 'p2-rook'));
  assert.ok(targets.some((t) => t.dest.r === sq('c3').r && t.dest.c === sq('c3').c));
  // landing must be a knight move: c2 is adjacent to d3 but not a knight move from b1
  reject(s, { type: 'ability', unitId: 'p1-knight', ability: 'blink', targetId: 'p2-rook', dest: sq('c2') });
  const n = act(s, { type: 'ability', unitId: 'p1-knight', ability: 'blink', targetId: 'p2-rook', dest: sq('c3') });
  assert.equal(n.units['p2-rook'].alive, false);
  assert.deepEqual(n.units['p1-knight'].pos, sq('c3'));
  assert.equal(n.units['p1-knight'].used.blink, true);
  assert.equal(getAbilityTargets(n, 'p1-knight', 'blink').length, 0);
});

test('4b. Arcane Bolt: first unit on diagonal, blocked by allies', () => {
  const s = setup({ 'p1-bishop': 'a1', 'p1-rook': 'c3', 'p2-rook': 'e5', 'p2-knight': 'h8' });
  assert.equal(getAbilityTargets(s, 'p1-bishop', 'bolt').length, 0);
  const reason = reject(s, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-rook' });
  assert.match(reason, /blocked/i);
  const s2 = setup({ 'p1-bishop': 'a1', 'p2-rook': 'e5', 'p2-knight': 'g7' });
  const n = act(s2, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-rook' });
  assert.equal(n.units['p2-rook'].alive, false);
  reject(s2, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-knight' }); // behind e5
  const s3 = setup({ 'p1-bishop': 'a1', 'p2-rook': 'e4', 'p2-knight': 'h8' });
  assert.match(reject(s3, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-rook' }), /diagonal/);
});

test('4c. Shadow Swap respects range and ally-only', () => {
  const s = setup({ 'p1-knight': 'a1', 'p1-rook': 'd4', 'p1-bishop': 'h8', 'p2-rook': 'a3' });
  const n = act(s, { type: 'ability', unitId: 'p1-knight', ability: 'swap', targetId: 'p1-rook' });
  assert.deepEqual(n.units['p1-knight'].pos, sq('d4'));
  assert.deepEqual(n.units['p1-rook'].pos, sq('a1'));
  reject(s, { type: 'ability', unitId: 'p1-knight', ability: 'swap', targetId: 'p1-bishop' });
  reject(s, { type: 'ability', unitId: 'p1-knight', ability: 'swap', targetId: 'p2-rook' });
});

test('4d. Ice Prison / Shield range and target team', () => {
  const s = setup({ 'p1-bishop': 'a1', 'p1-rook': 'h1', 'p2-rook': 'e5', 'p2-knight': 'c3' });
  reject(s, { type: 'ability', unitId: 'p1-bishop', ability: 'ice', targetId: 'p2-rook' }); // 4 away
  act(s, { type: 'ability', unitId: 'p1-bishop', ability: 'ice', targetId: 'p2-knight' });
  reject(s, { type: 'ability', unitId: 'p1-rook', ability: 'shield', targetId: 'p1-bishop' }); // 7 away
  assert.match(reject(s, { type: 'ability', unitId: 'p1-rook', ability: 'shield', targetId: 'p1-rook' }), /itself/);
  const s2 = setup({ 'p1-bishop': 'f1', 'p1-rook': 'h1', 'p2-rook': 'e5' });
  const n = act(s2, { type: 'ability', unitId: 'p1-rook', ability: 'shield', targetId: 'p1-bishop' });
  assert.equal(n.units['p1-bishop'].status.shield, true);
});

test('5+6. Shield blocks exactly one elimination and is consumed; abilities are single-use', () => {
  let s = setup({ 'p1-bishop': 'a1', 'p1-rook': 'h1', 'p2-bishop': 'e5', 'p2-rook': 'e7', 'p2-knight': 'h8' }, 'p2');
  s = act(s, { type: 'ability', unitId: 'p2-rook', ability: 'shield', targetId: 'p2-bishop' });
  s = act(s, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-bishop' });
  assert.equal(s.units['p2-bishop'].alive, true);
  assert.equal(s.units['p2-bishop'].status.shield, false);
  s = act(s, { type: 'move', unitId: 'p2-knight', to: sq('g6') });
  assert.match(reject(s, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-bishop' }), /already been used/);
  s = act(s, { type: 'move', unitId: 'p1-bishop', to: sq('e5') }); // capture by moving
  assert.equal(s.units['p2-bishop'].alive, false);
  assert.deepEqual(s.units['p1-bishop'].pos, sq('e5'));
});

test('6b. Shield is not consumed by non-lethal effects (Ice, Knockback push)', () => {
  let s = setup({ 'p1-rook': 'd4', 'p1-bishop': 'a8', 'p2-knight': 'd5', 'p2-rook': 'f7' }, 'p2');
  s = act(s, { type: 'ability', unitId: 'p2-rook', ability: 'shield', targetId: 'p2-knight' });
  s = act(s, { type: 'ability', unitId: 'p1-rook', ability: 'knock', targetId: 'p2-knight' });
  assert.deepEqual(s.units['p2-knight'].pos, sq('d6'));
  assert.equal(s.units['p2-knight'].status.shield, true);
});

test('7. Knockback: occupied fails, edge eliminates, shielded edge survives', () => {
  const s = setup({ 'p1-rook': 'd6', 'p2-rook': 'd7', 'p2-knight': 'd8', 'p2-bishop': 'a1' });
  assert.match(reject(s, { type: 'ability', unitId: 'p1-rook', ability: 'knock', targetId: 'p2-rook' }), /occupied/);
  reject(s, { type: 'ability', unitId: 'p1-rook', ability: 'knock', targetId: 'p2-bishop' }); // not adjacent
  const s2 = setup({ 'p1-rook': 'd7', 'p2-rook': 'd8', 'p2-knight': 'a1' });
  const n = act(s2, { type: 'ability', unitId: 'p1-rook', ability: 'knock', targetId: 'p2-rook' });
  assert.equal(n.units['p2-rook'].alive, false);
  const s3 = setup({ 'p1-rook': 'g7', 'p2-rook': 'h8', 'p2-knight': 'a1' }); // diagonal push off corner
  s3.units['p2-rook'].status.shield = true;
  const n3 = act(s3, { type: 'ability', unitId: 'p1-rook', ability: 'knock', targetId: 'p2-rook' });
  assert.equal(n3.units['p2-rook'].alive, true);
  assert.deepEqual(n3.units['p2-rook'].pos, sq('h8'));
  assert.equal(n3.units['p2-rook'].status.shield, false);
  const s4 = setup({ 'p1-rook': 'd4', 'p2-rook': 'e5', 'p2-knight': 'a1' });
  const n4 = act(s4, { type: 'ability', unitId: 'p1-rook', ability: 'knock', targetId: 'p2-rook' });
  assert.deepEqual(n4.units['p2-rook'].pos, sq('f6'));
});

test('8. Frozen units cannot move or use abilities for exactly one turn', () => {
  let s = setup({ 'p1-bishop': 'c1', 'p1-rook': 'a1', 'p2-knight': 'd3', 'p2-rook': 'h8' });
  s = act(s, { type: 'ability', unitId: 'p1-bishop', ability: 'ice', targetId: 'p2-knight' });
  assert.equal(s.current, 'p2');
  assert.match(reject(s, { type: 'move', unitId: 'p2-knight', to: sq('e5') }), /frozen/);
  reject(s, { type: 'ability', unitId: 'p2-knight', ability: 'swap', targetId: 'p2-rook' });
  assert.equal(getLegalMoves(s, 'p2-knight').length, 0);
  s = act(s, { type: 'move', unitId: 'p2-rook', to: sq('h7') });
  s = act(s, { type: 'move', unitId: 'p1-rook', to: sq('a2') });
  assert.equal(s.units['p2-knight'].status.frozen, 0);
  act(s, { type: 'move', unitId: 'p2-knight', to: sq('e5') });
});

test('8b. a team with no legal action passes automatically', () => {
  let s = setup({ 'p1-bishop': 'c1', 'p1-rook': 'a1', 'p2-knight': 'd3' });
  s = act(s, { type: 'ability', unitId: 'p1-bishop', ability: 'ice', targetId: 'p2-knight' });
  assert.equal(s.current, 'p1', 'p2 only had a frozen unit, so it passes');
  assert.equal(s.units['p2-knight'].status.frozen, 0);
  assert.match(s.log.at(-1).text, /passes/);
});

test('9. eliminated units cannot act or be targeted', () => {
  let s = setup({ 'p1-rook': 'd7', 'p1-bishop': 'a1', 'p2-rook': 'd8', 'p2-knight': 'h1' });
  s = act(s, { type: 'ability', unitId: 'p1-rook', ability: 'knock', targetId: 'p2-rook' });
  reject(s, { type: 'move', unitId: 'p2-rook', to: sq('d6') });
  s = act(s, { type: 'move', unitId: 'p2-knight', to: sq('g3') });
  assert.match(reject(s, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-rook' }), /Eliminated/);
});

test('10+11. turns alternate; invalid actions keep the turn', () => {
  let s = createInitialState();
  reject(s, { type: 'move', unitId: 'p1-knight', to: sq('b3') });
  assert.equal(s.current, 'p1');
  s = act(s, { type: 'move', unitId: 'p1-knight', to: sq('a3') });
  assert.equal(s.current, 'p2');
  reject(s, { type: 'move', unitId: 'p1-knight', to: sq('b5') });
  s = act(s, { type: 'move', unitId: 'p2-knight', to: sq('h6') });
  assert.equal(s.current, 'p1');
  assert.equal(s.turn, 3);
});

test('12. game ends when the last enemy falls; no more actions', () => {
  let s = setup({ 'p1-bishop': 'a1', 'p1-rook': 'h1', 'p2-rook': 'e5' });
  s = act(s, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-rook' });
  assert.equal(s.status, 'p1');
  assert.equal(livingUnits(s, 'p2').length, 0);
  assert.match(reject(s, { type: 'move', unitId: 'p1-rook', to: sq('h2') }), /over/);
});

test('13. restart returns a fresh match', () => {
  const a = createInitialState();
  let s = a;
  s = act(s, { type: 'move', unitId: 'p1-rook', to: sq('d4') });
  s = act(s, { type: 'ability', unitId: 'p2-rook', ability: 'shield', targetId: 'p2-bishop' });
  assert.equal(s.units['p2-bishop'].status.shield, true);
  const b = createInitialState();
  assert.deepEqual(b, a);
  assert.ok(Object.values(b.units).every((u) => !u.status.shield && !u.status.frozen && u.alive));
});

test('14. determinism: same action sequence, same result; no stats on units', () => {
  const seq = [
    { type: 'move', unitId: 'p1-knight', to: sq('c3') },
    { type: 'move', unitId: 'p2-knight', to: sq('f6') },
    { type: 'ability', unitId: 'p1-rook', ability: 'shield', targetId: 'p1-knight' },
  ];
  const run = () => seq.reduce((s, a) => act(s, a), createInitialState());
  assert.deepEqual(run(), run());
  const keys = Object.keys(createInitialState().units['p1-rook']).sort();
  assert.deepEqual(keys, ['alive', 'id', 'pos', 'status', 'team', 'type', 'used']);
});

test('starting position: no unit can be eliminated on move 1', () => {
  const s = createInitialState();
  assert.equal(getThreats(s, 'p1').length, 0);
  assert.equal(getThreats(s, 'p2').length, 0);
  for (const u of livingUnits(s, 'p1')) {
    for (const a of HEROES[u.type].abilities.filter((x) => x.lethal)) {
      assert.equal(getAbilityTargets(s, u.id, a.key).length, 0, `${u.id} ${a.key}`);
    }
  }
});

test('threats include captures and only unused lethal abilities', () => {
  const s = setup({ 'p1-bishop': 'a1', 'p1-rook': 'h1', 'p2-rook': 'e5', 'p2-knight': 'h8' });
  const t = getThreats(s, 'p2');
  assert.ok(t.some((x) => x.by === 'p1-bishop' && x.ability === 'bolt' && x.targetId === 'p2-rook'));
  assert.ok(t.some((x) => x.by === 'p1-bishop' && x.ability === 'capture' && x.targetId === 'p2-rook'));
  s.units['p1-bishop'].used.bolt = true;
  assert.ok(!getThreats(s, 'p2').some((x) => x.ability === 'bolt'));
});

test('capture: sliders take the first enemy in line, never through blockers or allies', () => {
  const s = setup({ 'p1-rook': 'a1', 'p1-bishop': 'a4', 'p2-rook': 'a7', 'p2-knight': 'd1' });
  reject(s, { type: 'move', unitId: 'p1-rook', to: sq('a7') }); // own Mage on a4 blocks
  const n = act(s, { type: 'move', unitId: 'p1-rook', to: sq('d1') });
  assert.equal(n.units['p2-knight'].alive, false);
  assert.deepEqual(n.units['p1-rook'].pos, sq('d1'));
  const s2 = setup({ 'p1-rook': 'a1', 'p2-knight': 'c1', 'p2-rook': 'e1' });
  reject(s2, { type: 'move', unitId: 'p1-rook', to: sq('e1') }); // behind the first enemy
});

test('capture: knights jump onto enemies; shield repels and the attacker stays', () => {
  const s = setup({ 'p1-knight': 'b1', 'p2-rook': 'c3', 'p2-bishop': 'h8' });
  const n = act(s, { type: 'move', unitId: 'p1-knight', to: sq('c3') });
  assert.equal(n.units['p2-rook'].alive, false);
  const s2 = setup({ 'p1-knight': 'b1', 'p2-rook': 'c3', 'p2-bishop': 'h8' });
  s2.units['p2-rook'].status.shield = true;
  const n2 = act(s2, { type: 'move', unitId: 'p1-knight', to: sq('c3') });
  assert.equal(n2.units['p2-rook'].alive, true);
  assert.equal(n2.units['p2-rook'].status.shield, false);
  assert.deepEqual(n2.units['p1-knight'].pos, sq('b1'));
  assert.equal(n2.current, 'p2', 'a repelled attack still uses the turn');
});

test('frozen units cannot capture', () => {
  let s = setup({ 'p1-bishop': 'c1', 'p1-rook': 'a1', 'p2-knight': 'd3', 'p2-rook': 'h8' });
  s = act(s, { type: 'ability', unitId: 'p1-bishop', ability: 'ice', targetId: 'p2-knight' });
  assert.match(reject(s, { type: 'move', unitId: 'p2-knight', to: sq('c1') }), /frozen/);
});

test('team skill mode: shared charges per player', () => {
  const prev = { ...RULES };
  try {
    RULES.skillMode = 'team'; RULES.teamCharges = 1;
    let s = setup({ 'p1-bishop': 'a1', 'p1-knight': 'b1', 'p1-rook': 'h1', 'p2-rook': 'e5', 'p2-knight': 'h8' });
    assert.equal(s.charges.p1, 1);
    s = act(s, { type: 'ability', unitId: 'p1-bishop', ability: 'bolt', targetId: 'p2-rook' });
    assert.equal(s.charges.p1, 0);
    s = act(s, { type: 'move', unitId: 'p2-knight', to: sq('g6') });
    assert.match(reject(s, { type: 'ability', unitId: 'p1-knight', ability: 'swap', targetId: 'p1-bishop' }), /no ability uses left/);
    assert.equal(getAbilityTargets(s, 'p1-knight', 'swap').length, 0);
  } finally { Object.assign(RULES, prev); }
});

test('validateAction never throws on garbage', () => {
  const s = createInitialState();
  for (const a of [null, {}, { type: 'move' }, { type: 'ability', unitId: 'p1-rook' }, { type: 'ability', unitId: 'p1-rook', ability: 'bolt', targetId: 'p2-rook' }]) {
    assert.equal(validateAction(s, a).ok, false);
  }
});

test('full match: greedy self-play reaches a winner with board invariants intact', () => {
  // Deterministic policy: take any lethal ability, else a non-lethal one, else the move that
  // gets closest to an enemy. Rotates through units so play actually progresses.
  let s = createInitialState();
  let steps = 0;
  let seed = 7;
  while (s.status === 'playing' && steps < 600) {
    const mine = livingUnits(s, s.current);
    const enemies = livingUnits(s, s.current === 'p1' ? 'p2' : 'p1');
    let chosen = null;
    for (const u of mine) for (const a of HEROES[u.type].abilities.filter((x) => x.lethal)) {
      const t = getAbilityTargets(s, u.id, a.key)[0];
      if (t && !chosen) chosen = { type: 'ability', unitId: u.id, ability: a.key, ...t };
    }
    if (!chosen) {
      // Seeded LCG (test harness only; the game itself has no randomness).
      const options = [];
      for (const u of mine) {
        for (const to of getLegalMoves(s, u.id)) options.push({ type: 'move', unitId: u.id, to });
        for (const a of HEROES[u.type].abilities) for (const t of getAbilityTargets(s, u.id, a.key)) options.push({ type: 'ability', unitId: u.id, ability: a.key, ...t });
      }
      seed = (seed * 1103515245 + 12345) % 2147483648;
      chosen = options[seed % options.length];
    }
    assert.ok(chosen, 'a legal action exists while playing');
    s = act(s, chosen);
    const living = livingUnits(s);
    const keys = new Set(living.map((u) => `${u.pos.r},${u.pos.c}`));
    assert.equal(keys.size, living.length, 'no two units share a square');
    steps++;
  }
  assert.notEqual(s.status, 'playing', `match should finish (took ${steps} actions)`);
});
