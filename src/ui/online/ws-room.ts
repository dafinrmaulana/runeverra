// Online play over a self-hosted WebSocket relay (server/ws-server.mjs), for deployments
// outside claude.ai where the platform's `room` capability isn't available.
//
// Unlike room.ts, this is not peer-trust: the server runs the same rules engine and is
// the one source of truth for the match. This class only has to mirror what the server
// says and forward the player's own intent — no move-index replay, no presence polling.
// Its public shape intentionally matches RoomClient so App.tsx works with either.
import { HEROES } from '../../arena.js';
import { actionAt } from '../../online.js';
import { type Team, type HeroId } from '../data';
import type { GameController } from '../game/controller';

const TEAM_SIZE = 4;
const STORE = 'runeverra-online-ws'; // per tab (sessionStorage): a reload rejoins, another tab is another player
const WS_URL = (import.meta as any).env?.VITE_WS_URL as string | undefined;

export type Presence = { picks?: string[]; ready?: boolean };

export class WsRoomClient {
  available: boolean | null = WS_URL ? true : false;
  joining = false;
  error = '';
  via = 'room'; // no "shared lobby" fallback concept here; keep the App.tsx hall-note quiet
  code: string | null = null;
  side: Team | null = null;
  token: string | null = null;
  room: WebSocket | null = null; // truthy = connected (matches RoomClient's field name/use)
  opp: Presence | null = null;
  picks: HeroId[] = [];
  map = 'oasis';
  creeps = true;
  ready = false;
  match = 0;
  started = 0;
  onStart: ((game: any, fresh: boolean) => void) | null = null;
  controller: GameController | null = null;
  version = 0;
  private listeners = new Set<() => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private changed() { this.version++; this.listeners.forEach((f) => f()); }

  async init() { this.changed(); return this.available === true; }

  saved() {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      return s && s.code && s.token && (s.side === 'p1' || s.side === 'p2') ? s : null;
    } catch { return null; }
  }
  private save() {
    try {
      if (!this.code || !this.token) { sessionStorage.removeItem(STORE); return; }
      sessionStorage.setItem(STORE, JSON.stringify({ code: this.code, side: this.side, token: this.token }));
    } catch { /* convenience only */ }
  }

  oppPicks(): HeroId[] {
    const p = this.opp?.picks;
    return Array.isArray(p) ? (p.filter((h) => (HEROES as any)[h]).slice(0, TEAM_SIZE) as HeroId[]) : [];
  }
  oppReadyForNext() { return !!this.opp && !!this.opp.ready && this.match > this.started; }
  inGame() { return this.started === this.match && this.started > 0; }

  private open(onOpen: (ws: WebSocket) => void) {
    if (!WS_URL) { this.error = 'No online server is configured for this build.'; this.changed(); return; }
    this.joining = true; this.error = ''; this.changed();
    let ws: WebSocket;
    try { ws = new WebSocket(WS_URL); } catch { this.joining = false; this.error = 'Could not reach the online server.'; this.changed(); return; }
    ws.onopen = () => onOpen(ws);
    ws.onmessage = (ev) => this.onMessage(ws, JSON.parse(ev.data));
    ws.onclose = () => {
      const was = this.room === ws;
      if (!was) return;
      this.room = null;
      if (this.controller) this.controller.peerHere = false;
      this.changed();
      this.controller?.refresh();
      // try to win back the seat quietly, a few times, before giving up
      if (this.code && this.token && this.side) this.scheduleReconnect();
    };
    ws.onerror = () => {};
  }

  private scheduleReconnect(delay = 1500) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.code && this.token && this.side && !this.room) this.rejoin();
    }, delay);
  }

  async create() {
    this.open((ws) => ws.send(JSON.stringify({ t: 'hello' })));
  }
  async join(text: string) {
    const code = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { this.error = 'A room code has 5 letters or digits, like K7Q2M.'; this.changed(); return; }
    this.open((ws) => ws.send(JSON.stringify({ t: 'hello', code })));
  }
  async rejoin() {
    const s = this.saved();
    if (!s) return false;
    this.open((ws) => ws.send(JSON.stringify({ t: 'hello', code: s.code, side: s.side, token: s.token })));
    return true;
  }

  leave(forget = true) {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    try { this.room?.close(); } catch { /* gone */ }
    this.room = null; this.joining = false;
    if (forget) {
      Object.assign(this, { code: null, side: null, token: null, ready: false, match: 0, started: 0, opp: null, error: '' });
      this.save();
    }
    this.changed();
  }

  // ---------- setup ----------
  setPicks(picks: HeroId[]) {
    this.picks = [...picks]; this.ready = false;
    this.send({ t: 'picks', picks: this.picks });
    this.changed();
  }
  setMap(map: string, creeps: boolean) {
    if (this.side !== 'p1') return;
    this.map = map; this.creeps = creeps;
    this.send({ t: 'map', map, creeps });
    this.changed();
  }
  setReady(on: boolean) {
    this.ready = on;
    this.send({ t: 'ready', ready: on });
    this.changed();
  }

  config() {
    const mine = [...this.picks], theirs = this.oppPicks();
    return {
      p1: this.side === 'p1' ? mine : theirs, p2: this.side === 'p2' ? mine : theirs,
      map: this.map, creeps: this.creeps !== false,
    };
  }

  /** The state the controller was in just before its most recent local move: the index
   *  GameController hands to onLocalMove was computed against this, not against
   *  controller.game, which has already moved on by the time we're called. */
  private preMoveGame: any = null;

  /** Our own decision on this screen (an index into listActions, like room.ts expects). */
  localMove(index: number) {
    if (!this.controller || !this.preMoveGame) return;
    const action = actionAt(this.preMoveGame, index);
    if (action) this.send({ t: 'action', action });
    this.preMoveGame = this.controller.game; // controller already applied it; that's our new baseline
  }

  private send(msg: Record<string, unknown>) {
    if (this.room && this.room.readyState === this.room.OPEN) this.room.send(JSON.stringify(msg));
  }

  private onMessage(ws: WebSocket, msg: any) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'joined') {
      this.room = ws; this.joining = false; this.code = msg.code; this.side = msg.side; this.token = msg.token;
      this.save();
      this.changed();
      return;
    }
    if (msg.t === 'notfound') { this.joining = false; this.error = `No room with that code (or your seat expired).`; this.leave(); this.changed(); return; }
    if (msg.t === 'full') { this.joining = false; this.error = 'That room already has two players.'; this.changed(); return; }
    if (msg.t === 'error') {
      this.controller?.say(msg.message || 'The server rejected that.', 'err');
      // the server is the only truth; if we drifted from it (a stale or tampered client),
      // reconnecting pulls a fresh `sync` and self-heals rather than staying out of step.
      if (this.inGame()) { try { ws.close(); } catch { /* already gone */ } }
      return;
    }
    if (msg.t === 'opponent') {
      if (this.controller) { this.controller.peerHere = !!msg.connected; this.controller.refresh(); }
      this.changed();
      return;
    }
    if (msg.t === 'lobby') {
      this.map = msg.map; this.creeps = msg.creeps;
      this.match = msg.match; this.started = msg.started;
      this.opp = msg.opp;
      this.changed();
      return;
    }
    if (msg.t === 'start') {
      this.started = this.match = msg.match;
      this.preMoveGame = msg.game;
      this.onStart?.(msg.game, msg.fresh);
      this.changed();
      return;
    }
    if (msg.t === 'sync') {
      this.started = this.match = msg.match;
      this.preMoveGame = msg.game;
      if (this.controller) { this.controller.setGame(msg.game); this.controller.say('Back in the match.', 'ok'); }
      else this.onStart?.(msg.game, false);
      this.changed();
      return;
    }
    if (msg.t === 'move') {
      // the opponent's validated move: replay it through the normal commit path so it
      // animates like any other move, then this becomes our new pre-move reference too.
      if (this.controller?.commit(msg.action, 'remote')) this.preMoveGame = this.controller.game;
      return;
    }
  }
}

export const wsRoom = new WsRoomClient();
