// Online play over the platform's room capability (published page only).
// Each side shares its own decisions (indexes into listActions) through room presence;
// both screens replay them in turn order. Protocol helpers: src/online.js.
import { applyAction, MAPS } from '../../arena.js';
import {
  newRoomCode, cleanCode, roomName, encodeMoves, decodeMoves, matchFromConfig, nextMove,
} from '../../online.js';
import { HEROES } from '../../arena.js';
import { other, type Team, type HeroId } from '../data';
import type { GameController } from '../game/controller';

const TEAM_SIZE = 4;
const STORE = 'runeverra-online'; // per tab (sessionStorage): a reload rejoins, another tab is another player
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Presence = {
  app?: string; side?: Team; picks?: string[]; ready?: boolean; match?: number;
  mine?: string; theirs?: string; map?: string; creeps?: boolean; stage?: string;
};

type RoomLike = {
  presence(p: Record<string, unknown>): Promise<void>;
  peers(): any[];
  onPeers(fn: (ch: { peers: any[] }) => void, onError?: (e: any) => void): () => void;
  leave(): Promise<void>;
};

export class RoomClient {
  api: any = null;
  available: boolean | null = null; // null = still checking
  room: RoomLike | null = null;
  code: string | null = null;
  side: Team | null = null;
  joining = false;
  error = '';
  via = 'room';
  opp: Presence | null = null;
  picks: HeroId[] = [];
  map = 'oasis';
  creeps = true;
  ready = false;
  match = 0;
  started = 0;
  mine: number[] = [];
  applied: Record<Team, number> = { p1: 0, p2: 0 };
  /** Called when both sides are ready: hand over the (caught-up) match. */
  onStart: ((game: any, fresh: boolean) => void) | null = null;
  controller: GameController | null = null;
  version = 0;
  private listeners = new Set<() => void>();
  private unsub: (() => void) | null = null;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private changed() { this.version++; this.listeners.forEach((f) => f()); }

  async init() {
    try {
      const c = (window as any).claude;
      this.api = c?.use ? await c.use('room') : null;
    } catch { this.api = null; }
    this.available = !!this.api;
    this.changed();
    return this.available;
  }

  /** A saved room for this tab, if any (after a reload). */
  saved() {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      return s && cleanCode(s.code) && (s.side === 'p1' || s.side === 'p2') ? s : null;
    } catch { return null; }
  }
  private save() {
    try {
      if (!this.code) { sessionStorage.removeItem(STORE); return; }
      sessionStorage.setItem(STORE, JSON.stringify({
        code: this.code, side: this.side, ready: this.ready, match: this.match, mine: this.mine,
        picks: this.picks, map: this.map, creeps: this.creeps,
      }));
    } catch { /* convenience only */ }
  }

  oppMoves() { return decodeMoves(this.opp?.mine); }
  oppPicks(): HeroId[] {
    const p = this.opp?.picks;
    return Array.isArray(p) ? (p.filter((h) => (HEROES as any)[h]).slice(0, TEAM_SIZE) as HeroId[]) : [];
  }
  oppReadyForNext() { return !!this.opp && !!this.opp.ready && (this.opp.match || 0) > this.started; }
  inGame() { return this.started === this.match && this.started > 0; }

  /** Share this side's state with the room. */
  publish() {
    this.save();
    if (!this.room || !this.side) return;
    const inGame = this.inGame();
    const p: Presence = {
      app: 'hg', side: this.side, picks: this.picks, ready: this.ready, match: this.match,
      mine: inGame ? encodeMoves(this.mine) : '',
      theirs: inGame ? encodeMoves(this.oppMoves().slice(0, this.applied[other(this.side)])) : '',
    };
    if (this.side === 'p1') { p.map = this.map; p.creeps = this.creeps; }
    this.room.presence(p as any).catch(() => {});
  }

  private findOpponent(peers: any[]) {
    const c = peers.filter((p) => !p.sameTab && p.presence && p.presence.app === 'hg' && p.presence.side === other(this.side!));
    c.sort((a, b) => b.updatedAt - a.updatedAt);
    return c[0] || null;
  }

  async create() { await this.connect(newRoomCode(), 'p1', false); }
  async join(text: string) {
    const code = cleanCode(text);
    if (!code) { this.error = 'A room code has 5 letters or digits, like K7Q2M.'; this.changed(); return; }
    await this.connect(code, null, false);
  }
  async rejoin() {
    const s = this.saved();
    if (!s) return false;
    Object.assign(this, { ready: !!s.ready, match: s.match | 0, started: 0, mine: Array.isArray(s.mine) ? s.mine : [] });
    if (Array.isArray(s.picks)) this.picks = s.picks.filter((h: string) => (HEROES as any)[h]).slice(0, TEAM_SIZE);
    if (s.side === 'p1' && (MAPS as any)[s.map]) { this.map = s.map; this.creeps = s.creeps !== false; }
    await this.connect(s.code, s.side, true);
    return !!this.room;
  }

  private waitConnected(ms = 5000): Promise<boolean> {
    const api = this.api;
    if (!api.connected || api.connected()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false; let un: () => void = () => {};
      const finish = (v: boolean) => { if (!done) { done = true; un(); resolve(v); } };
      un = api.onConnection((c: boolean) => { if (c) finish(true); }, () => finish(false));
      setTimeout(() => finish(api.connected()), ms);
    });
  }

  /** A named room when offered; otherwise the shared lobby with presence tagged by the code. */
  private async openRoom(code: string): Promise<RoomLike> {
    await this.waitConnected();
    try { return await this.api.join(roomName(code)); } catch (e: any) {
      if (e?.code === 'not_granted' || e?.code === 'revoked') throw e;
      this.via = `lobby (${e?.code || 'join failed'})`;
      const api = this.api; const tag = roomName(code);
      const mine = (p: any) => p.sameTab || (p.presence && p.presence.room === tag);
      const CLEAR = { app: null, room: null, side: null, picks: null, ready: null, match: null, mine: null, theirs: null, map: null, creeps: null };
      return {
        presence: (patch) => api.presence({ ...patch, room: tag }),
        peers: () => api.peers().filter(mine),
        onPeers: (fn, onError) => api.onPeers(() => fn({ peers: api.peers().filter(mine) }), onError),
        leave: () => api.presence(CLEAR),
      };
    }
  }

  private async connect(code: string, wantSide: Team | null, rejoin: boolean, tries = 0): Promise<void> {
    if (!this.api || this.joining) return;
    this.leave(false);
    this.joining = true; this.error = ''; this.via = 'room'; this.changed();
    let room: RoomLike;
    try { room = await this.openRoom(code); } catch (e: any) {
      this.joining = false;
      this.error = `Could not connect to rooms (${e?.code || 'unknown'}). ${e?.code === 'not_granted' ? 'Open this page signed in, from your gallery or a Share invite.' : 'Try again in a moment.'}`;
      this.changed(); return;
    }
    await sleep(1600); // let the others in the room answer
    const others = room.peers().filter((p) => !p.sameTab && p.presence && p.presence.app === 'hg');
    const sides = new Set(others.map((p) => p.presence.side));
    let side = wantSide;
    if (!rejoin && wantSide && sides.has(wantSide)) { // fresh code already taken: pick another
      room.leave().catch(() => {}); this.joining = false;
      if (tries < 3) return this.connect(newRoomCode(), wantSide, false, tries + 1);
      this.changed(); return;
    }
    if (!side) {
      side = !others.length ? null : !sides.has('p1') ? 'p1' : !sides.has('p2') ? 'p2' : null;
      if (!side) {
        room.leave().catch(() => {}); this.joining = false;
        this.error = others.length ? `Room ${code} already has two players.` : `No one is in room ${code}. Check the code, or ask your friend to create the room first.`;
        this.changed(); return;
      }
    }
    Object.assign(this, { room, code, side, joining: false, error: '', opp: null });
    if (!rejoin) Object.assign(this, { ready: false, match: 0, started: 0, mine: [], applied: { p1: 0, p2: 0 }, picks: [] });
    this.unsub = room.onPeers((ch) => this.onPeers(ch.peers), () => { this.error = 'The room connection was closed.'; this.changed(); });
    this.onPeers(room.peers());
    this.publish();
    this.changed();
  }

  leave(forget = true) {
    try { this.unsub?.(); } catch { /* gone */ }
    this.room?.leave().catch(() => {});
    Object.assign(this, { room: null, unsub: null, opp: null, joining: false });
    if (forget) {
      Object.assign(this, { code: null, side: null, ready: false, match: 0, started: 0, mine: [], applied: { p1: 0, p2: 0 }, error: '' });
      this.save();
    }
    this.changed();
  }

  private onPeers(peers: any[]) {
    if (!this.room) return;
    const p = this.findOpponent(peers);
    const had = !!this.opp;
    this.opp = p ? p.presence : null;
    if (this.opp && this.side === 'p2') {
      if ((MAPS as any)[this.opp.map!]) this.map = this.opp.map!;
      this.creeps = this.opp.creeps !== false;
    }
    const c = this.controller;
    if (c) {
      c.peerHere = !!this.opp;
      c.peerLeft = !!this.opp && !this.opp.ready && this.inGame();
      if (had !== !!this.opp) c.say(this.opp ? 'Your opponent is back.' : 'Your opponent left the room. The match waits for them.', this.opp ? 'ok' : 'err');
    }
    this.maybeStart();
    this.pullRemote();
    c?.refresh();
    this.changed();
  }

  // ---------- setup ----------
  setPicks(picks: HeroId[]) { this.picks = [...picks]; this.ready = false; this.publish(); this.changed(); }
  setMap(map: string, creeps: boolean) {
    if (this.side !== 'p1') return;
    this.map = map; this.creeps = creeps; this.ready = false; this.publish(); this.changed();
  }
  /** Ready for the next match (or un-ready). Joins the opponent's pending match number. */
  setReady(on: boolean) {
    if (!this.room) return;
    if (!on) { this.ready = false; this.publish(); this.changed(); return; }
    const o = this.opp;
    this.match = o && o.ready && (o.match || 0) > this.started ? o.match! : Math.max(this.started, this.match, o ? o.match || 0 : 0) + 1;
    this.ready = true; this.mine = [];
    this.publish();
    this.maybeStart();
    this.changed();
  }

  config() {
    const o = this.opp!;
    const host = this.side === 'p1' ? { map: this.map, creeps: this.creeps } : { map: o.map, creeps: o.creeps };
    const mine = [...this.picks], theirs = this.oppPicks();
    return {
      p1: this.side === 'p1' ? mine : theirs, p2: this.side === 'p2' ? mine : theirs,
      map: (MAPS as any)[host.map!] ? host.map : 'oasis', creeps: host.creeps !== false,
    };
  }

  private maybeStart() {
    const o = this.opp;
    if (!o || !this.ready || !o.ready || o.match !== this.match || this.started === this.match) return;
    if (this.picks.length !== TEAM_SIZE || this.oppPicks().length !== TEAM_SIZE) return;
    let game: any;
    try { game = matchFromConfig(this.config()); } catch { return; }
    this.started = this.match;
    const recovered = decodeMoves(o.theirs); // our own decisions, from the opponent's copy
    if (recovered.length > this.mine.length) this.mine = recovered;
    this.applied = { p1: 0, p2: 0 };
    const moves = { [this.side!]: this.mine, [other(this.side!)]: this.oppMoves() } as Record<Team, number[]>;
    for (let n = nextMove(game, moves, this.applied); n && !n.bad; n = nextMove(game, moves, this.applied)) {
      game = applyAction(game, n.action).state;
      this.applied[n.side as Team] += 1;
    }
    this.publish();
    this.onStart?.(game, game.turn === 1);
  }

  /** Our own decision on this screen. */
  localMove(index: number) {
    this.mine.push(index);
    this.applied[this.side!] += 1;
    this.publish();
  }

  /** Apply the opponent's new decisions one at a time, with effects. */
  pullRemote() {
    const c = this.controller;
    if (!c || !this.inGame() || !this.opp || this.opp.match !== this.match) return;
    const moves = { [this.side!]: this.mine, [other(this.side!)]: this.oppMoves() } as Record<Team, number[]>;
    let changed = false;
    for (let guard = 0; guard < 64; guard++) {
      const n = nextMove(c.game, moves, this.applied);
      if (!n) break;
      if (n.bad) { c.say('The opponent sent a move this match cannot take. Waiting for a valid one.', 'err'); break; }
      if (n.side === this.side) { c.game = applyAction(c.game, n.action).state; this.applied[n.side as Team] += 1; continue; }
      if (!c.commit(n.action, 'remote')) break;
      this.applied[n.side as Team] += 1; changed = true;
    }
    if (changed) this.publish();
  }
}

export const room = new RoomClient();
