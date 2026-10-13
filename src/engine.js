// Hero Tactics — deterministic rules engine.
// Pure functions over a single game state object. No DOM, no randomness.
// Every public mutator returns a NEW state; the input is never modified.

export const BOARD_SIZE = 8;
export const TEAMS = ['p1', 'p2'];
export const TEAM_NAMES = { p1: 'Ivory', p2: 'Ember' };

// Tunable rules. Change before createInitialState().
//   capture:     moving onto an enemy's square eliminates it (like chess).
//   skillMode:   'once' = each hero's abilities are single-use per match;
//                'team' = each player shares `teamCharges` ability uses per match.
export const RULES = { capture: true, skillMode: 'once', teamCharges: 3 };

export const HEROES = {
  knight: {
    role: 'Assassin',
    movement: 'Knight: L-shaped jump, ignores blockers.',
    abilities: [
      {
        key: 'blink', name: 'Blink Strike', lethal: true,
        text: 'Leap a knight-move to an empty square touching an enemy (including diagonally) and eliminate that enemy.',
      },
      {
        key: 'swap', name: 'Shadow Swap', lethal: false,
        text: 'Trade places with an ally up to 3 squares away (any direction).',
      },
    ],
  },
  bishop: {
    role: 'Mage',
    movement: 'Bishop: any distance diagonally, blocked by units.',
    abilities: [
      {
        key: 'bolt', name: 'Arcane Bolt', lethal: true,
        text: 'Eliminate the first unit along a diagonal, at any range. Fails if that first unit is an ally.',
      },
      {
        key: 'ice', name: 'Ice Prison', lethal: false,
        text: 'Freeze an enemy up to 3 squares away: it cannot move or use abilities on its next turn.',
      },
    ],
  },
  rook: {
    role: 'Guardian',
    movement: 'Rook: any distance straight, blocked by units.',
    abilities: [
      {
        key: 'shield', name: 'Shield', lethal: false,
        text: 'Ward another ally up to 2 squares away. Blocks the next elimination, then breaks.',
      },
      {
        key: 'knock', name: 'Knockback', lethal: true,
        text: 'Push an adjacent enemy 1 square directly away. Off the board = eliminated. Fails if the square is occupied.',
      },
    ],
  },
};

const ABILITY_INDEX = {};
for (const [type, h] of Object.entries(HEROES)) {
  for (const a of h.abilities) ABILITY_INDEX[a.key] = { ...a, heroType: type };
}
export const getAbilityDef = (key) => ABILITY_INDEX[key];

const SWAP_RANGE = 3;
const ICE_RANGE = 3;
const SHIELD_RANGE = 2;

// ---------- geometry ----------
const FILES = 'abcdefgh';
export const inBounds = (p) => p.r >= 0 && p.r < BOARD_SIZE && p.c >= 0 && p.c < BOARD_SIZE;
export const samePos = (a, b) => a.r === b.r && a.c === b.c;
export const chebyshev = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
// Row 0 is the top of the board (rank 8). Ivory starts on rank 1 (row 7).
export const squareName = (p) => `${FILES[p.c]}${BOARD_SIZE - p.r}`;

const KNIGHT_DELTAS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const DIAG_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ALL_DIRS = [...DIAG_DIRS, ...ORTHO_DIRS];

// ---------- state ----------
function makeUnit(id, team, type, r, c) {
  return {
    id, team, type,
    pos: { r, c },
    alive: true,
    used: Object.fromEntries(HEROES[type].abilities.map((a) => [a.key, false])),
    status: { shield: false, frozen: 0 },
  };
}

export function createInitialState() {
  const units = {};
  const add = (u) => { units[u.id] = u; };
  // Point-symmetric setup (180° rotation), so both Mages stand on the same square colour.
  add(makeUnit('p1-knight', 'p1', 'knight', 7, 1)); // b1
  add(makeUnit('p1-rook', 'p1', 'rook', 7, 3));     // d1
  add(makeUnit('p1-bishop', 'p1', 'bishop', 7, 5)); // f1
  add(makeUnit('p2-knight', 'p2', 'knight', 0, 6)); // g8
  add(makeUnit('p2-rook', 'p2', 'rook', 0, 4));     // e8
  add(makeUnit('p2-bishop', 'p2', 'bishop', 0, 2)); // c8
  return {
    size: BOARD_SIZE,
    turn: 1,
    current: 'p1',
    status: 'playing', // 'playing' | 'p1' | 'p2' (winner)
    rules: { ...RULES },
    charges: { p1: RULES.teamCharges, p2: RULES.teamCharges },
    units,
    log: [{ turn: 0, team: null, text: 'Match begins. Ivory moves first.' }],
    lastAction: null,
  };
}

const clone = (s) => structuredClone(s);
export const getUnit = (state, id) => state.units[id];
export const livingUnits = (state, team) =>
  Object.values(state.units).filter((u) => u.alive && (!team || u.team === team));
export const unitAt = (state, pos) =>
  Object.values(state.units).find((u) => u.alive && samePos(u.pos, pos)) || null;
const other = (team) => (team === 'p1' ? 'p2' : 'p1');
const label = (u) => `${TEAM_NAMES[u.team]} ${HEROES[u.type].role}`;

// ---------- movement ----------
function slide(state, unit, dirs) {
  const out = [];
  for (const [dr, dc] of dirs) {
    let p = { r: unit.pos.r + dr, c: unit.pos.c + dc };
    while (inBounds(p)) {
      const hit = unitAt(state, p);
      if (hit) { if (canCapture(state, unit, hit)) out.push(p); break; }
      out.push(p);
      p = { r: p.r + dr, c: p.c + dc };
    }
  }
  return out;
}
const canCapture = (state, unit, other) => !!state.rules?.capture && other.team !== unit.team;

const knightSquares = (from) =>
  KNIGHT_DELTAS.map(([dr, dc]) => ({ r: from.r + dr, c: from.c + dc })).filter(inBounds);

/** Squares a unit could reach by basic movement (including captures), ignoring turn/frozen checks. */
export function movePattern(state, unit) {
  if (unit.type === 'knight') {
    return knightSquares(unit.pos).filter((p) => { const o = unitAt(state, p); return !o || canCapture(state, unit, o); });
  }
  if (unit.type === 'bishop') return slide(state, unit, DIAG_DIRS);
  if (unit.type === 'rook') return slide(state, unit, ORTHO_DIRS);
  return [];
}

/** Whether `unit` still has `key` available under the match's skill rules. */
export function abilityAvailable(state, unit, key) {
  if (state.rules?.skillMode === 'team') return state.charges[unit.team] > 0;
  return !unit.used[key];
}
function spendAbility(state, unit, key) {
  unit.used[key] = true;
  if (state.rules?.skillMode === 'team') state.charges[unit.team] -= 1;
}

// ---------- actor checks ----------
function actorError(state, unitId) {
  if (state.status !== 'playing') return 'The match is over. Start a new match.';
  const u = state.units[unitId];
  if (!u) return 'That unit does not exist.';
  if (!u.alive) return `${label(u)} has been eliminated and cannot act.`;
  if (u.team !== state.current) return `It is ${TEAM_NAMES[state.current]}'s turn.`;
  if (u.status.frozen > 0) return `${label(u)} is frozen this turn.`;
  return null;
}

export function getLegalMoves(state, unitId) {
  if (actorError(state, unitId)) return [];
  return movePattern(state, state.units[unitId]);
}

// ---------- abilities: target enumeration ----------
// Each target is a partial action: { targetId, dest? }.
function abilityTargetsRaw(state, u, key) {
  const enemies = livingUnits(state, other(u.team));
  const allies = livingUnits(state, u.team);
  switch (key) {
    case 'blink': {
      const out = [];
      const landings = knightSquares(u.pos).filter((p) => !unitAt(state, p));
      for (const e of enemies) {
        for (const d of landings) if (chebyshev(d, e.pos) === 1) out.push({ targetId: e.id, dest: d });
      }
      return out;
    }
    case 'swap':
      return allies
        .filter((a) => a.id !== u.id && chebyshev(a.pos, u.pos) <= SWAP_RANGE)
        .map((a) => ({ targetId: a.id }));
    case 'bolt': {
      const out = [];
      for (const [dr, dc] of DIAG_DIRS) {
        let p = { r: u.pos.r + dr, c: u.pos.c + dc };
        while (inBounds(p)) {
          const hit = unitAt(state, p);
          if (hit) { if (hit.team !== u.team) out.push({ targetId: hit.id }); break; }
          p = { r: p.r + dr, c: p.c + dc };
        }
      }
      return out;
    }
    case 'ice':
      return enemies
        .filter((e) => chebyshev(e.pos, u.pos) <= ICE_RANGE && e.status.frozen === 0)
        .map((e) => ({ targetId: e.id }));
    case 'shield':
      return allies
        .filter((a) => a.id !== u.id && chebyshev(a.pos, u.pos) <= SHIELD_RANGE && !a.status.shield)
        .map((a) => ({ targetId: a.id }));
    case 'knock':
      return enemies
        .filter((e) => chebyshev(e.pos, u.pos) === 1)
        .filter((e) => {
          const d = { r: 2 * e.pos.r - u.pos.r, c: 2 * e.pos.c - u.pos.c };
          return !inBounds(d) || !unitAt(state, d);
        })
        .map((e) => ({ targetId: e.id }));
    default:
      return [];
  }
}

export function getAbilityTargets(state, unitId, key) {
  if (actorError(state, unitId)) return [];
  const u = state.units[unitId];
  if (!HEROES[u.type].abilities.some((a) => a.key === key)) return [];
  if (!abilityAvailable(state, u, key)) return [];
  return abilityTargetsRaw(state, u, key);
}

// ---------- validation ----------
export function validateAction(state, action) {
  const err = actorError(state, action?.unitId);
  if (err) return { ok: false, reason: err };
  const u = state.units[action.unitId];

  if (action.type === 'move') {
    const to = action.to;
    if (!to || !inBounds(to)) return { ok: false, reason: 'That square is off the board.' };
    if (samePos(to, u.pos)) return { ok: false, reason: 'The unit is already on that square.' };
    const occ = unitAt(state, to);
    if (occ && occ.team === u.team) return { ok: false, reason: `${squareName(to)} is occupied by your own hero.` };
    if (occ && !state.rules?.capture) return { ok: false, reason: `${squareName(to)} is occupied. Moving never captures; use an ability to eliminate.` };
    if (movePattern(state, u).some((p) => samePos(p, to))) return { ok: true };
    const pattern = u.type === 'knight' ? 'an L-shaped knight jump'
      : u.type === 'bishop' ? 'a clear diagonal line' : 'a clear straight line';
    return { ok: false, reason: `${label(u)} can only move along ${pattern}; ${squareName(to)} is not reachable.` };
  }

  if (action.type === 'ability') {
    const def = ABILITY_INDEX[action.ability];
    if (!def || def.heroType !== u.type) return { ok: false, reason: `${label(u)} does not have that ability.` };
    if (!abilityAvailable(state, u, def.key)) {
      return { ok: false, reason: state.rules?.skillMode === 'team'
        ? `${TEAM_NAMES[u.team]} has no ability uses left this match.`
        : `${def.name} has already been used this match.` };
    }
    const target = state.units[action.targetId];
    if (!target) return { ok: false, reason: 'Choose a target.' };
    if (!target.alive) return { ok: false, reason: 'Eliminated units cannot be targeted.' };
    const targets = abilityTargetsRaw(state, u, def.key);
    const match = targets.some((t) => t.targetId === target.id && (!t.dest || (action.dest && samePos(t.dest, action.dest))));
    if (match) return { ok: true };
    return { ok: false, reason: explainAbilityFailure(state, u, def, target, action.dest) };
  }
  return { ok: false, reason: 'Unknown action.' };
}

function explainAbilityFailure(state, u, def, target, dest) {
  const ally = target.team === u.team;
  const d = chebyshev(u.pos, target.pos);
  switch (def.key) {
    case 'blink':
      if (ally) return 'Blink Strike must target an enemy.';
      if (!dest) return `No empty knight-move square next to ${label(target)}.`;
      if (unitAt(state, dest)) return `Landing square ${squareName(dest)} is occupied.`;
      if (chebyshev(dest, target.pos) !== 1) return `${squareName(dest)} is not next to ${label(target)}.`;
      return `${squareName(dest)} is not a knight-move away from the Assassin.`;
    case 'swap':
      if (!ally) return 'Shadow Swap only works on allies.';
      if (target.id === u.id) return 'The Assassin cannot swap with itself.';
      return `Ally is ${d} squares away; Shadow Swap reaches ${SWAP_RANGE}.`;
    case 'bolt':
      if (ally) return 'Arcane Bolt cannot target allies.';
      if (Math.abs(u.pos.r - target.pos.r) !== Math.abs(u.pos.c - target.pos.c)) return `${label(target)} is not on a diagonal from the Mage.`;
      return `Line of sight is blocked: another unit stands between the Mage and ${label(target)}.`;
    case 'ice':
      if (ally) return 'Ice Prison only works on enemies.';
      if (target.status.frozen > 0) return `${label(target)} is already frozen.`;
      return `Target is ${d} squares away; Ice Prison reaches ${ICE_RANGE}.`;
    case 'shield':
      if (!ally) return 'Shield only works on allies.';
      if (target.id === u.id) return 'The Guardian cannot shield itself.';
      if (target.status.shield) return `${label(target)} is already shielded.`;
      return `Ally is ${d} squares away; Shield reaches ${SHIELD_RANGE}.`;
    case 'knock': {
      if (ally) return 'Knockback only works on enemies.';
      if (d !== 1) return 'Knockback needs an enemy on an adjacent square.';
      const to = { r: 2 * target.pos.r - u.pos.r, c: 2 * target.pos.c - u.pos.c };
      return `Knockback fails: ${squareName(to)} is occupied.`;
    }
    default:
      return 'That ability cannot be used there.';
  }
}

// ---------- resolution ----------
/** Attempt to eliminate `target`. Returns true if eliminated, false if a shield absorbed it. */
function tryEliminate(s, target, log) {
  if (target.status.shield) {
    target.status.shield = false;
    log.push(`${label(target)}'s shield absorbs the attack and breaks.`);
    return false;
  }
  target.alive = false;
  target.status = { shield: false, frozen: 0 };
  log.push(`${label(target)} is eliminated on ${squareName(target.pos)}.`);
  return true;
}

export function applyAction(state, action) {
  const v = validateAction(state, action);
  if (!v.ok) return { ok: false, reason: v.reason, state };

  const s = clone(state);
  const u = s.units[action.unitId];
  const lines = [];
  const last = { team: u.team, unitId: u.id, from: { ...u.pos }, to: null, hits: [], kind: action.type, ability: action.ability || null };

  if (action.type === 'move') {
    const victim = unitAt(s, action.to);
    if (victim) {
      last.hits.push({ ...victim.pos });
      lines.push(`${label(u)} attacks ${label(victim)} on ${squareName(victim.pos)}.`);
      if (tryEliminate(s, victim, lines)) {
        u.pos = { ...action.to };
        last.to = { ...u.pos };
      } else {
        lines.push(`${label(u)} is repelled and stays on ${squareName(u.pos)}.`);
      }
    } else {
      u.pos = { ...action.to };
      last.to = { ...u.pos };
      lines.push(`${label(u)} moves ${squareName(last.from)} → ${squareName(u.pos)}.`);
    }
  } else {
    const def = ABILITY_INDEX[action.ability];
    const t = s.units[action.targetId];
    spendAbility(s, u, def.key);
    last.hits.push({ ...t.pos });
    switch (def.key) {
      case 'blink':
        u.pos = { ...action.dest };
        last.to = { ...u.pos };
        lines.push(`${label(u)} blinks to ${squareName(u.pos)} and strikes ${label(t)}.`);
        tryEliminate(s, t, lines);
        break;
      case 'swap': {
        const a = { ...u.pos };
        u.pos = { ...t.pos };
        t.pos = a;
        last.to = { ...u.pos };
        lines.push(`${label(u)} swaps places with ${label(t)} (${squareName(u.pos)} ↔ ${squareName(t.pos)}).`);
        break;
      }
      case 'bolt':
        lines.push(`${label(u)} fires Arcane Bolt at ${label(t)}.`);
        tryEliminate(s, t, lines);
        break;
      case 'ice':
        t.status.frozen = 1;
        lines.push(`${label(u)} casts Ice Prison: ${label(t)} is frozen for its next turn.`);
        break;
      case 'shield':
        t.status.shield = true;
        lines.push(t.id === u.id ? `${label(u)} raises a shield on itself.` : `${label(u)} shields ${label(t)}.`);
        break;
      case 'knock': {
        const to = { r: 2 * t.pos.r - u.pos.r, c: 2 * t.pos.c - u.pos.c };
        if (inBounds(to)) {
          lines.push(`${label(u)} knocks ${label(t)} back ${squareName(t.pos)} → ${squareName(to)}.`);
          t.pos = to;
          last.hits.push({ ...to });
        } else {
          lines.push(`${label(u)} knocks ${label(t)} toward the edge of the board.`);
          tryEliminate(s, t, lines); // if shielded, it stays in place
        }
        break;
      }
    }
  }

  s.lastAction = last;
  for (const text of lines) s.log.push({ turn: s.turn, team: u.team, text });

  checkWinner(s);
  if (s.status === 'playing') endTurn(s);
  return { ok: true, state: s, reason: null };
}

function checkWinner(s) {
  for (const team of TEAMS) {
    if (livingUnits(s, team).length === 0) {
      s.status = other(team);
      s.log.push({ turn: s.turn, team: s.status, text: `${TEAM_NAMES[s.status]} wins — every enemy hero is eliminated.` });
      return;
    }
  }
}

/** Ends the current team's turn and starts the next one (skipping teams with no legal action). */
function endTurn(s) {
  for (let guard = 0; guard < 8; guard++) {
    // Frozen lasts through exactly one of the owner's turns.
    for (const u of livingUnits(s, s.current)) if (u.status.frozen > 0) u.status.frozen -= 1;
    s.current = other(s.current);
    s.turn += 1;
    if (hasAnyLegalAction(s, s.current)) return;
    s.log.push({ turn: s.turn, team: s.current, text: `${TEAM_NAMES[s.current]} has no legal action and passes.` });
  }
}

export function hasAnyLegalAction(state, team) {
  if (state.status !== 'playing' || team !== state.current) return false;
  return livingUnits(state, team).some((u) =>
    getLegalMoves(state, u.id).length > 0 ||
    HEROES[u.type].abilities.some((a) => getAbilityTargets(state, u.id, a.key).length > 0));
}

/**
 * Enemy threats against `team`: which of its units the opponent could eliminate
 * on the opponent's next turn if the board stayed as it is now.
 */
export function getThreats(state, team) {
  const opp = other(team);
  const out = [];
  for (const e of livingUnits(state, opp)) {
    if (e.status.frozen > 0) continue; // frozen through its next turn
    for (const p of movePattern(state, e)) {
      const victim = unitAt(state, p);
      if (victim) out.push({ by: e.id, ability: 'capture', targetId: victim.id });
    }
    for (const a of HEROES[e.type].abilities) {
      if (!a.lethal || !abilityAvailable(state, e, a.key)) continue;
      const seen = new Set();
      for (const t of abilityTargetsRaw(state, e, a.key)) {
        if (seen.has(t.targetId)) continue;
        seen.add(t.targetId);
        const victim = state.units[t.targetId];
        if (a.key === 'knock') {
          const to = { r: 2 * victim.pos.r - e.pos.r, c: 2 * victim.pos.c - e.pos.c };
          if (inBounds(to)) continue; // a push, not a kill
        }
        out.push({ by: e.id, ability: a.key, targetId: t.targetId });
      }
    }
  }
  return out;
}
