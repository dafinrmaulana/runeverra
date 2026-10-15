// Online play over a self-hosted WebSocket relay (server/ws-server.mjs), for deployments
// outside claude.ai where the platform's `room` capability isn't available.
//
// Unlike room.ts, this is not peer-trust: the server runs the same rules engine and is
// the one source of truth for the match. This class only has to mirror what the server
// says and forward the player's own intent — no move-index replay, no presence polling.
// Its public shape intentionally matches RoomClient so App.tsx works with either.
import { HEROES } from '../../arena.js';
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
  onStart: ((game: any, fresh: boolean, clock?: any) => void) | null = null;
  canTime = true; // the relay keeps the match clock
  clockMin = 0;
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
      if (was) {
        this.room = null;
        if (this.controller) this.controller.selfOffline = true;
        this.changed();
        this.controller?.refresh();
      } else if (this.room) return; // a stale socket closing after we already reconnected
      this.joining = false;
      // keep trying to win the seat back, backing off a little each time
      if (this.code && this.token && this.side) this.scheduleReconnect();
    };
    ws.onerror = () => {};
  }

  private retries = 0;
  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 1.6 ** this.retries++, 8000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.code && this.token && this.side && !this.room) this.rejoin();
    }, delay);
  }

  /** The tab came back or the network returned: don't wait out the backoff. */
  nudge() {
    if (!this.code || !this.token || !this.side || this.room) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.rejoin();
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
  setClock(min: number) {
    if (this.side !== 'p1') return;
    this.clockMin = min;
    this.send({ t: 'clock', minutes: min });
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

  /** Our own decision on this screen. The server gets the action itself (not an index into a
   *  list we would have to keep in step), so a run of our own decisions can never drift. */
  localMove(_index: number, action?: any) {
    if (action) this.send({ t: 'action', action });
  }

  private send(msg: Record<string, unknown>) {
    if (this.room && this.room.readyState === this.room.OPEN) this.room.send(JSON.stringify(msg));
  }

  private onMessage(ws: WebSocket, msg: any) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'joined') {
      this.room = ws; this.joining = false; this.code = msg.code; this.side = msg.side; this.token = msg.token;
      this.retries = 0;
      if (this.controller) { this.controller.selfOffline = false; this.controller.refresh(); }
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
      this.clockMin = Math.round((msg.clockMs || 0) / 60000);
      this.match = msg.match; this.started = msg.started;
      this.opp = msg.opp;
      this.changed();
      return;
    }
    if (msg.t === 'start') {
      this.started = this.match = msg.match;
      this.onStart?.(msg.game, msg.fresh, msg.clock || null);
      this.changed();
      return;
    }
    if (msg.t === 'sync') {
      this.started = this.match = msg.match;
      if (this.controller) { this.controller.setGame(msg.game); this.controller.setClock(msg.clock || null); this.controller.say('Back in the match.', 'ok'); }
      else this.onStart?.(msg.game, false, msg.clock || null);
      this.changed();
      return;
    }
    if (msg.t === 'move') {
      // the opponent's validated move: replay it through the normal commit path so it animates like any other move.
      this.controller?.commit(msg.action, 'remote');
      this.controller?.setClock(msg.clock || null);
      return;
    }
    if (msg.t === 'clock') { this.controller?.setClock(msg.clock || null); return; }
  }
}

export const wsRoom = new WsRoomClient();
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => wsRoom.nudge());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wsRoom.nudge(); });
}
