// Game controller: owns the match state, selection, bot turns and history, and drives the
// board. React subscribes to it for the panels. Rules stay in src/engine/.
import {
  applyAction,
  validateAction,
  listActions,
  getThreats,
  unitAt,
  samePos,
  toMove,
  label,
  HEROES,
  PHASES,
  skillActions,
  skillOf,
  moveOptions,
  squareName,
  heroDef,
} from '../../engine/index.ts';
import { chooseAction } from '../../engine/bot.ts';
import { actionIndex } from '../../online.ts';
import { createBoard } from './board.ts';
import { FREEZE_MS, SPAWN_MS } from './effects.ts';
import { tk, pref, setPref, type Team } from '../data';
import { addResult, getTally, resetTally, sideA } from '../record';
import { saveReplay } from '../replays';
import { sfx, type SfxName } from '../audio';
import { sfxFor } from '../../sfx-map.ts';
import { createClock, setRunning, remaining, expired, fromSnapshot } from '../../clock.ts';
import type { Clock, ClockSnapshot } from '../../clock.ts';
import type { Action, Pos, State } from '../../engine/index.ts';

export type Mode =
  | { kind: 'bot'; level: 'easy' | 'normal' | 'hard'; side: Team }
  | { kind: 'local' }
  | { kind: 'online'; side: Team; onLocalMove: (index: number, action: Action) => void };

export type Source = 'me' | 'bot' | 'remote';

/** The beast's stride, picked on its first move and kept all match: 1 square any way, or up to 2 straight or diagonal. */
export type BeastPattern = 'any' | 'plus' | 'cross';
const BEAST_PATTERN_TEXT: Record<BeastPattern, string> = {
  any: 'The beast will move 1 square in any direction, all match: tap a marked square.',
  plus: 'The beast will move up to 2 squares straight, all match: tap a marked square.',
  cross: 'The beast will move up to 2 squares diagonally, all match: tap a marked square.',
};

const BOT_DELAY_MS = 520;

export class GameController {
  game: State;
  mode: Mode;
  selectedId: string | null = null;
  armed = false;
  msg = '';
  msgKind: '' | 'ok' | 'err' = '';
  showThreats = true;
  showScore: boolean = pref('showScore', true);
  /** How the selected beast moves this time; null until the player picks. */
  beastPattern: BeastPattern | null = null;
  /** Which series this match counts toward (set by the app); '' = not counted. */
  series = '';
  private recorded = false;
  history: State[] = [];
  future: State[] = [];
  version = 0;
  /** True while the online opponent is connected (set by the room client). */
  peerHere = true;
  peerLeft = false;
  /** Online: this screen's own connection to the server is down (reconnecting). */
  selfOffline = false;
  private board: ReturnType<typeof createBoard> | null = null;
  private listeners = new Set<() => void>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private gen = 0;

  /** Match clock (Timed mode), or null for Classic. Online it mirrors the server's snapshot. */
  clock: Clock | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(mode: Mode, game: State) {
    this.mode = mode;
    this.game = game;
    if (this.timed()) {
      if (mode.kind !== 'online')
        this.clock = setRunning(createClock(game.setup.clockMs), toMove(game), performance.now());
      this.startTick();
    }
  }

  // ---------- match clock ----------
  timed() {
    return (this.game.setup?.clockMs || 0) > 0;
  }
  timeLeft(team: Team) {
    return this.clock ? remaining(this.clock, team, performance.now()) : 0;
  }
  /** Online: adopt the server's snapshot (null = Classic or unknown). */
  setClock(snap: ClockSnapshot | null) {
    this.clock = snap ? fromSnapshot(snap, performance.now()) : null;
    this.changed();
  }
  /** The side that lost because its time ran out, if that is how the match ended. */
  timedOut(): Team | null {
    const last = this.game.trail?.[this.game.trail.length - 1];
    return this.game.status !== 'playing' && last?.type === 'timeout' ? (last.team ?? null) : null;
  }
  private startTick() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      if (this.game.status !== 'playing' || !this.clock) return;
      const out = expired(this.clock, performance.now());
      if (out && this.mode.kind !== 'online')
        this.commit({ type: 'timeout', team: out }); // online: the server decides
      else this.changed();
    }, 250);
  }

  // ---------- subscription (useSyncExternalStore) ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }

  // ---------- who decides ----------
  humanTeams(): Team[] {
    if (this.mode.kind === 'online') return [this.mode.side];
    if (this.mode.kind === 'bot') return [this.mode.side];
    return ['p1', 'p2'];
  }
  decider(): Team | null {
    return this.game.status === 'playing' ? toMove(this.game) : null;
  }
  deciderIsHuman() {
    const d = this.decider();
    return !!d && this.humanTeams().includes(d);
  }
  deciderIsBot() {
    return this.mode.kind === 'bot' && this.decider() === this.botTeam();
  }
  botTeam(): Team | null {
    return this.mode.kind === 'bot' ? (this.mode.side === 'p1' ? 'p2' : 'p1') : null;
  }
  /** The side whose player sits at the bottom of the screen (board turned for Ember). */
  viewer(): Team {
    return this.mode.kind === 'local' ? 'p1' : this.mode.side;
  }

  // ---------- board ----------
  attach(host: HTMLElement, intro = true) {
    this.board = createBoard(host, {
      onCell: (pos: Pos) => this.onCell(pos),
      onPress: (pos: Pos) => this.onPress(pos),
      onDrop: (id: string, pos: Pos) => this.onDrop(id, pos),
      flip: this.viewer() === 'p2',
      facing: this.mode.kind === 'local',
    });
    this.render({});
    if (intro) this.board.intro(this.game);
    this.maybeBot();
  }
  detach() {
    this.cancelBot();
    this.board?.destroy();
    this.board = null;
  }
  destroy() {
    this.detach();
    this.listeners.clear();
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private render(extra: { deathDelay?: number; hits?: Pos[] }) {
    const g = this.game;
    const sel = this.selectedId ? g.units[this.selectedId] : null;
    const live = sel && sel.alive ? sel : null;
    const threats = this.showThreats && g.status === 'playing' ? getThreats(g, g.current) : new Set<string>();
    const acts = this.deciderIsHuman() ? this.gate(listActions(g)) : [];
    // face to face both sides are human: only the side to move counts as "own"
    const ownReach =
      !!live && this.humanTeams().includes(live.team) && (this.mode.kind !== 'local' || live.team === g.current);
    this.board?.render(g, { acts, live, armed: this.armed, threats, ownReach, ...extra });
    this.changed();
    this.maybeBot();
  }
  refresh() {
    this.render({});
  }

  say(text: string, kind: '' | 'ok' | 'err' = '') {
    this.msg = text;
    this.msgKind = kind;
    if (kind === 'err') sfx('error');
  }
  clearSel() {
    this.selectedId = null;
    this.armed = false;
    this.beastPattern = null;
  }

  // ---------- the beast's first move: the player first picks how it moves (once per match) ----------
  /** True while the selected beast, before its first move, may move and the player still has to pick its pattern. */
  needsBeastPattern() {
    const g = this.game;
    const sel = this.selectedId ? g.units[this.selectedId] : null;
    return (
      !!sel &&
      !!heroDef(sel).strides &&
      !sel.stride &&
      !this.beastPattern &&
      this.deciderIsHuman() &&
      listActions(g).some((action) => action.type === 'move' && action.unitId === sel.id)
    );
  }
  pickBeastPattern(pattern: BeastPattern) {
    this.beastPattern = pattern;
    this.say(BEAST_PATTERN_TEXT[pattern]);
    this.render({});
  }
  /** Before the beast's first move, only the moves of the stride picked show (and count); everything else passes. */
  private gate(acts: Action[]) {
    return acts.filter((action) => !action.pattern || action.type !== 'move' || action.pattern === this.beastPattern);
  }

  // ---------- decisions ----------
  /** Apply a decision. `src`: 'me' (this screen), 'bot', or 'remote' (online opponent). */
  commit(action: Action, src: Source = 'me'): boolean {
    const online = this.mode.kind === 'online';
    const idx = online && src === 'me' ? actionIndex(this.game, action) : -1;
    const res = applyAction(this.game, action, { trusted: action.type === 'timeout' });
    if (!res.ok) {
      this.say(res.reason || 'Not allowed.', 'err');
      this.render({});
      return false;
    }
    const before = this.game;
    if (src === 'me' && !online) {
      this.history.push(before);
      this.future = [];
    }
    if (online && src === 'me') if (this.mode.kind === 'online') this.mode.onLocalMove(idx, action);
    this.game = res.state;
    if (this.clock)
      this.clock = setRunning(this.clock, this.game.status === 'playing' ? toMove(this.game) : null, performance.now());
    this.clearSel();
    const g = this.game;
    const newLines = g.log
      .slice(before.log.length)
      .map((entry) => entry.text)
      .join(' ');
    if (newLines) this.say((src === 'bot' ? 'Bot: ' : src === 'remote' ? 'Opponent: ' : '') + newLines, 'ok');
    else if (g.phase === 'react') this.say(`${label(g.units[g.pending!.reactorId!])} can interrupt this action.`);
    this.playSound(before, g, src);
    const plan = this.board?.plan(before, g);
    const hits = g.lastAction && g.lastAction !== before.lastAction ? g.lastAction.hits || [] : [];
    // a follow-up move of one unit (the beast, Aqna after her ice): select it so its squares show
    if ((g.phase === 'beast' || g.phase === 'icewalk') && this.deciderIsHuman())
      this.selectedId = g.pending?.unitId ?? null;
    this.render({ deathDelay: plan?.deathDelay ?? 0, hits });
    if (this.board && plan) {
      if (plan.hop) this.board.hop(plan.hop);
      this.board.run(plan);
      const broke = g.lastAction !== before.lastAction && g.lastAction?.kind === 'shieldbreak' ? g.lastAction : null;
      if (broke?.unitId && broke.broke?.length) {
        // the attack lunges at the shield and is thrown back
        const target = g.units[broke.broke[0]];
        this.board.shieldBounce({ attackerId: broke.unitId, from: broke.from!, targetId: target.id, to: target.pos });
      }
      if (before.status === 'playing' && g.status !== 'playing') this.board.victory(g, g.status);
    }
    if (before.status === 'playing' && g.status !== 'playing' && !this.recorded) {
      this.recorded = true; // an undo and a second finish don't count twice
      if (this.series) addResult(this.series, g.status === sideA(this.mode.kind, this.viewer()));
      const m = this.mode;
      saveReplay({
        kind: m.kind,
        viewer: this.viewer(),
        winner: g.status,
        setup: g.setup,
        trail: g.trail,
        label:
          m.kind === 'bot'
            ? `vs Bot · ${m.level[0].toUpperCase()}${m.level.slice(1)}`
            : m.kind === 'local'
              ? 'Face to face'
              : 'Online',
      });
    }
    return true;
  }

  /** The sound of what just happened, then the end-of-match fanfare, then a chime when it is the player's turn. */
  private playSound(before: State, after: State, src: Source) {
    const fresh = after.lastAction && after.lastAction !== before.lastAction ? after.lastAction : null;
    sfx(sfxFor(fresh, after.units) as SfxName | null);
    const killed = Object.values(before.units).some((unit) => unit.alive && !after.units[unit.id]?.alive);
    if (fresh?.kind === 'backstab' && killed) window.setTimeout(() => sfx('slash'), 220); // his blade lands
    // the frost holds the enemy for as long as it sounds, then the ice (and the enemy) shatters
    if (fresh?.kind === 'ice' && fresh.frozen) window.setTimeout(() => sfx('shatter'), FREEZE_MS);
    else if (fresh?.kind === 'ice' && fresh.broke?.length)
      window.setTimeout(() => sfx('shield'), 260); // the shield takes it
    else if (fresh?.movedIce) window.setTimeout(() => sfx('shatter'), 120); // her oldest block breaks to make room
    if (fresh?.breach) {
      window.setTimeout(() => sfx('rune'), 320); // +1 rune
      if (fresh.respawned) window.setTimeout(() => sfx('spawn'), SPAWN_MS - 250); // a new creep is called in
    }
    if (fresh?.kind === 'summon' && killed) window.setTimeout(() => sfx('capture'), 300); // the beast lands on an enemy
    if (before.status === 'playing' && after.status !== 'playing') {
      const mine = this.mode.kind === 'local' ? null : after.status === this.viewer();
      window.setTimeout(() => sfx(mine === null ? 'victory' : mine ? 'victory' : 'defeat'), 420);
    } else if (src !== 'me' && this.deciderIsHuman() && after.phase === 'main') {
      window.setTimeout(() => sfx('turn'), 360);
    }
  }

  /** Replace the match without effects (online catch-up). */
  setGame(game: State) {
    this.game = game;
    if (this.clock && this.mode.kind !== 'online')
      this.clock = setRunning(this.clock, game.status === 'playing' ? toMove(game) : null, performance.now());
    this.clearSel();
    this.board?.reset();
    this.render({});
  }

  private maybeBot() {
    if (!this.deciderIsBot() || this.botTimer) return;
    const myGen = this.gen;
    const level = this.mode.kind === 'bot' ? this.mode.level : 'normal';
    this.botTimer = setTimeout(
      () => {
        this.botTimer = null;
        if (myGen !== this.gen || !this.deciderIsBot()) return;
        const pick = chooseAction(this.game, level);
        if (pick?.action) this.commit(pick.action, 'bot');
      },
      this.game.phase === 'main' ? BOT_DELAY_MS : 420,
    );
  }
  cancelBot() {
    this.gen++;
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  onCell(pos: Pos) {
    const g = this.game;
    if (g.status !== 'playing' || !this.deciderIsHuman()) {
      const u = unitAt(g, pos);
      if (g.status !== 'playing') return;
      if (u && u.id !== this.selectedId)
        this.select(u.id); // inspect while waiting
      else this.escape(); // the same piece again, or an empty square: put it down
      return;
    }
    const acts = this.gate(listActions(g));
    const occupant = unitAt(g, pos);
    if (this.needsBeastPattern() && occupant?.id !== this.selectedId) {
      this.say('First choose how the beast moves: 1 square any way, 2 straight, or 2 diagonal.', 'err');
      this.render({});
      return;
    }
    if (g.phase === 'react') return;
    const phase = PHASES[g.phase];
    if (phase) {
      // a follow-up (ice, the beast's step, a slam, a second creep): a tap picks one of its squares
      const chosen = this.selectedId;
      const a =
        acts.find((action) => action.to && samePos(action.to, pos) && (!chosen || action.unitId === chosen)) ||
        acts.find((action) => action.to && samePos(action.to, pos));
      if (a) {
        this.commit(a);
        return;
      }
      // a phase with several units to choose from (the opening's second creep): a tap picks the unit first
      if (occupant && acts.some((action) => action.unitId === occupant.id)) {
        if (this.selectedId === occupant.id) this.escape();
        else this.select(occupant.id);
        return;
      }
      this.say(phase.hint || 'Decide, or Skip.', 'err');
      this.render({});
      return;
    }

    const sel = this.selectedId ? g.units[this.selectedId] : null;
    if (this.armed && sel) {
      const a = acts.find(
        (action) =>
          action.type === 'skill' &&
          action.unitId === sel.id &&
          (action.to ? samePos(action.to, pos) : occupant && action.targetId === occupant.id),
      );
      if (a) {
        this.commit(a);
        return;
      }
      const sk = skillOf(sel)!;
      const aims = HEROES[sel.hero].ui?.targets;
      if (occupant && occupant.team === sel.team && occupant.id !== sel.id && aims !== 'ally') {
        this.select(occupant.id);
        return;
      }
      if (occupant && occupant.id === sel.id) {
        // the caster again, and not a target of its own skill: put it down
        this.clearSel();
        this.say(`${sk.name} cancelled.`);
        this.render({});
        return;
      }
      if (occupant && aims !== 'square') {
        this.say(
          validateAction(g, { type: 'skill', unitId: sel.id, skill: sk.key, targetId: occupant.id }).reason || '',
          'err',
        );
        this.render({});
        return;
      }
      this.armed = false;
      this.say(`${sk.name} cancelled.`);
      this.render({});
      return;
    }
    if (
      sel &&
      sel.team === g.current &&
      acts.some((action) => action.type === 'move' && action.unitId === sel.id && samePos(action.to!, pos))
    ) {
      this.commit(
        acts.find((action) => action.type === 'move' && action.unitId === sel.id && samePos(action.to!, pos))!,
      );
      return;
    }
    if (
      sel &&
      sel.rooted &&
      sel.team === g.current &&
      g.phase === 'main' &&
      moveOptions(g, sel).some((option) => samePos(option.to, pos))
    ) {
      this.board?.rootTug({ unitId: sel.id, from: sel.pos, to: pos });
      this.say(
        `${label(sel)} strains toward ${squareName(pos)}, but the roots drag it back: it can't act this turn.`,
        'err',
      );
      this.render({});
      return;
    }
    if (occupant) {
      if (this.selectedId === occupant.id) {
        this.clearSel();
        this.say('');
        this.render({});
        return;
      }
      this.select(occupant.id);
      return;
    }
    if (sel && sel.team === g.current && sel.kind === 'hero') {
      this.say(validateAction(g, { type: 'move', unitId: sel.id, to: pos }).reason || '', 'err');
      this.render({});
      return;
    }
    this.clearSel();
    this.say('');
    this.render({});
  }

  /** A press on a piece that can move now: lift it (select, showing its squares). */
  onPress(pos: Pos): { id: string; fresh: boolean } | null {
    const g = this.game;
    if (g.status !== 'playing' || !this.deciderIsHuman() || this.armed) return null;
    if (g.phase !== 'main' && !PHASES[g.phase]?.unitPhase) return null;
    const u = unitAt(g, pos);
    if (!u || !listActions(g).some((action) => action.type === 'move' && action.unitId === u.id)) return null;
    // a beast still to pick its stride: no lifting yet (the tap selects it and the stride chooser opens)
    if (heroDef(u).strides && !u.stride && (!this.beastPattern || this.selectedId !== u.id)) return null;
    const fresh = this.selectedId !== u.id;
    if (fresh) this.select(u.id);
    return { id: u.id, fresh };
  }

  /** A lifted piece released on `pos`. True when it moved there. */
  onDrop(id: string, pos: Pos): boolean {
    const g = this.game;
    const a = this.gate(listActions(g)).find(
      (action) => action.type === 'move' && action.unitId === id && samePos(action.to!, pos),
    );
    if (a) return this.commit(a);
    this.say(validateAction(g, { type: 'move', unitId: id, to: pos }).reason || 'That square is out of reach.', 'err');
    this.render({});
    return false;
  }

  select(id: string) {
    const g = this.game;
    if (id !== this.selectedId) this.beastPattern = null;
    this.selectedId = id;
    this.armed = false;
    const u = g.units[id];
    if (u.team !== g.current)
      this.say(this.humanTeams().includes(u.team) ? `${label(u)} acts on its own turn.` : `Enemy unit: ${label(u)}.`);
    else if (u.kind === 'beast' && u.moved && g.phase !== 'beast')
      this.say("The beast only acts right after Ge'nga.", 'err');
    else if (u.kind === 'beast' && !u.moved && g.phase === 'main')
      this.say("The beast hasn't moved yet: it may take one step on its own as your turn.");
    else if (u.rooted) this.say(`${label(u)} is held by roots this turn.`, 'err');
    else this.say('');
    this.render({});
  }

  armSkill() {
    const g = this.game;
    const u = this.selectedId ? g.units[this.selectedId] : null;
    if (!u || u.kind !== 'hero' || g.phase !== 'main' || !this.deciderIsHuman() || u.team !== g.current) return;
    const sk = skillOf(u)!;
    const ui = HEROES[u.hero].ui;
    if (sk.type !== 'active') {
      this.say(`${sk.name} is passive: it triggers on its own.`);
      this.render({});
      return;
    }
    if (this.armed) {
      this.armed = false;
      this.say('Skill cancelled.');
      this.render({});
      return;
    }
    if (u.rooted) {
      this.say(`${label(u)} is held by roots this turn.`, 'err');
      this.render({});
      return;
    }
    if (g.energy[u.team] < sk.cost) {
      this.say(`${sk.name} needs ${tk(sk.cost)}; you have ${g.energy[u.team]}.`, 'err');
      this.render({});
      return;
    }
    if (!skillActions(g, u).length) {
      this.say(ui?.unavailable?.(g, u).text ?? `${sk.name} has no valid target in range.`, 'err');
      this.render({});
      return;
    }
    this.armed = true;
    this.say(ui?.aim ?? `${sk.name}: tap a highlighted ${ui?.targets === 'ally' ? 'ally' : 'enemy'}.`);
    this.render({});
  }

  skip() {
    if (this.deciderIsHuman()) this.commit({ type: 'skip' });
  }
  slam(pattern: 'plus' | 'x') {
    if (this.deciderIsHuman() && this.game.phase === 'storm') this.commit({ type: 'storm', pattern });
  }
  react(use: boolean) {
    if (this.deciderIsHuman() && this.game.phase === 'react') this.commit({ type: 'react', use });
  }
  escape() {
    if (this.armed) this.armed = false;
    else this.clearSel();
    this.say('');
    this.render({});
  }

  canUndo() {
    return this.mode.kind !== 'online' && !this.timed() && this.history.length > 0 && !this.deciderIsBot();
  }
  canRedo() {
    return this.mode.kind !== 'online' && !this.timed() && this.future.length > 0 && !this.deciderIsBot();
  }
  private jump(to: State, note: string) {
    this.cancelBot();
    this.board?.clearFx();
    this.game = to;
    this.board?.reset();
    this.clearSel();
    this.say(note);
    this.render({});
  }
  undo() {
    if (!this.canUndo()) return;
    this.future.push(this.game);
    this.jump(
      this.history.pop()!,
      this.mode.kind === 'bot' ? "Took back your last decision and the bot's reply." : 'Took back the last decision.',
    );
  }
  redo() {
    if (!this.canRedo()) return;
    this.history.push(this.game);
    this.jump(this.future.pop()!, 'Replayed the decision again.');
  }

  setThreats(on: boolean) {
    this.showThreats = on;
    this.render({});
  }
  setScore(on: boolean) {
    this.showScore = on;
    setPref('showScore', on);
    this.changed();
  }
  tally() {
    return getTally(this.series);
  }
  resetScore() {
    resetTally(this.series);
    this.changed();
  }
}
