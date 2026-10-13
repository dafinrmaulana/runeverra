// Hero Gambit — Arena rules engine (character roster edition).
// Pure, deterministic functions over one game state. No DOM, no randomness.
// Every mutator returns a NEW state and never changes its input.

export const BOARD_SIZE = 8;
export const TEAMS = ['p1', 'p2'];
export const TEAM_NAMES = { p1: 'Ivory', p2: 'Ember' };
export const ENERGY = { start: 1, perTurn: 1, max: 6 };
export const ICE_LIMIT = 10;
// Creeps: pawn-like minions moved by their player (moving one uses the turn's action).
//   files: starting files on each side's second rank (mirrored for Ember)
//   lastHit: energy for eliminating an enemy creep; breach: energy when a creep reaches the far rank
export const CREEPS = { files: ['a', 'c', 'e', 'g'], lastHit: 1, breach: 2 };

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KING = [...ORTHO, ...DIAG];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

export const CLASSES = {
  claw: { name: 'Claw' },
  leaf: { name: 'Leaf' },
  shield: { name: 'Shield' },
};

// Heroes are data. Movement rules: slide (dirs, range, stops at first unit or block,
// may capture the first enemy), leap (fixed jumps over anything), backstab (Hasim).
export const HEROES = {
  hasim: {
    name: 'Hasim', title: 'Desert Assassin', cls: 'claw',
    move: [{ kind: 'slide', dirs: KING, range: 1 }, { kind: 'backstab' }],
    moveText: 'Steps 1 square in any direction.',
    skill: {
      key: 'backstab', name: 'Backstab', type: 'passive',
      text: 'Jumps in any direction over one adjacent unit or object. An enemy jumped over is eliminated; an enemy on the landing square is eliminated too.',
    },
  },
  genga: {
    name: "Ge'nga", title: 'Beast Master', cls: 'claw',
    move: [{ kind: 'slide', dirs: ORTHO, range: 2 }],
    moveText: 'Moves up to 2 squares straight.',
    skill: {
      key: 'wild', name: 'Wild Company', type: 'passive',
      text: 'Starts the match with a beast at his side. The beast moves on its own, always right after Ge\'nga acts. If Ge\'nga falls, the beast flees.',
    },
  },
  magumba: {
    name: 'Magumba', title: 'Shadow Shaman', cls: 'leaf',
    move: [{ kind: 'slide', dirs: DIAG, range: 2 }],
    moveText: 'Moves up to 2 squares diagonally.',
    skill: {
      key: 'grave', name: 'Empty Grave', type: 'active', cost: 3, range: 3,
      text: 'Targets one ally (or himself) up to 3 squares away. Until your next turn, every enemy attack or skill against that unit is negated. Also removes Root from it.',
    },
  },
  plantae: {
    name: 'Plantae', title: 'Jungle Keeper', cls: 'leaf',
    move: [{ kind: 'slide', dirs: ORTHO, range: 1 }],
    moveText: 'Steps 1 square straight.',
    skill: {
      key: 'root', name: 'Aggressive Root', type: 'active', cost: 3, range: 3, reaction: true, cooldown: 3, maxReactions: 1,
      text: 'Roots an enemy up to 3 squares away: it can\'t act on its next turn. Once per match it can instead be cast during the opponent\'s turn, when an enemy within 3 squares acts: that action is negated. After either use, it recharges for 3 of your turns.',
    },
  },
  hexor: {
    name: 'Hexor', title: 'Iron Knight', cls: 'shield',
    move: [{ kind: 'leap', deltas: KNIGHT }],
    moveText: 'Jumps in an L, like a chess knight.',
    skill: {
      key: 'storm', name: 'Storm Hammer', type: 'passive',
      text: 'When Hexor hits an enemy, every unit around the target is pushed 1 square away, pushing any unit behind it too. An enemy pushed into terrain or off the board is eliminated; an ally there just stays put.',
    },
  },
  aqna: {
    name: 'Aqna', title: 'Winter Hunter', cls: 'shield',
    move: [{ kind: 'slide', dirs: ORTHO, range: 7 }],
    moveText: 'Slides any distance straight.',
    skill: {
      key: 'icy', name: 'Icy Step', type: 'passive',
      text: `When she eliminates an enemy she may raise an ice block up to 3 squares away. Nobody can enter ice, including her. Up to ${ICE_LIMIT} blocks; after that her oldest block moves to the new spot.`,
    },
  },
};
export const BEAST = {
  name: 'Beast', title: "Ge'nga's companion", cls: 'claw',
  move: [{ kind: 'slide', dirs: KING, range: 1 }],
  moveText: 'Steps 1 square in any direction, right after Ge\'nga acts.',
};
export const CREEP = {
  name: 'Creep', title: 'Minion', cls: 'claw',
  move: [{ kind: 'creep' }],
  moveText: 'Steps 1 square forward onto an empty square, or captures an enemy diagonally in front. If terrain is straight ahead, it can step diagonally forward around it. Never moves back or sideways.',
};
export const heroDef = (u) => (u.kind === 'beast' ? BEAST : u.kind === 'creep' ? CREEP : HEROES[u.hero]);

// Maps: obstacles are listed for Ivory's half; the other half is the 180° mirror.
export const MAPS = {
  oasis: { name: 'Oasis Bazaar', theme: 'desert', blurb: 'Sandstone pillars and a dry well split the market.', blocks: { pillar: ['c4', 'a5'] } },
  savanna: { name: 'Savanna Crossing', theme: 'savanna', blurb: 'Acacia trees funnel fights through the middle.', blocks: { tree: ['b4', 'e4'] } },
  jungle: { name: 'Jungle Ruins', theme: 'jungle', blurb: 'Overgrown stones make tight lanes. Great for Backstab.', blocks: { ruin: ['a4', 'c5', 'd3'] } },
  keep: { name: 'Winter Keep', theme: 'winter', blurb: 'Castle crenels and frozen rocks guard the flanks.', blocks: { rock: ['b5', 'd4'], ice: [] } },
  field: { name: 'Open Field', theme: 'field', blurb: 'No terrain. Pure positioning.', blocks: {} },
};

// ---------- geometry ----------
const FILES = 'abcdefgh';
export const inBounds = (p) => p.r >= 0 && p.r < BOARD_SIZE && p.c >= 0 && p.c < BOARD_SIZE;
export const samePos = (a, b) => a.r === b.r && a.c === b.c;
export const chebyshev = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
export const squareName = (p) => `${FILES[p.c]}${BOARD_SIZE - p.r}`;
export const parseSquare = (n) => ({ c: FILES.indexOf(n[0]), r: BOARD_SIZE - Number(n[1]) });
export const key = (p) => `${p.r},${p.c}`;
const other = (t) => (t === 'p1' ? 'p2' : 'p1');
const forward = (team) => (team === 'p1' ? -1 : 1);

// ---------- setup ----------
const SLOTS = { p1: ['b1', 'd1', 'f1'], p2: ['g8', 'e8', 'c8'] };

export function createMatch({ p1, p2, map = 'oasis', seed = 0, creeps = true } = {}) {
  const teams = { p1: p1 || ['hasim', 'hexor', 'magumba'], p2: p2 || ['genga', 'aqna', 'plantae'] };
  const units = {};
  for (const team of TEAMS) {
    const list = teams[team];
    if (!Array.isArray(list) || list.length !== 3) throw new Error('Each team needs exactly 3 heroes.');
    if (new Set(list).size !== 3) throw new Error('A team cannot pick the same hero twice.');
    list.forEach((hero, i) => {
      if (!HEROES[hero]) throw new Error(`Unknown hero: ${hero}`);
      const pos = parseSquare(SLOTS[team][i]);
      units[`${team}-${hero}`] = makeUnit(`${team}-${hero}`, team, hero, 'hero', pos);
      if (hero === 'genga') {
        const bpos = { r: pos.r + forward(team), c: pos.c };
        units[`${team}-beast`] = { ...makeUnit(`${team}-beast`, team, 'beast', 'beast', bpos), ownerId: `${team}-${hero}` };
      }
    });
  }
  if (creeps) {
    for (const f of CREEPS.files) {
      const p = parseSquare(`${f}2`);
      units[`p1-creep-${f}`] = makeUnit(`p1-creep-${f}`, 'p1', 'creep', 'creep', p);
      const q = { r: 7 - p.r, c: 7 - p.c };
      const qf = FILES[q.c];
      units[`p2-creep-${qf}`] = makeUnit(`p2-creep-${qf}`, 'p2', 'creep', 'creep', q);
    }
  }
  const blocks = {};
  const m = MAPS[map] || MAPS.oasis;
  for (const [kind, squares] of Object.entries(m.blocks)) {
    for (const sqn of squares) {
      const p = parseSquare(sqn);
      blocks[key(p)] = { kind };
      blocks[key({ r: 7 - p.r, c: 7 - p.c })] = { kind };
    }
  }
  return {
    size: BOARD_SIZE, turn: 1, current: 'p1', status: 'playing', phase: 'main', pending: null,
    map, teams, seed,
    energy: { p1: ENERGY.start, p2: ENERGY.start },
    units, blocks, iceBy: {},
    log: [{ turn: 0, team: null, text: `Match begins on ${m.name}. Ivory moves first.` }],
    lastAction: null,
  };
}

function makeUnit(id, team, hero, kind, pos) {
  return { id, team, hero, kind, pos: { ...pos }, alive: true, rooted: 0, warded: false, cd: 0 };
}

// The log is append-only and its entries are never mutated, so it is shared, not deep-copied.
const clone = (s) => { const c = structuredClone({ ...s, log: null }); c.log = s.log.slice(); return c; };
export const livingUnits = (s, team) => Object.values(s.units).filter((u) => u.alive && (!team || u.team === team));
export const livingHeroes = (s, team) => livingUnits(s, team).filter((u) => u.kind === 'hero');
export const unitAt = (s, p) => Object.values(s.units).find((u) => u.alive && samePos(u.pos, p)) || null;
export const blockAt = (s, p) => s.blocks[key(p)] || null;
export const label = (u) => `${TEAM_NAMES[u.team]} ${heroDef(u).name}`;
export const toMove = (s) => (s.phase === 'react' ? other(s.current) : s.current);
export const beastOf = (s, u) => Object.values(s.units).find((b) => b.kind === 'beast' && b.ownerId === u.id && b.alive) || null;
export const plantaeOf = (s, team) => livingHeroes(s, team).find((u) => u.hero === 'plantae') || null;
const canBeHit = (attacker, target) => target.team !== attacker.team && !target.warded;

// ---------- movement ----------
/** All basic-move options for a unit: [{ to, kills: [ids], over?: id }]. Ignores whose turn it is. */
export function moveOptions(s, u) {
  const out = [];
  const seen = new Set();
  const push = (o) => { const k = key(o.to); if (!seen.has(k)) { seen.add(k); out.push(o); } };
  for (const rule of heroDef(u).move) {
    if (rule.kind === 'slide') {
      for (const [dr, dc] of rule.dirs) {
        for (let i = 1; i <= rule.range; i++) {
          const p = { r: u.pos.r + dr * i, c: u.pos.c + dc * i };
          if (!inBounds(p) || blockAt(s, p)) break;
          const o = unitAt(s, p);
          if (o) { if (canBeHit(u, o)) push({ to: p, kills: [o.id] }); break; }
          push({ to: p, kills: [] });
        }
      }
    } else if (rule.kind === 'leap') {
      for (const [dr, dc] of rule.deltas) {
        const p = { r: u.pos.r + dr, c: u.pos.c + dc };
        if (!inBounds(p) || blockAt(s, p)) continue;
        const o = unitAt(s, p);
        if (!o) push({ to: p, kills: [] });
        else if (canBeHit(u, o)) push({ to: p, kills: [o.id] });
      }
    } else if (rule.kind === 'creep') {
      const f = forward(u.team);
      for (const dc of [-1, 1]) {
        const p = { r: u.pos.r + f, c: u.pos.c + dc };
        const o = inBounds(p) && unitAt(s, p);
        if (o && canBeHit(u, o)) push({ to: p, kills: [o.id] });
      }
      const ahead = { r: u.pos.r + f, c: u.pos.c };
      if (inBounds(ahead) && !blockAt(s, ahead) && !unitAt(s, ahead)) push({ to: ahead, kills: [] });
      // Terrain straight ahead (pillar, tree, ruin, rock, ice): the creep may step around it,
      // diagonally forward onto an empty square. Units ahead still block, as with chess pawns.
      if (inBounds(ahead) && blockAt(s, ahead)) {
        for (const dc of [-1, 1]) {
          const p = { r: u.pos.r + f, c: u.pos.c + dc };
          if (inBounds(p) && !blockAt(s, p) && !unitAt(s, p)) push({ to: p, kills: [] });
        }
      }
    } else if (rule.kind === 'backstab') {
      // Any of the 8 directions: straight or diagonal.
      for (const [dr, dc] of KING) {
        const mid = { r: u.pos.r + dr, c: u.pos.c + dc };
        const land = { r: u.pos.r + 2 * dr, c: u.pos.c + 2 * dc };
        if (!inBounds(mid) || !inBounds(land)) continue;
        const over = unitAt(s, mid);
        if (!over && !blockAt(s, mid)) continue; // nothing to jump over
        if (blockAt(s, land)) continue;
        const o = unitAt(s, land);
        if (o && !canBeHit(u, o)) continue;
        const kills = [];
        if (over && canBeHit(u, over)) kills.push(over.id);
        if (o) kills.push(o.id);
        push({ to: land, kills, over: over ? over.id : null, backstab: true });
      }
    }
  }
  return out;
}

// ---------- skills ----------
/** Turns until a hero's active skill is ready again (0 = ready). */
export const skillCooldown = (u) => u.cd || 0;

export function skillTargets(s, u) {
  const sk = HEROES[u.hero]?.skill;
  if (!sk || sk.type !== 'active' || skillCooldown(u) > 0) return [];
  if (sk.key === 'grave') {
    return livingUnits(s, u.team).filter((a) => chebyshev(a.pos, u.pos) <= sk.range && !a.warded).map((a) => a.id);
  }
  if (sk.key === 'root') {
    return livingUnits(s, other(u.team)).filter((e) => chebyshev(e.pos, u.pos) <= sk.range && !e.warded && !e.rooted).map((e) => e.id);
  }
  return [];
}

// ---------- action listing (the single source of legality) ----------
/** Units the side to move may act with in the main phase: heroes and creeps (beasts only follow Ge'nga). */
const mainActors = (s) => livingUnits(s, s.current).filter((u) => u.kind !== 'beast');

export function listActions(s) {
  if (s.status !== 'playing') return [];
  if (s.phase === 'react') return [{ type: 'react', use: true }, { type: 'react', use: false }];
  if (s.phase === 'ice') {
    const aqna = s.units[s.pending.unitId];
    const out = [];
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
      const p = { r, c };
      if (chebyshev(p, aqna.pos) <= 3 && !unitAt(s, p) && !blockAt(s, p)) out.push({ type: 'ice', to: p });
    }
    out.push({ type: 'skip' });
    return out;
  }
  if (s.phase === 'beast') {
    const b = s.units[s.pending.unitId];
    const out = b.alive && !b.rooted ? moveOptions(s, b).map((o) => ({ type: 'move', unitId: b.id, to: o.to })) : [];
    out.push({ type: 'skip' });
    return out;
  }
  const out = [];
  for (const u of mainActors(s)) {
    if (u.rooted) continue;
    for (const o of moveOptions(s, u)) out.push({ type: 'move', unitId: u.id, to: o.to });
    if (u.kind !== 'hero') continue;
    const sk = HEROES[u.hero].skill;
    if (sk.type === 'active' && s.energy[u.team] >= sk.cost) {
      for (const t of skillTargets(s, u)) out.push({ type: 'skill', unitId: u.id, skill: sk.key, targetId: t });
    }
  }
  return out;
}

const sameAction = (a, b) => a.type === b.type && a.unitId === b.unitId && a.skill === b.skill
  && a.targetId === b.targetId && a.use === b.use && (!a.to || (b.to && samePos(a.to, b.to)));

export function validateAction(s, action) {
  if (!action || typeof action !== 'object') return { ok: false, reason: 'Unknown action.' };
  if (s.status !== 'playing') return { ok: false, reason: 'The match is over. Start a new match.' };
  if (listActions(s).some((a) => sameAction(a, action))) return { ok: true };
  return { ok: false, reason: explain(s, action) };
}

function explain(s, a) {
  if (s.phase === 'react') return 'Answer the Aggressive Root prompt first.';
  if (s.phase === 'ice') return a.type === 'ice' ? 'Ice must go on an empty square within 3 of Aqna.' : 'Place Aqna\'s ice block or skip.';
  const u = s.units[a.unitId];
  if (!u) return 'Choose one of your heroes.';
  if (!u.alive) return `${label(u)} has been eliminated.`;
  if (s.phase === 'beast') {
    if (u.kind !== 'beast') return 'The beast acts now. Move it or skip.';
  } else if (u.kind === 'beast') return 'The beast only acts right after Ge\'nga.';
  if (u.team !== s.current) return `It is ${TEAM_NAMES[s.current]}'s turn.`;
  if (u.rooted) return `${label(u)} is held by roots this turn.`;
  if (a.type === 'move') {
    if (!a.to || !inBounds(a.to)) return 'That square is off the board.';
    if (blockAt(s, a.to)) return 'Nobody can enter terrain.';
    const o = unitAt(s, a.to);
    if (o && o.team === u.team) return `${squareName(a.to)} is occupied by your own unit.`;
    if (o && o.warded) return `${label(o)} is protected by Empty Grave.`;
    return `${label(u)} can't reach ${squareName(a.to)}. ${heroDef(u).moveText}`;
  }
  if (a.type === 'skill') {
    const sk = HEROES[u.hero].skill;
    if (sk.type !== 'active') return `${sk.name} is passive; it triggers on its own.`;
    if (skillCooldown(u) > 0) return `${sk.name} is recharging: ready in ${skillCooldown(u)} turn${skillCooldown(u) > 1 ? 's' : ''}.`;
    if (s.energy[u.team] < sk.cost) return `${sk.name} needs ${sk.cost} energy; you have ${s.energy[u.team]}.`;
    const t = s.units[a.targetId];
    if (!t || !t.alive) return 'Choose a living target.';
    if (chebyshev(t.pos, u.pos) > sk.range) return `Target is out of range (${sk.range} squares).`;
    if (t.warded) return `${label(t)} is protected by Empty Grave.`;
    if (sk.key === 'grave') return 'Empty Grave only works on your own units.';
    if (t.rooted) return `${label(t)} is already rooted.`;
    return 'Aggressive Root only works on enemies.';
  }
  return 'That action is not available right now.';
}

// ---------- resolution ----------
function eliminate(s, u, lines, by = null) {
  if (!u.alive) return;
  u.alive = false; u.rooted = 0; u.warded = false;
  lines.push(`${label(u)} is eliminated on ${squareName(u.pos)}.`);
  if (u.kind === 'creep' && by && by !== u.team) {
    s.energy[by] = Math.min(ENERGY.max, s.energy[by] + CREEPS.lastHit);
    lines.push(`${TEAM_NAMES[by]} gains ${CREEPS.lastHit} energy for the kill.`);
  }
  if (u.kind === 'hero' && u.hero === 'genga') {
    const b = beastOf(s, u);
    if (b) { b.alive = false; lines.push(`${label(b)} flees the battlefield.`); }
  }
}

/** Storm Hammer: push every unit around `center` outward, chaining. Returns pushes for FX. */
function stormHammer(s, hexor, center, lines, fx) {
  const visited = new Set([hexor.id]);
  const pushUnit = (u, dr, dc) => {
    if (visited.has(u.id)) return samePos(u.pos, u.pos); // already handled
    visited.add(u.id);
    if (u.warded) { fx.push({ id: u.id, from: { ...u.pos }, to: { ...u.pos }, blocked: true }); return false; }
    const dest = { r: u.pos.r + dr, c: u.pos.c + dc };
    if ((!inBounds(dest) || blockAt(s, dest)) && u.team === hexor.team) {
      // Allies are shoved but never killed: against terrain or the edge they just hold their ground.
      fx.push({ id: u.id, from: { ...u.pos }, to: { ...u.pos }, blocked: true });
      return false;
    }
    if (!inBounds(dest) || blockAt(s, dest)) {
      fx.push({ id: u.id, from: { ...u.pos }, to: dest, stuck: true });
      lines.push(`${label(u)} is slammed into ${inBounds(dest) ? 'terrain' : 'the board edge'}.`);
      eliminate(s, u, lines, hexor.team);
      return true;
    }
    const behind = unitAt(s, dest);
    if (behind) {
      pushUnit(behind, dr, dc);
      if (unitAt(s, dest)) { fx.push({ id: u.id, from: { ...u.pos }, to: { ...u.pos }, blocked: true }); return false; }
    }
    fx.push({ id: u.id, from: { ...u.pos }, to: dest });
    u.pos = dest;
    return true;
  };
  for (const [dr, dc] of KING) {
    const p = { r: center.r + dr, c: center.c + dc };
    if (!inBounds(p)) continue;
    const u = unitAt(s, p);
    if (u && !visited.has(u.id)) pushUnit(u, dr, dc);
  }
}

function resolveMove(s, action, lines, last) {
  const u = s.units[action.unitId];
  const opt = moveOptions(s, u).find((o) => samePos(o.to, action.to));
  const from = { ...u.pos };
  const victims = opt.kills.map((id) => s.units[id]);
  const overUnit = opt.over ? s.units[opt.over] : null;
  last.kind = opt.backstab ? 'backstab' : victims.length ? 'capture' : 'move';
  last.from = from; last.to = { ...opt.to };
  if (opt.backstab) {
    lines.push(`${label(u)} backstabs over ${overUnit ? label(overUnit) : 'the terrain'} (${squareName(from)} → ${squareName(opt.to)}).`);
  } else if (victims.length) {
    lines.push(`${label(u)} strikes ${label(victims[0])} on ${squareName(opt.to)}.`);
  } else {
    lines.push(`${label(u)} moves ${squareName(from)} → ${squareName(opt.to)}.`);
  }
  for (const v of victims) { last.hits.push({ ...v.pos }); eliminate(s, v, lines, u.team); }
  u.pos = { ...opt.to };
  if (u.kind === 'creep' && u.pos.r === (u.team === 'p1' ? 0 : BOARD_SIZE - 1)) {
    u.alive = false;
    s.energy[u.team] = Math.min(ENERGY.max, s.energy[u.team] + CREEPS.breach);
    last.breach = true;
    lines.push(`${label(u)} breaks through on ${squareName(u.pos)}: +${CREEPS.breach} energy.`);
  }
  if (u.hero === 'hexor' && u.kind === 'hero' && victims.length) {
    lines.push(`${label(u)}'s Storm Hammer shakes the ground.`);
    last.storm = [];
    stormHammer(s, u, u.pos, lines, last.storm);
  }
  return { killed: victims.length };
}

function resolveSkill(s, action, lines, last) {
  const u = s.units[action.unitId];
  const sk = HEROES[u.hero].skill;
  const t = s.units[action.targetId];
  s.energy[u.team] -= sk.cost;
  if (sk.cooldown) u.cd = sk.cooldown;
  last.kind = sk.key; last.from = { ...u.pos }; last.to = null; last.hits.push({ ...t.pos }); last.targetId = t.id;
  if (sk.key === 'grave') {
    t.warded = true; t.rooted = 0;
    lines.push(t.id === u.id ? `${label(u)} wraps himself in Empty Grave.` : `${label(u)} casts Empty Grave on ${label(t)}.`);
  } else if (sk.key === 'root') {
    t.rooted = 1;
    lines.push(`${label(u)} roots ${label(t)}: it can't act next turn.`);
  }
}

function newLast(s, action) {
  return { team: toMove(s), unitId: action.unitId || null, from: null, to: null, hits: [], kind: action.type, phase: s.phase };
}

/**
 * Apply an action. `trusted` skips validation and is only for callers that took the
 * action straight from listActions(state) (the bot); everything else is validated.
 */
export function applyAction(state, action, { trusted = false } = {}) {
  if (!trusted) {
    const v = validateAction(state, action);
    if (!v.ok) return { ok: false, reason: v.reason, state };
  }
  const s = clone(state);
  const lines = [];
  let last = newLast(s, action);
  let actingTeam = toMove(s);

  if (s.phase === 'react') {
    const pend = s.pending.action;
    const actor = s.units[pend.unitId];
    const plant = plantaeOf(s, other(s.current));
    s.phase = s.pending.resume; s.pending = s.pending.resumePending;
    if (action.use) {
      const sk = HEROES.plantae.skill;
      s.energy[plant.team] -= sk.reactionCost ?? sk.cost;
      plant.cd = sk.cooldown || 0;
      plant.reacts = (plant.reacts || 0) + 1;
      last = { team: plant.team, unitId: plant.id, from: { ...plant.pos }, to: null, hits: [{ ...actor.pos }], kind: 'interrupt', targetId: actor.id, phase: 'react' };
      lines.push(`${label(plant)} interrupts with Aggressive Root! ${label(actor)}'s action is negated.`);
      pushLog(s, lines, plant.team);
      s.lastAction = last;
      endTurn(s);
      return { ok: true, state: s, reason: null };
    }
    lines.push(`${label(plant)} lets it happen.`);
    pushLog(s, lines, plant.team);
    lines.length = 0;
    return finishUnitAction(s, pend, newLast(s, pend), lines);
  }

  if (s.phase === 'ice') {
    const aqna = s.units[s.pending.unitId];
    s.phase = 'main'; s.pending = null;
    if (action.type === 'ice') {
      const mine = s.iceBy[aqna.id] || (s.iceBy[aqna.id] = []);
      let moved = null;
      if (mine.length >= ICE_LIMIT) { moved = mine.shift(); delete s.blocks[moved]; }
      s.blocks[key(action.to)] = { kind: 'ice', owner: aqna.id };
      mine.push(key(action.to));
      last = { team: aqna.team, unitId: aqna.id, from: { ...aqna.pos }, to: { ...action.to }, hits: [], kind: 'ice', phase: 'ice', movedIce: moved };
      lines.push(moved ? `${label(aqna)} moves an ice block to ${squareName(action.to)}.` : `${label(aqna)} raises an ice block on ${squareName(action.to)}.`);
    } else {
      last = { ...state.lastAction, kind: 'skip-ice', phase: 'ice' };
    }
    pushLog(s, lines, actingTeam);
    s.lastAction = last;
    endTurn(s);
    return { ok: true, state: s, reason: null };
  }

  if (action.type === 'skip') { // beast phase skip
    s.phase = 'main'; s.pending = null;
    s.lastAction = { ...state.lastAction, kind: 'skip-beast' };
    endTurn(s);
    return { ok: true, state: s, reason: null };
  }

  // A unit action (main phase or beast phase): can the opponent's Plantae react?
  if (canReact(s, action)) {
    const plant = plantaeOf(s, other(s.current));
    s.pending = { type: 'react', action, resume: s.phase, resumePending: s.pending, plantId: plant.id };
    s.phase = 'react';
    return { ok: true, state: s, reason: null };
  }
  return finishUnitAction(s, action, last, lines);
}

function finishUnitAction(s, action, last, lines) {
  const actor = s.units[action.unitId];
  const wasBeast = s.phase === 'beast';
  let killed = 0;
  if (action.type === 'move') killed = resolveMove(s, action, lines, last).killed;
  else resolveSkill(s, action, lines, last);
  pushLog(s, lines, actor.team);
  s.lastAction = last;
  checkWinner(s);
  if (s.status !== 'playing') return { ok: true, state: s, reason: null };

  s.phase = 'main'; s.pending = null;
  if (!wasBeast && actor.alive && actor.hero === 'aqna' && killed > 0 && hasIceSpot(s, actor)) {
    s.phase = 'ice'; s.pending = { type: 'ice', unitId: actor.id };
    return { ok: true, state: s, reason: null };
  }
  if (!wasBeast && actor.alive && actor.hero === 'genga' && actor.kind === 'hero') {
    const b = beastOf(s, actor);
    if (b && !b.rooted) {
      s.phase = 'beast'; s.pending = { type: 'beast', unitId: b.id };
      return { ok: true, state: s, reason: null };
    }
  }
  endTurn(s);
  return { ok: true, state: s, reason: null };
}

function hasIceSpot(s, aqna) {
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
    const p = { r, c };
    if (chebyshev(p, aqna.pos) <= 3 && !unitAt(s, p) && !blockAt(s, p)) return true;
  }
  return false;
}

function canReact(s, action) {
  const actor = s.units[action.unitId];
  if (!actor) return false;
  const team = other(actor.team);
  const plant = plantaeOf(s, team);
  const sk = HEROES.plantae.skill;
  if (!plant || plant.rooted || skillCooldown(plant) > 0) return false;
  if (sk.maxReactions != null && (plant.reacts || 0) >= sk.maxReactions) return false;
  if (s.energy[team] < (sk.reactionCost ?? sk.cost)) return false;
  if (actor.warded) return false;
  return chebyshev(plant.pos, actor.pos) <= HEROES.plantae.skill.range;
}

function pushLog(s, lines, team) {
  for (const text of lines) s.log.push({ turn: s.turn, team, text });
}

function checkWinner(s) {
  for (const team of TEAMS) {
    if (livingHeroes(s, team).length === 0) {
      s.status = other(team);
      s.phase = 'main'; s.pending = null;
      s.log.push({ turn: s.turn, team: s.status, text: `${TEAM_NAMES[s.status]} wins — every enemy hero is down.` });
      return;
    }
  }
}

function endTurn(s) {
  for (let guard = 0; guard < 4; guard++) {
    for (const u of livingUnits(s, s.current)) if (u.rooted > 0) u.rooted -= 1;
    s.current = other(s.current);
    s.turn += 1;
    s.phase = 'main'; s.pending = null;
    s.energy[s.current] = Math.min(ENERGY.max, s.energy[s.current] + ENERGY.perTurn);
    for (const u of livingUnits(s, s.current)) {
      u.warded = false; // Empty Grave lasts until the caster's next turn
      if (u.cd > 0) u.cd -= 1; // skill cooldowns tick at the start of the owner's turn
    }
    if (hasAnyAction(s)) return;
    s.log.push({ turn: s.turn, team: s.current, text: `${TEAM_NAMES[s.current]} has no legal action and passes.` });
  }
}

function hasAnyAction(s) {
  for (const u of mainActors(s)) {
    if (u.rooted) continue;
    if (moveOptions(s, u).length) return true;
    if (u.kind !== 'hero') continue;
    const sk = HEROES[u.hero].skill;
    if (sk.type === 'active' && s.energy[u.team] >= sk.cost && skillTargets(s, u).length) return true;
  }
  return false;
}

/** Enemy units that `team`'s opponent could eliminate with one basic move next turn (board as is). */
export function getThreats(s, team) {
  const out = new Set();
  const opp = other(team);
  for (const e of livingUnits(s, opp)) {
    if (e.rooted) continue;
    for (const o of moveOptions(s, e)) for (const id of o.kills) out.add(id);
  }
  return out;
}
