// Game controller: owns the match state, selection, bot turns and history, and drives the
// board. React subscribes to it for the panels. Rules stay in src/arena.js.
import {
  applyAction, validateAction, listActions, getThreats, unitAt, samePos, toMove, label,
  HEROES, beastOf, skillActions, moveOptions, squareName,
} from '../../arena.js';
import { chooseAction } from '../../arena-bot.js';
import { actionIndex } from '../../online.js';
import { createBoard } from './board.js';
import { tk, pref, setPref, type Team } from '../data';
import { addResult, getTally, resetTally, sideA } from '../record';
import { saveReplay } from '../replays';

export type Mode =
  | { kind: 'bot'; level: 'easy' | 'normal' | 'hard'; side: Team }
  | { kind: 'local' }
  | { kind: 'online'; side: Team; onLocalMove: (index: number) => void };

export type Source = 'me' | 'bot' | 'remote';
type Pos = { r: number; c: number };

const BOT_DELAY_MS = 520;

export class GameController {
  game: any;
  mode: Mode;
  selectedId: string | null = null;
  armed = false;
  msg = '';
  msgKind: '' | 'ok' | 'err' = '';
  showThreats = true;
  showScore: boolean = pref('showScore', true);
  /** Which series this match counts toward (set by the app); '' = not counted. */
  series = '';
  private recorded = false;
  history: any[] = [];
  future: any[] = [];
  version = 0;
  /** True while the online opponent is connected (set by the room client). */
  peerHere = true;
  peerLeft = false;
  private board: ReturnType<typeof createBoard> | null = null;
  private listeners = new Set<() => void>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private gen = 0;

  constructor(mode: Mode, game: any) {
    this.mode = mode;
    this.game = game;
  }

  // ---------- subscription (useSyncExternalStore) ----------
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private changed() { this.version++; this.listeners.forEach((f) => f()); }

  // ---------- who decides ----------
  humanTeams(): Team[] {
    if (this.mode.kind === 'online') return [this.mode.side];
    if (this.mode.kind === 'bot') return [this.mode.side];
    return ['p1', 'p2'];
  }
  decider(): Team | null { return this.game.status === 'playing' ? toMove(this.game) : null; }
  deciderIsHuman() { const d = this.decider(); return !!d && this.humanTeams().includes(d); }
  deciderIsBot() { return this.mode.kind === 'bot' && this.decider() === this.botTeam(); }
  botTeam(): Team | null { return this.mode.kind === 'bot' ? (this.mode.side === 'p1' ? 'p2' : 'p1') : null; }
  /** The side whose player sits at the bottom of the screen (board turned for Ember). */
  viewer(): Team { return this.mode.kind === 'local' ? 'p1' : this.mode.side; }

  // ---------- board ----------
  attach(host: HTMLElement, intro = true) {
    this.board = createBoard(host, {
      onCell: (p: Pos) => this.onCell(p),
      onPress: (p: Pos) => this.onPress(p),
      onDrop: (id: string, p: Pos) => this.onDrop(id, p),
      flip: this.viewer() === 'p2',
      facing: this.mode.kind === 'local',
    });
    this.render({});
    if (intro) this.board.intro(this.game);
    this.maybeBot();
  }
  detach() { this.cancelBot(); this.board?.destroy(); this.board = null; }
  destroy() { this.detach(); this.listeners.clear(); }

  private render(extra: { deathDelay?: number; hits?: Pos[] }) {
    const g = this.game;
    const sel = this.selectedId ? g.units[this.selectedId] : null;
    const live = sel && sel.alive ? sel : null;
    const threats = this.showThreats && g.status === 'playing' ? getThreats(g, g.current) : new Set();
    const acts = this.deciderIsHuman() ? listActions(g) : [];
    this.board?.render(g, { acts, live, armed: this.armed, threats, ...extra });
    this.changed();
    this.maybeBot();
  }
  refresh() { this.render({}); }

  say(text: string, kind: '' | 'ok' | 'err' = '') { this.msg = text; this.msgKind = kind; }
  clearSel() { this.selectedId = null; this.armed = false; }

  // ---------- decisions ----------
  /** Apply a decision. `src`: 'me' (this screen), 'bot', or 'remote' (online opponent). */
  commit(action: any, src: Source = 'me'): boolean {
    const online = this.mode.kind === 'online';
    const idx = online && src === 'me' ? actionIndex(this.game, action) : -1;
    const res = applyAction(this.game, action);
    if (!res.ok) { this.say(res.reason || 'Not allowed.', 'err'); this.render({}); return false; }
    const before = this.game;
    if (src === 'me' && !online) { this.history.push(before); this.future = []; }
    if (online && src === 'me') (this.mode as any).onLocalMove(idx);
    this.game = res.state;
    this.clearSel();
    const g = this.game;
    const newLines = g.log.slice(before.log.length).map((l: any) => l.text).join(' ');
    if (newLines) this.say((src === 'bot' ? 'Bot: ' : src === 'remote' ? 'Opponent: ' : '') + newLines, 'ok');
    else if (g.phase === 'react') this.say(`${label(g.units[g.pending.plantId])} can interrupt this action.`);
    const plan = this.board ? this.board.plan(before, g) : { deathDelay: 0, hop: null };
    const hits = g.lastAction && g.lastAction !== before.lastAction ? (g.lastAction.hits || []) : [];
    if (g.phase === 'beast' && this.deciderIsHuman()) this.selectedId = g.pending.unitId;
    this.render({ deathDelay: plan.deathDelay, hits });
    if (this.board) {
      if (plan.hop) this.board.hop(plan.hop);
      this.board.run(plan);
      if (before.status === 'playing' && g.status !== 'playing') this.board.victory(g, g.status);
    }
    if (before.status === 'playing' && g.status !== 'playing' && !this.recorded) {
      this.recorded = true; // an undo and a second finish don't count twice
      if (this.series) addResult(this.series, g.status === sideA(this.mode.kind, this.viewer()));
      const m = this.mode;
      saveReplay({
        kind: m.kind, viewer: this.viewer(), winner: g.status, setup: g.setup, trail: g.trail,
        label: m.kind === 'bot' ? `vs Bot · ${m.level[0].toUpperCase()}${m.level.slice(1)}` : m.kind === 'local' ? 'Face to face' : 'Online',
      });
    }
    return true;
  }

  /** Replace the match without effects (online catch-up). */
  setGame(game: any) { this.game = game; this.clearSel(); this.board?.reset(); this.render({}); }

  private maybeBot() {
    if (!this.deciderIsBot() || this.botTimer) return;
    const myGen = this.gen;
    const level = (this.mode as any).level;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (myGen !== this.gen || !this.deciderIsBot()) return;
      const pick = chooseAction(this.game, level);
      if (pick?.action) this.commit(pick.action, 'bot');
    }, this.game.phase === 'main' ? BOT_DELAY_MS : 420);
  }
  cancelBot() { this.gen++; if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; } }

  onCell(pos: Pos) {
    const g = this.game;
    if (g.status !== 'playing' || !this.deciderIsHuman()) {
      const u = unitAt(g, pos);
      if (u && g.status === 'playing') this.select(u.id); // inspect while waiting
      return;
    }
    const acts = listActions(g);
    const occupant = unitAt(g, pos);
    if (g.phase === 'react') return;
    if (g.phase === 'ice') {
      const a = acts.find((x: any) => x.type === 'ice' && samePos(x.to, pos));
      if (a) { this.commit(a); return; }
      this.say('Pick a dashed square within 3 of Aqna, or Skip.', 'err'); this.render({}); return;
    }
    if (g.phase === 'beast') {
      const a = acts.find((x: any) => x.type === 'move' && samePos(x.to, pos));
      if (a) { this.commit(a); return; }
      this.say('Move the beast to a marked square, or Skip.', 'err'); this.render({}); return;
    }
    if (g.phase === 'storm') { this.say('Choose Slam or Skip.', 'err'); this.render({}); return; }

    const sel = this.selectedId ? g.units[this.selectedId] : null;
    if (this.armed && sel) {
      const a = acts.find((x: any) => x.type === 'skill' && x.unitId === sel.id && (x.to ? samePos(x.to, pos) : occupant && x.targetId === occupant.id));
      if (a) { this.commit(a); return; }
      const key = HEROES[sel.hero as keyof typeof HEROES].skill.key;
      if (key === 'summon') { this.armed = false; this.say('Summon cancelled.'); this.render({}); return; }
      if (occupant && occupant.team === sel.team && occupant.id !== sel.id && key !== 'grave') { this.select(occupant.id); return; }
      if (occupant) {
        this.say(validateAction(g, { type: 'skill', unitId: sel.id, skill: key, targetId: occupant.id }).reason || '', 'err');
        this.render({}); return;
      }
      this.armed = false; this.say('Skill cancelled.'); this.render({}); return;
    }
    if (sel && sel.team === g.current && acts.some((x: any) => x.type === 'move' && x.unitId === sel.id && samePos(x.to, pos))) {
      this.commit({ type: 'move', unitId: sel.id, to: pos }); return;
    }
    if (sel && occupant && this.shieldBlocks(sel, occupant)) { this.bounce(sel, occupant, true); return; }
    if (sel && sel.rooted && sel.team === g.current && g.phase === 'main' && moveOptions(g, sel).some((o: any) => samePos(o.to, pos))) {
      this.board?.rootTug(sel.id, sel.pos, pos);
      this.say(`${label(sel)} strains toward ${squareName(pos)}, but the roots drag it back: it can't act this turn.`, 'err');
      this.render({}); return;
    }
    if (occupant) {
      if (this.selectedId === occupant.id) { this.clearSel(); this.say(''); this.render({}); return; }
      this.select(occupant.id); return;
    }
    if (sel && sel.team === g.current && sel.kind === 'hero') {
      this.say(validateAction(g, { type: 'move', unitId: sel.id, to: pos }).reason || '', 'err');
      this.render({}); return;
    }
    this.clearSel(); this.say(''); this.render({});
  }

  /** Would `u` capture `target` here if Empty Grave weren't protecting it? */
  shieldBlocks(u: any, target: any): boolean {
    const g = this.game;
    if (!target.warded || target.team === u.team || u.team !== g.current || g.phase !== 'main') return false;
    const open = { ...g, units: { ...g.units, [target.id]: { ...target, warded: false } } };
    return moveOptions(open, u).some((o: any) => samePos(o.to, target.pos) && o.kills.includes(target.id));
  }
  /** The attack bounces off the shield: an effect and a message, the turn is not used. */
  bounce(u: any, target: any, lunge: boolean) {
    this.board?.shieldBounce(u.id, u.pos, target.id, target.pos, lunge);
    this.say(`${label(target)} is shielded by Empty Grave: ${label(u)} is thrown back. The shield lasts until its caster's next turn.`, 'err');
    this.render({});
  }

  /** A press on a piece that can move now: lift it (select, showing its squares). */
  onPress(pos: Pos): { id: string; fresh: boolean } | null {
    const g = this.game;
    if (g.status !== 'playing' || !this.deciderIsHuman() || this.armed) return null;
    if (g.phase !== 'main' && g.phase !== 'beast') return null;
    const u = unitAt(g, pos);
    if (!u || !listActions(g).some((a: any) => a.type === 'move' && a.unitId === u.id)) return null;
    const fresh = this.selectedId !== u.id;
    if (fresh) this.select(u.id);
    return { id: u.id, fresh };
  }

  /** A lifted piece released on `pos`. True when it moved there. */
  onDrop(id: string, pos: Pos): boolean {
    const g = this.game;
    const a = listActions(g).find((x: any) => x.type === 'move' && x.unitId === id && samePos(x.to, pos));
    if (a) return this.commit(a);
    const occ = unitAt(g, pos);
    if (occ && this.shieldBlocks(g.units[id], occ)) { this.bounce(g.units[id], occ, false); return false; }
    this.say(validateAction(g, { type: 'move', unitId: id, to: pos }).reason || 'That square is out of reach.', 'err');
    this.render({});
    return false;
  }

  select(id: string) {
    const g = this.game;
    this.selectedId = id; this.armed = false;
    const u = g.units[id];
    if (u.team !== g.current) this.say('Enemy unit. Red rings show where it can go.');
    else if (u.kind === 'beast') this.say('The beast only acts right after Ge\'nga.', 'err');
    else if (u.rooted) this.say(`${label(u)} is held by roots this turn.`, 'err');
    else this.say('');
    this.render({});
  }

  armSkill() {
    const g = this.game;
    const u = this.selectedId ? g.units[this.selectedId] : null;
    if (!u || u.kind !== 'hero' || g.phase !== 'main' || !this.deciderIsHuman() || u.team !== g.current) return;
    const sk = HEROES[u.hero as keyof typeof HEROES].skill as any;
    if (sk.type !== 'active') { this.say(`${sk.name} is passive: it triggers on its own.`); this.render({}); return; }
    if (this.armed) { this.armed = false; this.say('Skill cancelled.'); this.render({}); return; }
    if (u.rooted) { this.say(`${label(u)} is held by roots this turn.`, 'err'); this.render({}); return; }
    if (g.energy[u.team] < sk.cost) { this.say(`${sk.name} needs ${tk(sk.cost)}; you have ${g.energy[u.team]}.`, 'err'); this.render({}); return; }
    if (sk.key === 'summon' && beastOf(g, u)) { this.say('The beast is still alive. Wild Company summons it only after it falls.', 'err'); this.render({}); return; }
    if (!skillActions(g, u).length) { this.say(`${sk.name} has no valid target in range.`, 'err'); this.render({}); return; }
    this.armed = true;
    this.say(sk.key === 'summon' ? 'Tap a highlighted square next to Ge\'nga to summon the beast.' : `${sk.name}: tap a highlighted ${sk.key === 'grave' ? 'ally' : 'enemy'}.`);
    this.render({});
  }

  skip() { if (this.deciderIsHuman()) this.commit({ type: 'skip' }); }
  slam() { if (this.deciderIsHuman() && this.game.phase === 'storm') this.commit({ type: 'storm' }); }
  react(use: boolean) { if (this.deciderIsHuman() && this.game.phase === 'react') this.commit({ type: 'react', use }); }
  escape() { if (this.armed) this.armed = false; else this.clearSel(); this.say(''); this.render({}); }

  canUndo() { return this.mode.kind !== 'online' && this.history.length > 0 && !this.deciderIsBot(); }
  canRedo() { return this.mode.kind !== 'online' && this.future.length > 0 && !this.deciderIsBot(); }
  private jump(to: any, note: string) {
    this.cancelBot(); this.board?.clearFx();
    this.game = to;
    this.board?.reset();
    this.clearSel();
    this.say(note);
    this.render({});
  }
  undo() {
    if (!this.canUndo()) return;
    this.future.push(this.game);
    this.jump(this.history.pop(), this.mode.kind === 'bot' ? 'Took back your last decision and the bot\'s reply.' : 'Took back the last decision.');
  }
  redo() {
    if (!this.canRedo()) return;
    this.history.push(this.game);
    this.jump(this.future.pop(), 'Replayed the decision again.');
  }

  setThreats(on: boolean) { this.showThreats = on; this.render({}); }
  setScore(on: boolean) { this.showScore = on; setPref('showScore', on); this.changed(); }
  tally() { return getTally(this.series); }
  resetScore() { resetTally(this.series); this.changed(); }
}
