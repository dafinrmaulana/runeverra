import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREEPS,
  createMatch,
  applyAction,
  listActions,
  moveOptions,
  livingHeroes,
  blockAt,
  parseSquare as sq,
  getThreats,
  toMove,
  HEROES,
  MAPS,
  key,
  ENERGY,
  TEAM_SIZE,
  teamProblem,
} from '../src/engine/index.ts';
import { pickTeam } from '../src/engine/bot.ts';
import { matchFromConfig } from '../src/online.ts';

/** Custom position. spec: { 'p1-hasim': 'd4', ... }; listed units are kept (others removed). */
function setup(spec, { current = 'p1', energy = { p1: 0, p2: 0 }, blocks = {}, p1, p2, map = 'field' } = {}) {
  const s = createMatch({
    p1: p1 || ['hasim', 'hexor', 'magumba', 'plantae'],
    p2: p2 || ['genga', 'aqna', 'plantae', 'hasim'],
    map,
  });
  for (const id of Object.keys(s.units)) {
    if (spec[id]) s.units[id].pos = sq(spec[id]);
    else delete s.units[id];
  }
  for (const [n, kind] of Object.entries(blocks)) s.blocks[key(sq(n))] = { kind };
  s.current = current;
  s.energy = { ...energy };
  return s;
}
const act = (state, action) => {
  const r = applyAction(state, action);
  assert.ok(r.ok, r.reason);
  return r.state;
};
const reject = (state, action) => {
  const r = applyAction(state, action);
  assert.equal(r.ok, false);
  assert.equal(r.state, state);
  return r.reason;
};
const mv = (unitId, to) => ({ type: 'move', unitId, to: sq(to) });

test("setup: 4 heroes each, beast beside Ge'nga, symmetric map blocks, no first-move kills", () => {
  assert.equal(TEAM_SIZE, 4);
  for (const map of Object.keys(MAPS)) {
    const s = createMatch({
      p1: ['hasim', 'genga', 'hexor', 'aqna'],
      p2: ['genga', 'aqna', 'plantae', 'magumba'],
      map,
    });
    assert.equal(livingHeroes(s, 'p1').length, 4);
    assert.equal(livingHeroes(s, 'p2').length, 4);
    assert.ok(s.units['p1-beast'] && s.units['p2-beast']);
    for (const k of Object.keys(s.blocks)) {
      const [r, c] = k.split(',').map(Number);
      assert.ok(s.blocks[`${7 - r},${7 - c}`], `${map} not symmetric at ${k}`);
    }
    const heroThreats = (team) => [...getThreats(s, team)].filter((id) => s.units[id].kind === 'hero');
    assert.deepEqual(heroThreats('p1'), [], `${map}: a hero can be hit on move 1`);
    assert.deepEqual(heroThreats('p2'), [], `${map}: a hero can be hit on move 1`);
    assert.equal(Object.values(s.units).filter((unit) => unit.kind === 'creep').length, 8);
  }
  assert.throws(() => createMatch({ p1: ['hasim', 'hasim', 'hexor', 'aqna'] }));
  assert.throws(() => createMatch({ p1: ['hasim', 'hexor', 'aqna'] }));
});

test('roles: Aqna slides 3, Assassin 1 in any direction plus Backstab, Support 1 and commands, Hexor an L, Fighter 2 any way', () => {
  assert.equal(HEROES.aqna.role, 'roam');
  assert.equal(HEROES.hexor.role, 'roam');
  assert.equal(HEROES.hasim.role, 'assassin');
  assert.equal(HEROES.genga.role, 'fighter');
  assert.equal(HEROES.plantae.role, 'support');
  assert.equal(HEROES.magumba.role, 'support');
  assert.deepEqual(
    Object.keys(HEROES).filter((heroId) => HEROES[heroId].commander),
    ['magumba', 'plantae'],
    'the two 1-step supports are the commanders',
  );
  assert.ok(ENERGY.max >= 99, 'runes have no real cap');
  const s = setup({ 'p1-hasim': 'd4', 'p1-hexor': 'a1', 'p2-aqna': 'h4', 'p2-plantae': 'h8' });
  const names = (unitId) =>
    moveOptions(s, s.units[unitId])
      .map((option) => 'abcdefgh'[option.to.c] + (8 - option.to.r))
      .sort();
  assert.deepEqual(names('p1-hasim'), ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5']);
  assert.deepEqual(names('p2-aqna'), ['e4', 'f4', 'g4', 'h1', 'h2', 'h3', 'h5', 'h6', 'h7']);
  assert.deepEqual(names('p2-plantae'), ['g8', 'h7']);
});

test('basic movement per hero, terrain blocks, capture by moving', () => {
  const s = setup(
    { 'p1-hexor': 'd4', 'p1-hasim': 'a1', 'p2-aqna': 'e6', 'p2-plantae': 'h8' },
    { blocks: { c6: 'rock' } },
  );
  const hex = moveOptions(s, s.units['p1-hexor']).map((option) => option.to);
  assert.ok(!hex.some((cell) => cell.r === sq('c6').r && cell.c === sq('c6').c), 'cannot land on terrain');
  const n = act(s, mv('p1-hexor', 'e6'));
  assert.equal(n.units['p2-aqna'].alive, false);
  const s2 = setup({ 'p1-hasim': 'a3', 'p2-aqna': 'a5', 'p2-plantae': 'h8' }, { current: 'p2' });
  reject(s2, mv('p2-plantae', 'h6')); // Plantae steps 1 only
  reject(s2, mv('p2-aqna', 'a2')); // Aqna slides at most 2
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
  assert.equal(s.energy.p1, 2, 'costs no runes; each hero it kills earns one');
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
  // never with nothing to jump over
  reject(t3, mv('p1-hasim', 'f6')); // e5 is empty
  reject(t3, mv('p1-hasim', 'b6')); // c5 is empty
});

test("Ge'nga: the beast follow-up is free; Wild Company (3 runes) summons a fallen beast", () => {
  let s = setup(
    { 'p2-genga': 'd8', 'p2-beast': 'd7', 'p2-plantae': 'h8', 'p1-hasim': 'a1' },
    { current: 'p2', energy: { p1: 0, p2: 0 } },
  );
  // before it has ever moved, the beast may move on its own as the turn, picking its stride
  assert.match(reject(s, mv('p2-beast', 'c6')), /choose how/, 'the first move names its stride');
  const solo = act(s, { ...mv('p2-beast', 'c6'), pattern: 'any' });
  assert.equal(solo.current, 'p1', 'the solo move is the whole turn');
  assert.equal(solo.units['p2-beast'].moved, true);
  assert.equal(solo.units['p2-beast'].stride, 'any');
  solo.current = 'p2';
  assert.match(reject(solo, mv('p2-beast', 'b5')), /after Ge'nga/, 'only once on its own');
  assert.match(reject(s, mv('p2-genga', 'b8')), /./, "Ge'nga steps only 1 square");
  s = act(s, mv('p2-genga', 'c8'));
  assert.equal(s.phase, 'beast', 'offered with 0 runes: it is free');
  assert.equal(s.current, 'p2');
  assert.ok(listActions(s).some((action) => action.type === 'skip'));
  s = act(s, { ...mv('p2-beast', 'c6'), pattern: 'any' });
  assert.equal(s.current, 'p1');
  assert.equal(s.energy.p2, 0);
  // no summon while the beast lives
  const alive = setup(
    { 'p2-genga': 'd8', 'p2-beast': 'd7', 'p1-hasim': 'a1' },
    { current: 'p2', energy: { p1: 0, p2: 4 } },
  );
  assert.ok(!listActions(alive).some((action) => action.type === 'skill'));
  assert.match(reject(alive, { type: 'skill', unitId: 'p2-genga', skill: 'summon', to: sq('c8') }), /still alive/);
  // beast killed: Ge'nga can summon it next to him for 3 runes, which ends the turn
  let k = setup(
    { 'p2-genga': 'd8', 'p2-beast': 'd6', 'p1-aqna': 'd4', 'p1-hasim': 'a1' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 0, p2: 2 } },
  );
  k = act(k, mv('p1-aqna', 'd6'));
  assert.equal(k.units['p2-beast'].alive, false);
  assert.match(reject(k, { type: 'skill', unitId: 'p2-genga', skill: 'summon', to: sq('c8') }), /needs 3 runes/);
  k.energy.p2 = 3;
  const spots = listActions(k).filter((action) => action.type === 'skill' && action.skill === 'summon');
  assert.equal(spots.length, 5, 'empty squares around d8');
  reject(k, { type: 'skill', unitId: 'p2-genga', skill: 'summon', to: sq('d5') });
  k = act(k, { type: 'skill', unitId: 'p2-genga', skill: 'summon', to: sq('e7') });
  assert.equal(k.units['p2-beast'].alive, true);
  assert.deepEqual(k.units['p2-beast'].pos, sq('e7'));
  assert.equal(k.energy.p2, 0);
  assert.equal(k.current, 'p1', 'summoning uses the turn; no free beast move');
  assert.equal(k.lastAction.kind, 'summon');
  // beast flees when Ge'nga falls; nobody can summon it then
  let f = setup(
    { 'p2-genga': 'd5', 'p2-beast': 'h7', 'p2-plantae': 'h8', 'p1-aqna': 'd3', 'p1-hasim': 'a1' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'] },
  );
  f = act(f, mv('p1-aqna', 'd5'));
  assert.equal(f.units['p2-beast'].alive, false);
  // summoned onto an enemy, the beast eliminates it
  let c = setup(
    { 'p2-genga': 'd8', 'p2-beast': 'd6', 'p2-plantae': 'h8', 'p1-aqna': 'd4', 'p1-hasim': 'c7', 'p1-magumba': 'a1' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 0, p2: 3 } },
  );
  c = act(c, mv('p1-aqna', 'd6'));
  c = act(c, { type: 'skill', unitId: 'p2-genga', skill: 'summon', to: sq('c7') });
  assert.equal(c.units['p1-hasim'].alive, false);
  assert.deepEqual(c.units['p2-beast'].pos, sq('c7'));
  assert.equal(c.energy.p2, 1, '3 spent, +1 for the hero');
});

test('Magumba Empty Grave: 2 runes, a plus next to him; the first attack breaks it and the attacker stays put', () => {
  let s = setup(
    { 'p1-magumba': 'c3', 'p1-hasim': 'c4', 'p1-hexor': 'a1', 'p2-aqna': 'c7', 'p2-hasim': 'h5', 'p2-plantae': 'h8' },
    { p1: ['magumba', 'hasim', 'hexor', 'aqna'], energy: { p1: 1, p2: 0 } },
  );
  assert.match(
    reject(s, { type: 'skill', unitId: 'p1-magumba', skill: 'grave', targetId: 'p1-hasim' }),
    /needs 2 runes/,
  );
  s.energy.p1 = 2;
  s = act(s, { type: 'skill', unitId: 'p1-magumba', skill: 'grave', targetId: 'p1-hasim' });
  assert.equal(s.energy.p1, 0);
  assert.equal(s.units['p1-hasim'].warded, true);
  // the enemy may attack it: the shield breaks, nobody falls, the attacker stays where it was
  const hit = act(s, mv('p2-aqna', 'c4'));
  assert.equal(hit.units['p1-hasim'].alive, true);
  assert.equal(hit.units['p1-hasim'].warded, false, 'broken');
  assert.deepEqual(hit.units['p2-aqna'].pos, sq('c7'), 'thrown back');
  assert.equal(hit.lastAction.kind, 'shieldbreak');
  assert.equal(hit.current, 'p1', "their turn is over: it's Ivory's again");
  // left alone, the shielded unit still acts, kills, and keeps the shield
  s = act(s, mv('p2-hasim', 'h6'));
  assert.equal(s.units['p1-hasim'].warded, true, 'lasts past the next turn');
  s = act(s, mv('p1-hasim', 'c5'));
  s = act(s, mv('p2-hasim', 'h5'));
  s = act(s, mv('p1-hasim', 'c6'));
  s = act(s, mv('p2-hasim', 'h6'));
  assert.equal(s.units['p1-hasim'].warded, true, "two of Ivory's turns in");
  s = act(s, mv('p1-hasim', 'c7'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.equal(s.units['p1-hasim'].warded, true, 'still shielded after a kill');
  s = act(s, mv('p2-hasim', 'h5'));
  assert.equal(s.units['p1-hasim'].warded, false, 'unbroken, it wears off after 3 of your turns');
});

test('Plantae Aggressive Root: 3 tokens, roots a target for its next turn', () => {
  assert.equal(HEROES.plantae.skill.cost, 3);
  let s = setup(
    { 'p2-plantae': 'd6', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' },
    { current: 'p2', energy: { p1: 0, p2: 2 } },
  );
  assert.match(
    reject(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hexor' }),
    /needs 3 runes/,
  );
  s.energy.p2 = 3;
  s = act(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hexor' });
  assert.equal(s.energy.p2, 0);
  assert.equal(s.current, 'p1');
  assert.match(reject(s, mv('p1-hexor', 'e6')), /roots/);
  s = act(s, mv('p1-hasim', 'a2'));
  s = act(s, mv('p2-aqna', 'h7'));
  assert.equal(s.units['p1-hexor'].rooted, 0);
  act(s, mv('p1-hexor', 'e6'));
});

test('Plantae interrupt: 3 tokens, negates an action on her lines; she is not rooted, it recharges', () => {
  // d7: the 3x3 block in front of her is c6..e4; nothing beside or behind her.
  const base = setup(
    { 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' },
    { energy: { p1: 0, p2: 3 } },
  );
  const s = act(base, mv('p1-hexor', 'e6'));
  assert.equal(s.phase, 'react');
  assert.equal(toMove(s), 'p2');
  assert.deepEqual(s.units['p1-hexor'].pos, sq('d4'), 'action is on hold');
  const used = act(s, { type: 'react', use: true });
  assert.deepEqual(used.units['p1-hexor'].pos, sq('d4'));
  assert.equal(used.current, 'p2', "Ivory's turn is over; Ember plays normally");
  assert.equal(used.energy.p2, 0, '3 spent, no refill on the new turn');
  assert.equal(used.units['p2-plantae'].rooted, 0, 'no self-root any more');
  assert.equal(used.units['p2-plantae'].cd, 2, 'recharging: 3 of her turns, one already ticking');
  assert.ok(
    listActions(used).some((action) => action.unitId === 'p2-plantae'),
    'Plantae can act right away',
  );
  const declined = act(s, { type: 'react', use: false });
  assert.deepEqual(declined.units['p1-hexor'].pos, sq('e6'));
  // only in her pattern: beside the block, behind her, or a far one gets no prompt
  const side = act(
    setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'b5', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } }),
    mv('p1-hexor', 'a3'),
  );
  assert.equal(side.phase, 'main', 'beside the block, moving away: not in the pattern');
  const entering = act(
    setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'b5', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } }),
    mv('p1-hexor', 'd6'),
  );
  assert.equal(entering.phase, 'react', 'moving into the block from outside: she may stop it');
  assert.deepEqual(act(entering, { type: 'react', use: true }).units['p1-hexor'].pos, sq('b5'), 'kept outside');
  const behind = act(
    setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd8', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } }),
    mv('p1-hexor', 'b7'),
  );
  assert.equal(behind.phase, 'main', 'never reaches behind her');
  const far = act(
    setup({ 'p2-plantae': 'h8', 'p2-aqna': 'a8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 3 } }),
    mv('p1-hexor', 'e6'),
  );
  assert.equal(far.phase, 'main');
  const poor = act(
    setup({ 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' }, { energy: { p1: 0, p2: 2 } }),
    mv('p1-hexor', 'e6'),
  );
  assert.equal(poor.phase, 'main');
});

test("Plantae and Magumba skill patterns are fixed shapes, never blocked by what's in between", () => {
  // Plantae (p1-plantae on d4, facing p2's side): the 3x3 block in front of her (c5..e7);
  // never beside or behind her (d3). An ally standing in the path doesn't block it.
  const p = setup(
    {
      'p1-plantae': 'd4',
      'p1-hasim': 'd5', // ally sits directly between her and the target further ahead
      'p2-aqna': 'd6',
      'p2-hasim': 'f5',
      'p2-genga': 'd3',
    },
    { energy: { p1: 3, p2: 0 } },
  );
  const roots = listActions(p)
    .filter((action) => action.type === 'skill')
    .map((action) => action.targetId);
  assert.deepEqual(roots, ['p2-aqna'], 'the ally in between does not block the enemy further ahead');
  assert.match(
    reject(p, { type: 'skill', unitId: 'p1-plantae', skill: 'root', targetId: 'p2-hasim' }),
    /root pattern/,
    'beside the block: out of the pattern',
  );
  assert.match(
    reject(p, { type: 'skill', unitId: 'p1-plantae', skill: 'root', targetId: 'p2-genga' }),
    /root pattern/,
    'behind her: out of the pattern',
  );

  // Magumba (p1-magumba on d4): a fan 2 squares deep, 5 wide at its far edge (also unblocked).
  const m = setup(
    {
      'p1-magumba': 'd4',
      'p1-hasim': 'd5', // ally on the fan's near row
      'p1-hexor': 'f6', // ally on the fan's far row, out at its very edge
      'p2-aqna': 'h8',
    },
    { energy: { p1: 2, p2: 0 } },
  );
  const shields = listActions(m)
    .filter((action) => action.type === 'skill')
    .map((action) => action.targetId)
    .sort();
  assert.deepEqual(shields, ['p1-hasim', 'p1-hexor', 'p1-magumba']);
  // terrain in the fan doesn't block it either
  const t = setup({ 'p1-magumba': 'd4', 'p1-hasim': 'f6' }, { blocks: { d5: 'rock' }, energy: { p1: 2, p2: 0 } });
  assert.deepEqual(
    listActions(t)
      .filter((action) => action.type === 'skill')
      .map((action) => action.targetId)
      .sort(),
    ['p1-hasim', 'p1-magumba'],
  );
});

test('Hexor Storm Hammer: optional 2-token slam after a capture; pick + or X, pushes 2, stops early, never kills, spares warded', () => {
  const pos = {
    'p1-hexor': 'b3',
    'p1-hasim': 'b6',
    'p1-magumba': 'c6',
    'p2-aqna': 'c5',
    'p2-plantae': 'd5',
    'p2-genga': 'f5',
    'p2-beast': 'd4',
    'p2-hasim': 'c4',
  };
  let s = setup(pos, { blocks: { e3: 'rock' }, energy: { p1: 2, p2: 0 } });
  s.units['p1-magumba'].warded = true;
  s = act(s, mv('p1-hexor', 'c5'));
  assert.equal(s.units['p2-aqna'].alive, false);
  assert.equal(s.phase, 'storm');
  assert.deepEqual(listActions(s), [
    { type: 'storm', pattern: 'plus' },
    { type: 'storm', pattern: 'x' },
    { type: 'skip' },
  ]);
  const skipped = act(s, { type: 'skip' });
  assert.equal(skipped.current, 'p2');
  assert.deepEqual(skipped.units['p2-plantae'].pos, sq('d5'), 'skip: nobody is pushed');
  assert.equal(skipped.energy.p2, 0, 'tokens do not refill each turn');
  // + slam: only the 4 straight neighbours, each pushed 2 squares away from Hexor
  s = act(s, { type: 'storm', pattern: 'plus' });
  assert.equal(s.energy.p1, 1, '2 runes + 1 for the kill, minus 2 for the slam');
  assert.equal(s.lastAction.kind, 'storm');
  assert.deepEqual(s.units['p2-hasim'].pos, sq('c2'), 'straight south of Hexor: pushed 2');
  assert.deepEqual(s.units['p2-plantae'].pos, sq('e5'), "straight east: Ge'nga on f5 is in the way, so 1 square only");
  assert.deepEqual(s.units['p2-genga'].pos, sq('f5'), 'not next to Hexor: untouched');
  assert.deepEqual(s.units['p1-magumba'].pos, sq('c6'), 'warded: holds');
  assert.deepEqual(s.units['p1-hasim'].pos, sq('b6'), 'diagonal to Hexor: outside the + pattern, untouched');
  assert.deepEqual(s.units['p2-beast'].pos, sq('d4'), 'diagonal to Hexor: outside the + pattern, untouched');
  // not enough tokens (even with the kill's rune): no storm phase
  const poor = act(setup(pos, { blocks: { e3: 'rock' }, energy: { p1: 0, p2: 0 } }), mv('p1-hexor', 'c5'));
  assert.equal(poor.phase, 'main');
  assert.equal(poor.current, 'p2');
  // X slam: the diagonal neighbours this time, pushing the beast toward the rock
  let x = act(setup(pos, { blocks: { e3: 'rock' }, energy: { p1: 2, p2: 0 } }), mv('p1-hexor', 'c5'));
  x = act(x, { type: 'storm', pattern: 'x' });
  assert.deepEqual(x.units['p1-hasim'].pos, sq('a7'), 'diagonal ally: the board edge stops it after 1 square');
  assert.equal(x.units['p2-beast'].alive, true, 'never eliminated by the slam, even into terrain');
  assert.deepEqual(
    x.units['p2-beast'].pos,
    sq('e4'),
    'rock at e3 blocks it: slips aside, away from Hexor, toward the middle (e4, not d3)',
  );
  assert.deepEqual(x.units['p2-plantae'].pos, sq('d5'), 'straight to Hexor: outside the X pattern, untouched');
  // board corner: no empty square to slip into, so it holds its ground, never eliminated
  let e = setup(
    { 'p1-hexor': 'c5', 'p2-aqna': 'b7', 'p2-plantae': 'a8', 'p2-genga': 'h1' },
    { energy: { p1: 2, p2: 0 } },
  );
  e = act(act(e, mv('p1-hexor', 'b7')), { type: 'storm', pattern: 'x' });
  assert.equal(e.units['p2-plantae'].alive, true);
  assert.deepEqual(e.units['p2-plantae'].pos, sq('a8'), 'in the corner: nowhere to go, holds its ground');
});

test('Aqna Icy Step: 1 token for ice after a kill; ice blocks everyone; oldest moves at the limit', () => {
  const pos = { 'p1-aqna': 'a3', 'p1-hasim': 'h1', 'p2-genga': 'a5', 'p2-plantae': 'h8' };
  const poor = act(setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'] }), mv('p1-aqna', 'a5'));
  assert.equal(poor.phase, 'ice', "no runes before the kill: the hero kill's rune pays for the ice");
  let s = setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } });
  s = act(s, mv('p1-aqna', 'a5'));
  assert.equal(s.phase, 'ice');
  assert.match(reject(s, { type: 'ice', to: sq('a1') }), /within 3/);
  s = act(s, { type: 'ice', to: sq('c5') });
  assert.equal(blockAt(s, sq('c5')).kind, 'ice');
  assert.equal(s.current, 'p2');
  assert.equal(s.energy.p1, 1, '1 rune + 1 for the kill, minus 1 for the ice');
  const sl = moveOptions(s, s.units['p1-aqna']).map((option) => option.to);
  assert.ok(!sl.some((cell) => cell.c >= 2 && cell.r === sq('c5').r), 'her own ice blocks her slide');
  // limit
  let t = setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } });
  t.iceBy['p1-aqna'] = [];
  const spots = ['h3', 'h4', 'g3', 'g4', 'f3', 'f4', 'e3', 'e4', 'h5', 'g5'];
  for (const n of spots) {
    t.blocks[key(sq(n))] = { kind: 'ice', owner: 'p1-aqna' };
    t.iceBy['p1-aqna'].push(key(sq(n)));
  }
  t = act(t, mv('p1-aqna', 'a5'));
  t = act(t, { type: 'ice', to: sq('b6') });
  assert.equal(blockAt(t, sq('h3')), null, 'oldest block moved');
  assert.equal(t.iceBy['p1-aqna'].length, 10);
  // skip is allowed and free
  let u = setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } });
  u = act(act(u, mv('p1-aqna', 'a5')), { type: 'skip' });
  assert.equal(u.current, 'p2');
  assert.equal(u.energy.p1, 2);
});

test('Aqna Icy Step: the charge is storable (not immediate) and never stacks', () => {
  const pos = { 'p1-aqna': 'a3', 'p1-hasim': 'h1', 'p2-genga': 'a5', 'p2-plantae': 'h8', 'p2-hasim': 'b5' };
  // skip the immediate ice prompt; she keeps the charge for a later turn of her choosing
  let s = setup(pos, { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } });
  s = act(s, mv('p1-aqna', 'a5')); // kills p2-genga, enters the 'ice' prompt
  assert.equal(s.phase, 'ice');
  assert.equal(s.units['p1-aqna'].iceCharge, 1);
  s = act(s, { type: 'skip' });
  assert.equal(s.phase, 'main');
  assert.equal(s.units['p1-aqna'].iceCharge, 1, 'charge persists after skipping the immediate prompt');
  // it is not spent by other units' turns, and shows up as a skill action whenever she acts
  s = act(s, mv('p2-hasim', 'b4'));
  const acts = listActions(s).filter((action) => action.type === 'skill' && action.unitId === 'p1-aqna');
  assert.ok(acts.length > 0, 'Icy Step is listed as a skill action while the charge is held');
  s = act(s, { type: 'skill', unitId: 'p1-aqna', skill: 'icy', to: sq('c5') });
  assert.equal(blockAt(s, sq('c5')).kind, 'ice');
  assert.equal(s.units['p1-aqna'].iceCharge, 0, 'charge is spent');
  assert.equal(s.energy.p1, 1, "1 token spent on her own turn, not the kill's turn");

  // charges never stack: a second kill while one is already held still leaves exactly one
  let t = setup(
    { 'p1-aqna': 'a3', 'p1-hasim': 'h1', 'p2-genga': 'a5', 'p2-hasim': 'a7', 'p2-plantae': 'h8' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } },
  );
  t = act(t, mv('p1-aqna', 'a5')); // first kill, charge = 1
  t = act(t, { type: 'skip' });
  assert.equal(t.units['p1-aqna'].iceCharge, 1);
  t = act(t, mv('p2-hasim', 'a6'));
  t = act(t, mv('p1-aqna', 'a6')); // second kill while already holding a charge
  assert.equal(t.units['p1-aqna'].iceCharge, 1, 'still just one charge, never two');
});

test('tokens: start at 4, never refill per turn, kills and breakthroughs give more (no cap)', () => {
  let s = createMatch({ map: 'field' });
  assert.deepEqual(s.energy, { p1: 4, p2: 4 });
  s = act(s, mv('p1-hasim', 'c2'));
  assert.equal(s.energy.p2, 4);
  s.energy = { p1: 1, p2: 1 };
  s = act(s, mv('p2-creep-a', 'a6'));
  s = act(s, { type: 'skip' }); // Ember's opening: no second creep
  s = act(s, mv('p1-creep-a', 'a3'));
  assert.deepEqual(s.energy, { p1: 1, p2: 1 }, 'no +1 per turn');
  assert.equal(CREEPS.lastHit, 1);
  assert.equal(CREEPS.breach, 1);
  // a creep kill at 4 goes past 4
  let k = setup(
    { 'p1-aqna': 'd4', 'p1-hasim': 'a1', 'p2-creep-b': 'd6', 'p2-genga': 'h8' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 4, p2: 0 } },
  );
  k = act(k, mv('p1-aqna', 'd6'));
  if (k.phase === 'ice') k = act(k, { type: 'skip' });
  assert.equal(k.energy.p1, 5);
});

test('win when every enemy hero is down (beasts do not count)', () => {
  let s = setup(
    { 'p1-aqna': 'a3', 'p1-hasim': 'h1', 'p2-plantae': 'a5', 'p2-beast': 'h8' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'] },
  );
  s.units['p2-beast'].ownerId = 'p2-genga';
  s = act(s, mv('p1-aqna', 'a5'));
  assert.equal(s.status, 'p1');
  assert.equal(listActions(s).length, 0);
});

test('random play: every listed action is accepted, no shared squares, tokens stay in range', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const heroes = Object.keys(HEROES);
  let finished = 0;
  for (let g = 0; g < 60; g++) {
    const pick = () => {
      const h = [...heroes];
      const out = [];
      while (out.length < 4) out.push(h.splice(Math.floor(rnd() * h.length), 1)[0]);
      return out;
    };
    let s = createMatch({ p1: pick(), p2: pick(), map: Object.keys(MAPS)[g % 5] });
    for (let n = 0; n < 400 && s.status === 'playing'; n++) {
      const acts = listActions(s);
      assert.ok(acts.length > 0, 'a playing state always has an action');
      s = act(s, acts[Math.floor(rnd() * acts.length)]);
      const pos = Object.values(s.units)
        .filter((unit) => unit.alive)
        .map((unit) => key(unit.pos));
      assert.equal(new Set(pos).size, pos.length);
      assert.ok(
        pos.every((cellKey) => !s.blocks[cellKey]),
        'no unit inside terrain',
      );
      for (const t of ['p1', 'p2'])
        assert.ok(s.energy[t] >= 0 && s.energy[t] <= ENERGY.max + 2, `tokens out of range: ${s.energy[t]}`);
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
  const creepMoves = listActions(s).filter((action) => action.unitId === 'p1-creep-a');
  assert.deepEqual(
    creepMoves.map((action) => action.to),
    [sq('a3'), sq('a4')],
    'first move: 1 or 2 squares forward, both empty',
  );
  reject(s, mv('p1-creep-a', 'a5'));
  reject(s, mv('p1-creep-b', 'c2'));
  s = act(s, mv('p1-creep-a', 'a4'));
  assert.equal(s.phase, 'pawns', "a side's first turn: a second creep may move too");
  assert.equal(s.current, 'p1');
  assert.ok(!listActions(s).some((action) => action.unitId === 'p1-creep-a'), 'not the same one');
  assert.ok(!listActions(s).some((action) => action.unitId === 'p1-hasim'), 'only creeps');
  s = act(s, mv('p1-creep-b', 'b4'));
  assert.equal(s.current, 'p2');
  reject(s, mv('p2-creep-h', 'h8'));
  s = act(s, mv('p2-creep-h', 'h6'));
  s = act(s, { type: 'skip' });
  assert.equal(s.current, 'p1');
  s = act(s, mv('p1-creep-g', 'g3'));
  assert.equal(s.current, 'p2', 'from the second turn on, one action per turn');
  s = act(s, mv('p2-creep-g', 'g6'));
  const again = listActions(s).filter((action) => action.unitId === 'p1-creep-a');
  assert.deepEqual(
    again.map((action) => action.to),
    [sq('a5')],
    'after its first move, only 1 square forward',
  );
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
  const fresh = r.units['p1-creep-g-2'];
  assert.ok(fresh?.alive, 'a new creep joins');
  assert.deepEqual(fresh.pos, sq('g2'), 'on the starting square of its lane');
  assert.ok(!fresh.moved, 'with its double first step');
  assert.equal(r.lastAction.respawned, 'p1-creep-g-2');
  // its starting square taken: the nearest open square instead, on the same rank if it can
  let taken = setup({ 'p1-creep-g': 'e7', 'p1-hasim': 'g2', 'p2-genga': 'h8' });
  taken = act(taken, mv('p1-creep-g', 'e8'));
  const moved = taken.units['p1-creep-g-2'];
  assert.ok(moved?.alive);
  assert.equal(moved.pos.r, sq('g2').r, 'same rank');
  assert.equal(Math.abs(moved.pos.c - sq('g2').c), 1, 'right next to its starting square');
});

test('creeps: last hit gives a token; a creep capture can win the game; rooted creeps cannot move', () => {
  let s = setup(
    { 'p1-aqna': 'd4', 'p1-hasim': 'a1', 'p2-creep-b': 'd6', 'p2-genga': 'h8' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'] },
  );
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
  assert.equal(Object.values(s.units).filter((unit) => unit.kind === 'creep').length, 0);
});

test('Aggressive Root has a 3-turn cooldown shared by active use and interrupts', () => {
  let s = setup(
    { 'p2-plantae': 'd6', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' },
    { current: 'p2', energy: { p1: 0, p2: 4 } },
  );
  s = act(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hexor' });
  assert.equal(s.units['p2-plantae'].cd, 3);
  s = act(s, mv('p1-hasim', 'a2'));
  assert.equal(s.units['p2-plantae'].cd, 2);
  s.energy.p2 = 4;
  assert.match(
    reject(s, { type: 'skill', unitId: 'p2-plantae', skill: 'root', targetId: 'p1-hasim' }),
    /recharging: ready in 2 turns/,
  );
  s = act(s, mv('p2-aqna', 'h7'));
  const noPrompt = act(s, mv('p1-hexor', 'e6'));
  assert.equal(noPrompt.phase, 'main');
  // an interrupt also starts the cooldown
  const base = setup(
    { 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' },
    { energy: { p1: 0, p2: 4 } },
  );
  let r = act(act(base, mv('p1-hexor', 'e6')), { type: 'react', use: true });
  assert.equal(r.units['p2-plantae'].cd, 2, "set to 3, ticked at the start of Ember's turn");
  r = act(r, mv('p2-aqna', 'h7'));
  r = act(r, mv('p1-hasim', 'a2'));
  assert.equal(r.units['p2-plantae'].cd, 1);
  assert.equal(
    listActions(r).some((action) => action.type === 'skill'),
    false,
  );
});

test('Aggressive Root can interrupt again once recharged (no per-match cap)', () => {
  const base = setup(
    { 'p2-plantae': 'd7', 'p2-aqna': 'h8', 'p1-hexor': 'd4', 'p1-hasim': 'a1' },
    { energy: { p1: 0, p2: 4 } },
  );
  let s = act(act(base, mv('p1-hexor', 'e6')), { type: 'react', use: true });
  assert.equal(s.units['p2-plantae'].reacts, 1);
  s = act(s, mv('p2-aqna', 'h7'));
  s.units['p2-plantae'].cd = 0;
  s.energy.p2 = 4;
  const again = act(s, mv('p1-hexor', 'e6'));
  assert.equal(again.phase, 'react', 'a second interrupt is offered');
});

test('Storm Hammer never eliminates anyone, ally or enemy, even pushed off the board or into terrain', () => {
  const opts = { energy: { p1: 2, p2: 0 } };
  const pos = {
    'p1-hexor': 'c5',
    'p1-hasim': 'a8',
    'p1-creep-b': 'c8',
    'p2-aqna': 'b7',
    'p2-plantae': 'a7',
    'p2-genga': 'h1',
  };
  // X: two diagonal allies pushed into the edge: one in the corner holds, the other slips aside
  const x = act(act(setup(pos, opts), mv('p1-hexor', 'b7')), { type: 'storm', pattern: 'x' });
  assert.equal(x.units['p2-aqna'].alive, false, 'captured by the move itself, not the slam');
  assert.equal(x.units['p1-hasim'].alive, true);
  assert.deepEqual(x.units['p1-hasim'].pos, sq('a8'), 'corner: holds');
  assert.equal(x.units['p1-creep-b'].alive, true);
  assert.deepEqual(x.units['p1-creep-b'].pos, sq('d8'), 'edge: slips to the square angled away from Hexor');
  // +: the enemy to the west hits the edge too: a8 is taken, so it slips to a6
  const plus = act(act(setup(pos, opts), mv('p1-hexor', 'b7')), { type: 'storm', pattern: 'plus' });
  assert.equal(plus.units['p2-plantae'].alive, true);
  assert.deepEqual(plus.units['p2-plantae'].pos, sq('a6'));
  // terrain works the same way, for anyone
  let t = setup(
    { 'p1-hexor': 'b3', 'p1-hasim': 'd5', 'p2-aqna': 'c5', 'p2-genga': 'h1' },
    { ...opts, blocks: { e5: 'rock' } },
  );
  t = act(act(t, mv('p1-hexor', 'c5')), { type: 'storm', pattern: 'plus' });
  assert.equal(t.units['p1-hasim'].alive, true);
  assert.deepEqual(t.units['p1-hasim'].pos, sq('e4'), 'rock at e5: slips to e4, nearer the middle than e6');
});

test('creeps: lanes are the flank files and no map puts terrain in them', () => {
  for (const map of Object.keys(MAPS)) {
    const m = createMatch({ map });
    const creeps = Object.values(m.units).filter((unit) => unit.kind === 'creep');
    assert.equal(creeps.length, 8);
    for (const c of creeps) {
      assert.ok('abgh'.includes('abcdefgh'[c.pos.c]), `${map}: creep on a centre file`);
      for (let r = 0; r < 8; r++)
        assert.equal(blockAt(m, { r, c: c.pos.c }), null, `${map}: terrain in creep lane ${'abcdefgh'[c.pos.c]}`);
    }
  }
  // terrain still blocks a creep straight ahead (no sidestep, no hop)
  const s = setup({ 'p1-creep-b': 'c3', 'p1-hasim': 'a1', 'p2-genga': 'h8' }, { blocks: { c4: 'pillar' } });
  assert.equal(listActions(s).filter((action) => action.unitId === 'p1-creep-b').length, 0);
});

test('Replay: createMatch(setup) plus the trail reproduces the match exactly', () => {
  let g = createMatch({ map: 'jungle' });
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 80 && g.status === 'playing'; n++) {
    const L = listActions(g);
    g = act(g, L[Math.floor(rnd() * L.length)]);
  }
  assert.ok(g.trail.length > 0);
  let r = createMatch(g.setup);
  for (const a of g.trail) r = act(r, a);
  assert.deepEqual(r.units, g.units);
  assert.deepEqual(r.blocks, g.blocks);
  assert.equal(r.turn, g.turn);
  assert.deepEqual(r.log, g.log);
});

test("Ge'nga steps 1 in a + pattern; his beast picks a stride on its first move and keeps it all match", () => {
  const s = setup(
    { 'p1-hasim': 'a1', 'p2-genga': 'd5', 'p2-beast': 'f5', 'p2-aqna': 'h8' },
    { current: 'p2', p2: ['genga', 'aqna', 'plantae', 'hasim'] },
  );
  const g = moveOptions(s, s.units['p2-genga'])
    .map((option) => option.to)
    .sort((first, second) => first.r - second.r || first.c - second.c);
  assert.deepEqual(g, [sq('d6'), sq('c5'), sq('e5'), sq('d4')]);
  const after = act(s, mv('p2-genga', 'd4'));
  assert.equal(after.phase, 'beast');
  const moves = listActions(after).filter((action) => action.type === 'move');
  const count = (stride) => moves.filter((action) => action.pattern === stride).length;
  assert.deepEqual([count('any'), count('plus'), count('cross')], [8, 8, 8], 'every stride offered, each tagged');
  assert.match(reject(after, { ...mv('p2-beast', 'g8'), pattern: 'cross' }), /./, 'never 3');
  let crossed = act(after, { ...mv('p2-beast', 'h7'), pattern: 'cross' });
  assert.equal(crossed.units['p2-beast'].stride, 'cross');
  // from now on only the cross, even after it falls and is summoned back
  crossed.current = 'p2';
  crossed = act(crossed, mv('p2-genga', 'd3'));
  const later = listActions(crossed).filter((action) => action.type === 'move');
  assert.ok(later.length && later.every((action) => !action.pattern), 'no stride to pick any more');
  assert.ok(
    later.every((action) => Math.abs(action.to.r - sq('h7').r) === Math.abs(action.to.c - sq('h7').c)),
    'diagonal only',
  );
  crossed.units['p2-beast'].alive = false;
  crossed.energy.p2 = 3;
  crossed.phase = 'main';
  crossed.pending = null;
  crossed = act(crossed, { type: 'skill', unitId: 'p2-genga', skill: 'summon', to: sq('d2') });
  assert.equal(crossed.units['p2-beast'].stride, 'cross', 'a summon keeps it');
});

test('maps: obstacles sit on both square colours, so a piece that stays on one colour is never walled off', () => {
  for (const [id, m] of Object.entries(MAPS)) {
    const cells = Object.keys(createMatch({ map: id }).blocks).map((cellKey) => cellKey.split(',').map(Number));
    if (!Object.values(m.blocks).flat().length) {
      assert.equal(cells.length, 0, `${id} is open`);
      continue;
    }
    const colours = new Set(cells.map(([row, col]) => (row + col) % 2));
    assert.equal(colours.size, 2, `${id} has obstacles on one colour only`);
  }
});

test('commander: Plantae or Magumba leads (the first picked, if both); when it falls its side loses', () => {
  assert.equal(teamProblem(['hasim', 'hexor', 'magumba', 'aqna']), null);
  assert.match(teamProblem(['hasim', 'hexor', 'genga', 'aqna']), /commander/);
  assert.equal(teamProblem(['hasim', 'hexor', 'magumba', 'plantae']), null, 'both may come; one leads');
  assert.throws(() =>
    matchFromConfig({ p1: ['hasim', 'hexor', 'genga', 'aqna'], p2: ['genga', 'aqna', 'plantae', 'hasim'] }),
  );
  for (let seed = 0; seed < 30; seed++) assert.equal(teamProblem(pickTeam(seed)), null, `bot team ${seed}`);
  const both = createMatch({
    p1: ['hasim', 'plantae', 'hexor', 'magumba'],
    p2: ['magumba', 'aqna', 'plantae', 'hasim'],
  });
  assert.equal(both.units['p1-plantae'].commander, true, 'first in pick order leads');
  assert.ok(!both.units['p1-magumba'].commander);
  assert.equal(both.units['p2-magumba'].commander, true);
  let s = setup(
    { 'p1-aqna': 'd4', 'p1-hasim': 'a1', 'p2-plantae': 'd6', 'p2-genga': 'h8', 'p2-hasim': 'h1' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'] },
  );
  s = act(s, mv('p1-aqna', 'd6'));
  assert.equal(s.status, 'p1', 'Ember still has two heroes, but its commander is down');
  assert.match(s.log[s.log.length - 1].text, /commander/);
  // the hero that doesn't lead can fall without ending the match
  let t2 = setup(
    { 'p1-aqna': 'd4', 'p1-magumba': 'a1', 'p2-plantae': 'h8', 'p2-magumba': 'd6', 'p2-hasim': 'h1' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'], p2: ['plantae', 'magumba', 'genga', 'hasim'] },
  );
  t2 = act(t2, mv('p1-aqna', 'd6'));
  assert.equal(t2.status, 'playing');
});

test('Aqna: ice raised on an enemy eliminates it; a shielded enemy is out of reach', () => {
  let s = setup(
    { 'p1-aqna': 'd4', 'p1-hasim': 'a1', 'p2-genga': 'f5', 'p2-hasim': 'e3', 'p2-plantae': 'h8' },
    { p1: ['aqna', 'hasim', 'hexor', 'magumba'], energy: { p1: 1, p2: 0 } },
  );
  s.units['p1-aqna'].iceCharge = 1;
  s.units['p2-hasim'].warded = true;
  const spots = listActions(s).filter((action) => action.type === 'skill');
  assert.ok(spots.some((action) => action.to.r === sq('f5').r && action.to.c === sq('f5').c));
  assert.ok(!spots.some((action) => action.to.r === sq('e3').r && action.to.c === sq('e3').c), 'not through a shield');
  s = act(s, { type: 'skill', unitId: 'p1-aqna', skill: 'icy', to: sq('f5') });
  assert.equal(s.units['p2-genga'].alive, false, 'frozen, then shattered');
  assert.equal(blockAt(s, sq('f5')), null, 'the ice breaks: no block is left');
  assert.equal(s.lastAction.frozen, 'p2-genga');
  assert.equal(s.energy.p1, 1, '1 spent, +1 for the hero');
  // the ice doesn't use her turn: she may still move, or skip
  assert.equal(s.phase, 'icewalk');
  assert.ok(listActions(s).every((action) => action.type === 'skip' || action.unitId === 'p1-aqna'));
  const walked = act(s, mv('p1-aqna', 'd7'));
  assert.equal(walked.current, 'p2');
  assert.equal(act(s, { type: 'skip' }).current, 'p2');
});

test('Empty Grave: a Backstab into a shield breaks it and Hasim stays put', () => {
  let s = setup(
    { 'p1-hasim': 'd4', 'p1-magumba': 'a1', 'p2-genga': 'd5', 'p2-plantae': 'h8' },
    { p1: ['hasim', 'hexor', 'magumba', 'aqna'] },
  );
  s.units['p2-genga'].warded = true;
  s.units['p2-genga'].wardTurns = 3;
  s = act(s, mv('p1-hasim', 'd6'));
  assert.deepEqual(s.units['p1-hasim'].pos, sq('d4'));
  assert.equal(s.units['p2-genga'].alive, true);
  assert.equal(s.units['p2-genga'].warded, false);
  assert.equal(s.current, 'p2');
});
