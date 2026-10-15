// Authoritative WebSocket relay for self-hosted online play.
//
// Unlike the Claude-artifact "room" capability (src/ui/online/room.ts), which is a
// peer-trust presence channel — each side just publishes its own move indexes and both
// screens replay them — this server is the single source of truth. Clients send what
// they want to do; the server runs the exact same rules engine (src/arena.js) to check
// it is legal before applying it or telling the other player. A modified client can at
// worst refuse to move; it can never make an illegal move happen, claim extra tokens, or
// act out of turn, because none of that is decided by any client.
//
// Everything lives in memory (one small object per room) — there's no database, because
// a match only needs to survive as long as both players care about it. Idle rooms are
// swept after ROOM_TTL_MS.
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  applyAction, validateAction, toMove, HEROES, TEAM_SIZE,
} from '../src/arena.js';
import { newRoomCode, cleanCode, matchFromConfig } from '../src/online.js';
import { createClock, setRunning, remaining, snapshot, minutesToMs } from '../src/clock.js';

const PORT = Number(process.env.PORT || 8787);
const ROOM_TTL_MS = 5 * 60 * 1000; // a room with nobody connected is dropped after this
const MAX_ROOMS = 2000; // a sane ceiling for a hobby server; refuses new rooms past this

// One "minute" of match time. Tests shrink it so a clock can run out in milliseconds.
const UNIT_MS = Number(process.env.CLOCK_UNIT_MS) || 60000;
const toMs = (minutes) => (minutesToMs(minutes) / 60000) * UNIT_MS;

const rooms = new Map(); // code -> Room

const other = (t) => (t === 'p1' ? 'p2' : 'p1');
const token = () => randomBytes(12).toString('base64url');
const validPicks = (p) => Array.isArray(p) && p.length === TEAM_SIZE && p.every((h) => typeof h === 'string' && HEROES[h]);

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function newSeat() {
  return { ws: null, token: token(), connected: false, picks: [], ready: false };
}

function newRoom(code) {
  return {
    code, seats: { p1: newSeat(), p2: newSeat() },
    map: 'oasis', creeps: true, clockMs: 0, clock: null, clockTimer: null, match: 0, started: 0, game: null, cleanupAt: null,
  };
}

function lobbyMsg(room, side) {
  const me = room.seats[side], opp = room.seats[other(side)];
  return {
    t: 'lobby', side, map: room.map, creeps: room.creeps, clockMs: room.clockMs, match: room.match, started: room.started,
    you: { picks: me.picks, ready: me.ready },
    opp: opp.connected ? { picks: opp.picks, ready: opp.ready } : null,
  };
}

function broadcastLobby(room) {
  for (const side of ['p1', 'p2']) if (room.seats[side].connected) send(room.seats[side].ws, lobbyMsg(room, side));
}

function broadcastOpponent(room, side, connected) {
  const opp = room.seats[other(side)];
  if (opp.connected) send(opp.ws, { t: 'opponent', connected });
}

// ---------- match clock (server-authoritative; see src/clock.js) ----------
const clockSnap = (room) => (room.clock ? snapshot(room.clock, Date.now()) : null);

/** Whose clock runs now: whoever decides, unless their opponent is away (then it waits). */
function runClock(room) {
  if (!room.clock) return;
  const g = room.game;
  const t = g && g.status === 'playing' ? toMove(g) : null;
  const away = t && !room.seats[other(t)].connected;
  room.clock = setRunning(room.clock, t && !away ? t : null, Date.now());
  if (room.clockTimer) { clearTimeout(room.clockTimer); room.clockTimer = null; }
  const who = room.clock.running;
  if (who) room.clockTimer = setTimeout(() => timeOut(room), remaining(room.clock, who, Date.now()));
}

function timeOut(room) {
  room.clockTimer = null;
  const team = room.clock && room.clock.running;
  if (!team || !room.game || room.game.status !== 'playing') return;
  const action = { type: 'timeout', team };
  room.game = applyAction(room.game, action, { trusted: true }).state;
  room.clock = setRunning(room.clock, null, Date.now());
  for (const side of ['p1', 'p2']) if (room.seats[side].connected) send(room.seats[side].ws, { t: 'move', action, clock: clockSnap(room) });
  afterMatchEnds(room);
}

/** Both sides ready, with a pending round and full picks: start (or restart) the match. */
function maybeStart(room) {
  const p1 = room.seats.p1, p2 = room.seats.p2;
  if (!p1.ready || !p2.ready || room.match <= room.started) return;
  if (!validPicks(p1.picks) || !validPicks(p2.picks)) return;
  let game;
  try { game = matchFromConfig({ p1: p1.picks, p2: p2.picks, map: room.map, creeps: room.creeps, clockMs: room.clockMs }); } catch { return; }
  room.game = game;
  room.started = room.match;
  p1.ready = false; p2.ready = false;
  room.clock = room.clockMs > 0 ? createClock(room.clockMs) : null;
  runClock(room);
  for (const side of ['p1', 'p2']) {
    const seat = room.seats[side];
    if (seat.connected) send(seat.ws, { t: 'start', game, fresh: true, match: room.match, clock: clockSnap(room) });
  }
}

/** After a match ends, seats re-ready for the next one; this just re-announces lobby state. */
function afterMatchEnds(room) { broadcastLobby(room); }

function scheduleCleanup(room) {
  if (room.cleanupAt) clearTimeout(room.cleanupAt);
  room.cleanupAt = setTimeout(() => {
    if (!room.seats.p1.connected && !room.seats.p2.connected) { if (room.clockTimer) clearTimeout(room.clockTimer); rooms.delete(room.code); }
  }, ROOM_TTL_MS);
}

function handleHello(ws, msg) {
  let room, side;
  if (!msg.code) {
    // create
    if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', message: 'Server is full right now. Try again shortly.' });
    let code = newRoomCode();
    while (rooms.has(code)) code = newRoomCode();
    room = newRoom(code);
    rooms.set(code, room);
    side = 'p1';
  } else {
    const code = cleanCode(msg.code);
    room = code ? rooms.get(code) : null;
    if (!room) return send(ws, { t: 'notfound' });
    if (msg.side && msg.token) {
      // reconnect to a held seat
      const seat = room.seats[msg.side];
      if (!seat || seat.token !== msg.token) return send(ws, { t: 'notfound' });
      side = msg.side;
    } else {
      // fresh join: take whichever seat is open
      side = !room.seats.p1.connected && !room.seats.p1.ws ? 'p1' : null;
      if (!side) side = !room.seats.p2.connected ? 'p2' : null;
      if (!side) return send(ws, { t: 'full' });
    }
  }
  const seat = room.seats[side];
  if (seat.ws && seat.ws !== ws) { const old = seat.ws; seat.ws = null; try { old.close(); } catch { /* gone */ } } // a half-dead socket from a dropped connection
  seat.ws = ws; seat.connected = true;
  ws.room = room.code; ws.side = side;
  if (room.cleanupAt) { clearTimeout(room.cleanupAt); room.cleanupAt = null; }
  send(ws, { t: 'joined', code: room.code, side, token: seat.token });
  if (room.game && room.game.status === 'playing') {
    // mid-match: the other side only needs a presence pulse, not a lobby refresh.
    broadcastOpponent(room, side, true);
    runClock(room); // the opponent's clock was waiting for this player
    const other_ = room.seats[other(side)];
    if (other_.connected) send(other_.ws, { t: 'clock', clock: clockSnap(room) });
    send(ws, { t: 'sync', game: room.game, match: room.match, clock: clockSnap(room) });
  } else {
    // pre-match: both sides' picks/ready view may be stale now — refresh both.
    broadcastLobby(room);
  }
}

function handlePicks(room, side, msg) {
  if (!validPicks(msg.picks) && !(Array.isArray(msg.picks) && msg.picks.every((h) => typeof h === 'string'))) return;
  room.seats[side].picks = msg.picks.filter((h) => HEROES[h]).slice(0, TEAM_SIZE);
  room.seats[side].ready = false;
  broadcastLobby(room);
}

function handleMap(room, side, msg) {
  if (side !== 'p1' || typeof msg.map !== 'string') return;
  room.map = msg.map; room.creeps = msg.creeps !== false;
  broadcastLobby(room);
}

function handleClock(room, side, msg) {
  if (side !== 'p1' || room.game?.status === 'playing') return;
  room.clockMs = toMs(msg.minutes);
  broadcastLobby(room);
}

function handleReady(room, side, msg) {
  const ready = !!msg.ready;
  room.seats[side].ready = ready;
  // whoever readies up first opens the next round; the other side just joins it.
  if (ready && room.match <= room.started) room.match += 1;
  broadcastLobby(room);
  maybeStart(room);
}

function handleAction(room, side, msg) {
  if (!room.game || room.game.status !== 'playing') return send(room.seats[side].ws, { t: 'error', message: 'No match in progress.' });
  if (toMove(room.game) !== side) return send(room.seats[side].ws, { t: 'error', message: 'Not your turn.' });
  const res = applyAction(room.game, msg.action);
  if (!res.ok) {
    // either a stale client or a tampered one — never trust it, never relay it.
    const check = validateAction(room.game, msg.action);
    return send(room.seats[side].ws, { t: 'error', message: check.reason || 'That move is not legal.' });
  }
  room.game = res.state;
  runClock(room);
  const opp = room.seats[other(side)];
  if (opp.connected) send(opp.ws, { t: 'move', action: msg.action, clock: clockSnap(room) });
  if (room.game.status !== 'playing') afterMatchEnds(room);
}

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch { /* closing */ }
  }
}, 25000).unref();

const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('runeverra ws relay'); });
const wss = new WebSocketServer({ server });

// Proxies and phones drop idle sockets silently. Ping every 25s (browsers answer on their own);
// a socket that missed the last ping is dead, so terminate it and let the player reconnect.
wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'hello') return handleHello(ws, msg);
    const room = ws.room ? rooms.get(ws.room) : null;
    if (!room || !ws.side) return;
    if (msg.t === 'picks') return handlePicks(room, ws.side, msg);
    if (msg.t === 'map') return handleMap(room, ws.side, msg);
    if (msg.t === 'clock') return handleClock(room, ws.side, msg);
    if (msg.t === 'ready') return handleReady(room, ws.side, msg);
    if (msg.t === 'action') return handleAction(room, ws.side, msg);
  });
  ws.on('close', () => {
    const room = ws.room ? rooms.get(ws.room) : null;
    if (!room || !ws.side) return;
    const seat = room.seats[ws.side];
    if (seat.ws !== ws) return; // an old socket closing after the player already came back: nothing changed
    seat.connected = false; seat.ws = null;
    if (room.game && room.game.status === 'playing') {
      broadcastOpponent(room, ws.side, false);
      runClock(room); // an absent opponent pauses the clock of whoever is waiting
      const left = room.seats[other(ws.side)];
      if (left.connected) send(left.ws, { t: 'clock', clock: clockSnap(room) });
    } else broadcastLobby(room); // lets the remaining side see the seat go empty
    scheduleCleanup(room);
  });
});

server.listen(PORT, () => console.log(`runeverra ws relay listening on :${PORT}`));
