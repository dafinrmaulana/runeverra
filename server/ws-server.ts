// Authoritative WebSocket relay for self-hosted online play.
//
// Unlike the Claude-artifact "room" capability (src/ui/online/room.ts), which is a
// peer-trust presence channel — each side just publishes its own move indexes and both
// screens replay them — this server is the single source of truth. Clients send what
// they want to do; the server runs the exact same rules engine (src/engine/) to check
// it is legal before applying it or telling the other player. A modified client can at
// worst refuse to move; it can never make an illegal move happen, claim extra tokens, or
// act out of turn, because none of that is decided by any client.
//
// Everything lives in memory (one small object per room) — there's no database, because
// a match only needs to survive as long as both players care about it. Idle rooms are
// swept after ROOM_TTL_MS.
//
// Runs as TypeScript directly (Node 22.18+ strips the types): `node server/ws-server.ts`.
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { applyAction, validateAction, toMove, isHero, own, TEAM_SIZE } from '../src/engine/index.ts';
import type { Action, State, Team } from '../src/engine/index.ts';
import { newRoomCode, cleanCode, matchFromConfig } from '../src/online.ts';
import { createClock, setRunning, remaining, snapshot, minutesToMs } from '../src/clock.ts';
import type { Clock } from '../src/clock.ts';
import type { ChatEntry, ClientMessage, ServerMessage } from '../src/protocol.ts';

const PORT = Number(process.env.PORT || 8787);
const ROOM_TTL_MS = 5 * 60 * 1000; // a room with nobody connected is dropped after this
const MAX_ROOMS = 2000; // a sane ceiling for a hobby server; refuses new rooms past this

// One "minute" of match time. Tests shrink it so a clock can run out in milliseconds.
const UNIT_MS = Number(process.env.CLOCK_UNIT_MS) || 60000;
const toMs = (minutes: unknown) => (minutesToMs(minutes) / 60000) * UNIT_MS;

const SIDES: Team[] = ['p1', 'p2'];

/** A connected socket, tagged with the room and seat it joined. */
type Client = WebSocket & { room?: string; side?: Team; alive?: boolean };
type Seat = {
  ws: Client | null;
  token: string; // proves a reconnecting client owns this seat
  connected: boolean;
  picks: string[];
  ready: boolean;
  chatTimes: number[]; // recent message times, for the rate limit
};
type Room = {
  code: string;
  seats: Record<Team, Seat>;
  map: string;
  creeps: boolean;
  clockMs: number; // per side; 0 = untimed
  clock: Clock | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  chat: ChatEntry[];
  match: number; // the round both sides are readying for
  started: number; // the last round that actually started
  game: State | null;
  cleanupAt: ReturnType<typeof setTimeout> | null;
};
/**
 * A ClientMessage (src/protocol.ts) as it actually arrives: parsed JSON from anyone. Every field may
 * be missing or of the wrong type, so each handler checks what it reads.
 */
type Incoming = { t: string } & { [K in AllKeys<ClientMessage>]?: unknown };
type AllKeys<T> = T extends unknown ? keyof T : never;

const rooms = new Map<string, Room>();

const other = (team: Team): Team => (team === 'p1' ? 'p2' : 'p1');
const newToken = () => randomBytes(12).toString('base64url');
const isTeam = (value: unknown): value is Team => value === 'p1' || value === 'p2';
const validPicks = (picks: unknown): picks is string[] =>
  Array.isArray(picks) && picks.length === TEAM_SIZE && picks.every(isHero);

function send(ws: Client | null, message: ServerMessage) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}
function sendToSeats(room: Room, message: ServerMessage) {
  for (const side of SIDES) if (room.seats[side].connected) send(room.seats[side].ws, message);
}

function newSeat(): Seat {
  return { ws: null, token: newToken(), connected: false, picks: [], ready: false, chatTimes: [] };
}

function newRoom(code: string): Room {
  return {
    code,
    seats: { p1: newSeat(), p2: newSeat() },
    map: 'oasis',
    creeps: true,
    clockMs: 0,
    clock: null,
    clockTimer: null,
    chat: [],
    match: 0,
    started: 0,
    game: null,
    cleanupAt: null,
  };
}

/** The lobby as one side sees it: their own picks, and the opponent's if they are here. */
function lobbyMessage(room: Room, side: Team): ServerMessage {
  const mine = room.seats[side];
  const theirs = room.seats[other(side)];
  return {
    t: 'lobby',
    side,
    map: room.map,
    creeps: room.creeps,
    clockMs: room.clockMs,
    match: room.match,
    started: room.started,
    you: { picks: mine.picks, ready: mine.ready },
    opp: theirs.connected ? { picks: theirs.picks, ready: theirs.ready } : null,
  };
}

function broadcastLobby(room: Room) {
  for (const side of SIDES) if (room.seats[side].connected) send(room.seats[side].ws, lobbyMessage(room, side));
}

function broadcastOpponent(room: Room, side: Team, connected: boolean) {
  const opponent = room.seats[other(side)];
  if (opponent.connected) send(opponent.ws, { t: 'opponent', connected });
}

// ---------- match clock (server-authoritative; see src/clock.ts) ----------
const clockSnapshot = (room: Room) => (room.clock ? snapshot(room.clock, Date.now()) : null);

/** Whose clock runs now: whoever decides, unless their opponent is away (then it waits). */
function runClock(room: Room) {
  if (!room.clock) return;
  const game = room.game;
  const decider = game && game.status === 'playing' ? toMove(game) : null;
  const opponentAway = decider && !room.seats[other(decider)].connected;
  room.clock = setRunning(room.clock, decider && !opponentAway ? decider : null, Date.now());
  if (room.clockTimer) {
    clearTimeout(room.clockTimer);
    room.clockTimer = null;
  }
  const running = room.clock.running;
  if (running) room.clockTimer = setTimeout(() => timeOut(room), remaining(room.clock, running, Date.now()));
}

function timeOut(room: Room) {
  room.clockTimer = null;
  const team = room.clock && room.clock.running;
  if (!team || !room.game || room.game.status !== 'playing') return;
  const action: Action = { type: 'timeout', team };
  room.game = applyAction(room.game, action, { trusted: true }).state;
  room.clock = setRunning(room.clock!, null, Date.now());
  sendToSeats(room, { t: 'move', action, clock: clockSnapshot(room) });
  afterMatchEnds(room);
}

/** Both sides ready, with a pending round and full picks: start (or restart) the match. */
function maybeStart(room: Room) {
  const { p1, p2 } = room.seats;
  if (!p1.ready || !p2.ready || room.match <= room.started) return;
  if (!validPicks(p1.picks) || !validPicks(p2.picks)) return;
  let game: State;
  try {
    game = matchFromConfig({ p1: p1.picks, p2: p2.picks, map: room.map, creeps: room.creeps, clockMs: room.clockMs });
  } catch {
    return;
  }
  room.game = game;
  room.started = room.match;
  p1.ready = false;
  p2.ready = false;
  room.clock = room.clockMs > 0 ? createClock(room.clockMs) : null;
  runClock(room);
  sendToSeats(room, { t: 'start', game, fresh: true, match: room.match, clock: clockSnapshot(room) });
}

/** After a match ends, seats re-ready for the next one; this just re-announces lobby state. */
function afterMatchEnds(room: Room) {
  broadcastLobby(room);
}

function scheduleCleanup(room: Room) {
  if (room.cleanupAt) clearTimeout(room.cleanupAt);
  room.cleanupAt = setTimeout(() => {
    if (room.seats.p1.connected || room.seats.p2.connected) return;
    if (room.clockTimer) clearTimeout(room.clockTimer);
    rooms.delete(room.code);
  }, ROOM_TTL_MS);
}

// ---------- messages ----------
/** Create a room (no code), join one (code), or take a held seat back (code + side + token). */
function handleHello(ws: Client, message: Incoming) {
  let room: Room | undefined;
  let side: Team | null;
  if (!message.code) {
    if (rooms.size >= MAX_ROOMS)
      return send(ws, { t: 'error', message: 'Server is full right now. Try again shortly.' });
    let code = newRoomCode();
    while (rooms.has(code)) code = newRoomCode();
    room = newRoom(code);
    rooms.set(code, room);
    side = 'p1';
  } else {
    const code = cleanCode(message.code);
    room = code ? rooms.get(code) : undefined;
    if (!room) return send(ws, { t: 'notfound' });
    if (message.side && message.token) {
      // reconnect to a held seat
      if (!isTeam(message.side) || room.seats[message.side].token !== message.token) return send(ws, { t: 'notfound' });
      side = message.side;
    } else {
      // fresh join: take whichever seat is open
      side = !room.seats.p1.connected && !room.seats.p1.ws ? 'p1' : null;
      if (!side) side = !room.seats.p2.connected ? 'p2' : null;
      if (!side) return send(ws, { t: 'full' });
    }
  }
  const seat = room.seats[side];
  if (seat.ws && seat.ws !== ws) {
    // a half-dead socket from a dropped connection
    const stale = seat.ws;
    seat.ws = null;
    try {
      stale.close();
    } catch {
      /* gone */
    }
  }
  seat.ws = ws;
  seat.connected = true;
  ws.room = room.code;
  ws.side = side;
  if (room.cleanupAt) {
    clearTimeout(room.cleanupAt);
    room.cleanupAt = null;
  }
  send(ws, { t: 'joined', code: room.code, side, token: seat.token });
  if (room.chat.length) send(ws, { t: 'chatlog', log: room.chat });
  if (room.game && room.game.status === 'playing') {
    // mid-match: the other side only needs a presence pulse, not a lobby refresh.
    broadcastOpponent(room, side, true);
    runClock(room); // the opponent's clock was waiting for this player
    const opponent = room.seats[other(side)];
    if (opponent.connected) send(opponent.ws, { t: 'clock', clock: clockSnapshot(room) });
    send(ws, { t: 'sync', game: room.game, match: room.match, clock: clockSnapshot(room) });
  } else {
    // pre-match: both sides' picks/ready view may be stale now — refresh both.
    broadcastLobby(room);
  }
}

function handlePicks(room: Room, side: Team, message: Incoming) {
  const picks = message.picks;
  if (!Array.isArray(picks) || !picks.every((heroId) => typeof heroId === 'string')) return;
  room.seats[side].picks = picks.filter(isHero).slice(0, TEAM_SIZE);
  room.seats[side].ready = false;
  broadcastLobby(room);
}

function handleMap(room: Room, side: Team, message: Incoming) {
  if (side !== 'p1' || typeof message.map !== 'string') return;
  room.map = message.map;
  room.creeps = message.creeps !== false;
  broadcastLobby(room);
}

const CHAT_MAX = 200;
const CHAT_KEEP = 50;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 5000;

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Plain text only: control characters become spaces, runs of spaces collapse, capped at CHAT_MAX. */
function cleanChat(text: unknown) {
  if (typeof text !== 'string') return '';
  return text.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
}

function handleChat(room: Room, side: Team, message: Incoming) {
  const text = cleanChat(message.text);
  if (!text) return;
  const seat = room.seats[side];
  const now = Date.now();
  seat.chatTimes = seat.chatTimes.filter((time) => now - time < CHAT_WINDOW_MS);
  if (seat.chatTimes.length >= CHAT_BURST) return send(seat.ws, { t: 'chatlimit' }); // not `error`: the client reconnects on those
  seat.chatTimes.push(now);
  const entry: ChatEntry = { side, text, ts: now };
  room.chat.push(entry);
  if (room.chat.length > CHAT_KEEP) room.chat.shift();
  sendToSeats(room, { t: 'chat', ...entry });
}

function handleClock(room: Room, side: Team, message: Incoming) {
  if (side !== 'p1' || room.game?.status === 'playing') return;
  room.clockMs = toMs(message.minutes);
  room.seats.p1.ready = false; // both must agree to the new time
  room.seats.p2.ready = false;
  broadcastLobby(room);
}

function handleReady(room: Room, side: Team, message: Incoming) {
  const ready = !!message.ready;
  room.seats[side].ready = ready;
  // whoever readies up first opens the next round; the other side just joins it.
  if (ready && room.match <= room.started) room.match += 1;
  broadcastLobby(room);
  maybeStart(room);
}

function handleAction(room: Room, side: Team, message: Incoming) {
  const ws = room.seats[side].ws;
  if (!room.game || room.game.status !== 'playing') return send(ws, { t: 'error', message: 'No match in progress.' });
  if (toMove(room.game) !== side) return send(ws, { t: 'error', message: 'Not your turn.' });
  const action = message.action as Action;
  const result = applyAction(room.game, action);
  if (!result.ok) {
    // either a stale client or a tampered one — never trust it, never relay it.
    const check = validateAction(room.game, action);
    return send(ws, { t: 'error', message: check.reason || 'That move is not legal.' });
  }
  room.game = result.state;
  runClock(room);
  const opponent = room.seats[other(side)];
  if (opponent.connected) send(opponent.ws, { t: 'move', action, clock: clockSnapshot(room) });
  if (room.game.status !== 'playing') afterMatchEnds(room);
}

function handleMessage(ws: Client, message: Incoming) {
  if (message.t === 'hello') return handleHello(ws, message);
  const room = ws.room ? rooms.get(ws.room) : undefined;
  if (!room || !ws.side) return;
  const handlers: Record<string, (room: Room, side: Team, message: Incoming) => void> = {
    picks: handlePicks,
    map: handleMap,
    clock: handleClock,
    chat: handleChat,
    ready: handleReady,
    action: handleAction,
  };
  own(handlers, message.t)?.(room, ws.side, message);
}

// ---------- server ----------
// Proxies and phones drop idle sockets silently. Ping every 25s (browsers answer on their own);
// a socket that missed the last ping is dead, so terminate it and let the player reconnect.
setInterval(() => {
  for (const ws of wss.clients as Set<Client>) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    try {
      ws.ping();
    } catch {
      /* closing */
    }
  }
}, 25000).unref();

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('runeverra ws relay');
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: Client) => {
  ws.alive = true;
  ws.on('pong', () => {
    ws.alive = true;
  });
  ws.on('message', (raw) => {
    let message: Incoming;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!message || typeof message.t !== 'string') return;
    // One bad message must never take the relay (and every room on it) down with it.
    try {
      handleMessage(ws, message);
    } catch (err) {
      console.error('message failed:', message.t, err);
      send(ws, { t: 'error', message: 'That request could not be handled.' });
    }
  });
  ws.on('close', () => {
    const room = ws.room ? rooms.get(ws.room) : undefined;
    if (!room || !ws.side) return;
    const seat = room.seats[ws.side];
    if (seat.ws !== ws) return; // an old socket closing after the player already came back: nothing changed
    seat.connected = false;
    seat.ws = null;
    if (room.game && room.game.status === 'playing') {
      broadcastOpponent(room, ws.side, false);
      runClock(room); // an absent opponent pauses the clock of whoever is waiting
      const waiting = room.seats[other(ws.side)];
      if (waiting.connected) send(waiting.ws, { t: 'clock', clock: clockSnapshot(room) });
    } else {
      broadcastLobby(room); // lets the remaining side see the seat go empty
    }
    scheduleCleanup(room);
  });
});

server.listen(PORT, () => console.log(`runeverra ws relay listening on :${PORT}`));
