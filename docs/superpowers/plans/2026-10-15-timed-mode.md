# Timed Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A per-match "Timed" mode: both players get the same time bank; whoever runs out loses.

**Architecture:** A pure `src/clock.js` (plain-data clock + functions taking `now`). The engine gets a trusted `timeout` action. Online, `server/ws-server.mjs` owns the clock and ends the match; clients mirror a snapshot and count down for display. Bot / face to face run the clock in `GameController`.

**Tech Stack:** plain JS ES modules (engine, server, clock), React 18 + TS (UI), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-15-timed-mode-design.md`

## Global Constraints

- Bank: same for both sides; presets 3 / 5 / 10 min plus free number 1–60 min; `0` = Classic (no clock).
- No increment. Clock runs for `toMove(state)`. Undo/redo disabled in Timed.
- Online Timed only on the WebSocket relay; the capability room (`room.ts`) never offers it.
- Opponent away → my clock pauses; I'm away → my clock keeps running.
- Engine stays deterministic: the clock is never in game state; only `setup.clockMs` (a number) is.
- Commits: caveman-commit style; end each with the trailer `Claude-Session: https://claude.ai/code/session_01SM7ZLDvHQTmxQY76mK6ZJh`. Do not push.

## Review Focus

- Interrupt prompt: the clock must charge the interrupter, not the acting player (Task 1 test).
- Untrusted `timeout` action (tampered client) must be rejected by the engine (Task 2 test).
- Opponent disconnects mid-turn: my clock must not drain; reconnect resumes it (Task 3 test).
- Timeout of the side that is *not* running must never fire (Task 1 test).
- Replay of a match that ended on time must reach the same winner (Task 2 test).

## File Structure

- Create `src/clock.js`: clock data + pure functions.
- Create `test/clock.test.js`, `test/timeout.test.js`, `test/ws-clock.test.js`.
- Modify `src/arena.js` (timeout action, `setup.clockMs`), `src/online.js` (`matchFromConfig` passes `clockMs`).
- Modify `server/ws-server.mjs` (clock per room, `clock` message, pause rule).
- Modify `src/ui/online/ws-room.ts`, `src/ui/online/room.ts` (clock lobby state, `canTime`).
- Modify `src/ui/game/controller.ts` (clock, ticking, timeout, no undo).
- Create `src/ui/components/ClockPicker.tsx`; modify `src/ui/App.tsx`, `src/ui/screens/GameScreen.tsx`, `src/ui/screens/ReplaysScreen.tsx`, `src/ui/theme.css`, `src/ui/changelog.ts`.

---

### Task 1: Clock module

**Files:** Create `src/clock.js`, `test/clock.test.js`

**Interfaces:**
- Produces: `MAX_MIN`, `minutesToMs(m)`, `createClock(ms)`, `remaining(c, side, now)`, `setRunning(c, side|null, now)`, `expired(c, now)` → side|null, `snapshot(c, now)` → `{ms:{p1,p2}, running}`, `fromSnapshot(snap, now)`, `formatClock(ms)`.

- [ ] **Step 1: Write the failing test** — `test/clock.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minutesToMs, createClock, remaining, setRunning, expired, snapshot, fromSnapshot, formatClock,
} from '../src/clock.js';

test('minutesToMs accepts 1-60 whole minutes, anything else is Classic (0)', () => {
  assert.equal(minutesToMs(5), 300000);
  assert.equal(minutesToMs('3'), 180000);
  for (const bad of [0, -1, 61, NaN, 'x', undefined]) assert.equal(minutesToMs(bad), 0);
});

test('only the running side loses time; switching charges the elapsed time', () => {
  let c = createClock(60000);
  assert.equal(remaining(c, 'p1', 0), 60000);
  c = setRunning(c, 'p1', 1000);
  assert.equal(remaining(c, 'p1', 4000), 57000);
  assert.equal(remaining(c, 'p2', 4000), 60000);
  c = setRunning(c, 'p2', 4000);
  assert.equal(remaining(c, 'p1', 9000), 57000, 'p1 stopped');
  assert.equal(remaining(c, 'p2', 9000), 55000);
});

test('expired reports the running side that hit 0, never the idle one', () => {
  let c = setRunning(createClock(1000), 'p2', 0);
  assert.equal(expired(c, 999), null);
  assert.equal(expired(c, 1000), 'p2');
  assert.equal(remaining(c, 'p2', 5000), 0, 'never negative');
  c = setRunning(c, null, 400);
  assert.equal(expired(c, 99999), null, 'paused clock never expires');
});

test('interrupt: the clock follows whoever decides (caller passes toMove), so the actor stops draining', () => {
  let c = setRunning(createClock(10000), 'p1', 0); // p1 acts
  c = setRunning(c, 'p2', 2000); // p2 is asked whether to interrupt
  assert.equal(remaining(c, 'p1', 6000), 8000);
  assert.equal(remaining(c, 'p2', 6000), 6000);
});

test('snapshot round-trips to another timeline', () => {
  const c = setRunning(createClock(10000), 'p1', 100);
  const snap = snapshot(c, 1100);
  assert.deepEqual(snap, { ms: { p1: 9000, p2: 10000 }, running: 'p1' });
  const mirror = fromSnapshot(snap, 50000);
  assert.equal(remaining(mirror, 'p1', 52000), 7000);
});

test('formatClock rounds up to whole seconds as m:ss', () => {
  assert.equal(formatClock(300000), '5:00');
  assert.equal(formatClock(59001), '1:00');
  assert.equal(formatClock(61000), '1:01');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(-5), '0:00');
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test test/clock.test.js` → module not found.

- [ ] **Step 3: Implement** — `src/clock.js`

```js
// Chess-style clock as plain data, so it serializes over the wire and the engine stays
// deterministic (the clock is never part of the game state). Every function takes `now` in
// ms from whatever timeline the caller uses; nothing here reads a real clock.
export const MAX_MIN = 60;
const SIDES = ['p1', 'p2'];

/** Whole minutes 1..MAX_MIN to ms; anything else is 0 = no clock (Classic). */
export function minutesToMs(m) {
  const n = Math.round(Number(m));
  return Number.isFinite(n) && n >= 1 && n <= MAX_MIN ? n * 60000 : 0;
}

export const createClock = (ms) => ({ ms: { p1: ms, p2: ms }, running: null, since: 0 });

export function remaining(c, side, now) {
  const base = c.ms[side];
  return c.running === side ? Math.max(0, base - (now - c.since)) : base;
}

/** Charge the running side up to `now`, then run `side` (null pauses). Returns a new clock. */
export function setRunning(c, side, now) {
  const ms = { ...c.ms };
  if (c.running) ms[c.running] = remaining(c, c.running, now);
  return { ms, running: side, since: now };
}

/** The running side whose bank is empty, else null. */
export function expired(c, now) {
  return SIDES.find((s) => c.running === s && remaining(c, s, now) <= 0) || null;
}

export const snapshot = (c, now) => ({ ms: { p1: remaining(c, 'p1', now), p2: remaining(c, 'p2', now) }, running: c.running });
export const fromSnapshot = (snap, now) => ({ ms: { p1: snap.ms.p1, p2: snap.ms.p2 }, running: snap.running, since: now });

/** m:ss, rounded up so 0:00 only shows when the bank is really empty. */
export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run, expect PASS** — `node --test test/clock.test.js`
- [ ] **Step 5: Commit** — `git add src/clock.js test/clock.test.js && git commit -m "feat(clock): add pure chess-style clock"` (+ trailer)

---

### Task 2: Engine timeout action

**Files:** Modify `src/arena.js` (`createMatch` setup, top of `applyAction`), `src/online.js` (`matchFromConfig`), `src/ui/screens/ReplaysScreen.tsx` (`buildStates`); Create `test/timeout.test.js`

**Interfaces:**
- Consumes: `applyAction(state, action, { trusted })`.
- Produces: action `{ type: 'timeout', team }`; `createMatch({ clockMs })` stores `setup.clockMs`; `matchFromConfig(cfg)` forwards `cfg.clockMs`.

- [ ] **Step 1: Failing test** — `test/timeout.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, applyAction, listActions } from '../src/arena.js';
import { matchFromConfig } from '../src/online.js';

const teams = { p1: ['hasim', 'hexor', 'magumba', 'plantae'], p2: ['genga', 'aqna', 'plantae', 'hasim'] };

test('a trusted timeout ends the match for the other side, and is logged', () => {
  const g = createMatch(teams);
  const res = applyAction(g, { type: 'timeout', team: 'p1' }, { trusted: true });
  assert.equal(res.ok, true);
  assert.equal(res.state.status, 'p2');
  assert.match(res.state.log.at(-1).text, /Ivory ran out of time/);
  assert.equal(res.state.trail.at(-1).type, 'timeout');
  assert.equal(g.status, 'playing', 'input state untouched');
});

test('an untrusted timeout (tampered client) is rejected', () => {
  const g = createMatch(teams);
  const res = applyAction(g, { type: 'timeout', team: 'p2' });
  assert.equal(res.ok, false);
  assert.equal(res.state.status, 'playing');
});

test('a timeout after the match is over, or for a bogus team, is rejected', () => {
  const g = applyAction(createMatch(teams), { type: 'timeout', team: 'p1' }, { trusted: true }).state;
  assert.equal(applyAction(g, { type: 'timeout', team: 'p2' }, { trusted: true }).ok, false);
  assert.equal(applyAction(createMatch(teams), { type: 'timeout', team: 'x' }, { trusted: true }).ok, false);
});

test('a timeout in the middle of an interrupt prompt still ends the match cleanly', () => {
  let g = createMatch(teams);
  g = applyAction(g, listActions(g)[0]).state;
  const res = applyAction(g, { type: 'timeout', team: 'p2' }, { trusted: true });
  assert.equal(res.state.status, 'p1');
  assert.equal(res.state.phase, 'main');
  assert.equal(res.state.pending, null);
});

test('replaying the trail (with the timeout trusted) reaches the same end', () => {
  let g = createMatch(teams);
  g = applyAction(g, listActions(g)[0]).state;
  g = applyAction(g, { type: 'timeout', team: 'p2' }, { trusted: true }).state;
  let r = createMatch(g.setup);
  for (const a of g.trail) r = applyAction(r, a, { trusted: a.type === 'timeout' }).state;
  assert.equal(r.status, g.status);
});

test('setup remembers clockMs; Classic has none', () => {
  assert.equal(matchFromConfig({ ...teams, clockMs: 300000 }).setup.clockMs, 300000);
  assert.equal(matchFromConfig({ ...teams }).setup.clockMs, 0);
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test test/timeout.test.js`.
- [ ] **Step 3: Implement**
  - `createMatch({ p1, p2, map = 'oasis', seed = 0, creeps = true, clockMs = 0 } = {})` and `setup: { p1: teams.p1, p2: teams.p2, map, seed, creeps, clockMs }`.
  - In `src/online.js` `matchFromConfig`: add `clockMs: cfg.clockMs || 0`.
  - At the very top of `applyAction` body (before the `!trusted` validation):

```js
  if (action && action.type === 'timeout') {
    if (!trusted || state.status !== 'playing' || !TEAMS.includes(action.team)) return { ok: false, reason: 'Not allowed.', state };
    const t = clone(state);
    t.trail.push(structuredClone(action));
    t.status = other(action.team); t.phase = 'main'; t.pending = null;
    t.log.push({ turn: t.turn, team: t.status, text: `${TEAM_NAMES[action.team]} ran out of time. ${TEAM_NAMES[t.status]} wins.` });
    return { ok: true, state: t, reason: null };
  }
```
  - `ReplaysScreen.buildStates`: `applyAction(states[states.length - 1], a, { trusted: a.type === 'timeout' })`.
- [ ] **Step 4: Run all** — `node --test test/*.test.js` → PASS (33 + new).
- [ ] **Step 5: Commit** — `feat(engine): add trusted timeout action`.

---

### Task 3: Relay clock (server)

**Files:** Modify `server/ws-server.mjs`; Create `test/ws-clock.test.js`

**Interfaces:**
- Consumes: Task 1 clock functions, Task 2 timeout action.
- Produces (protocol): client→server `{t:'clock', minutes}` (host only; `0` = Classic). `lobby` gains `clockMs`. `start` / `sync` / `move` gain `clock` = `snapshot` (`{ms:{p1,p2},running}`); new server→client `{t:'clock', clock}` when the pause state changes. A timeout is delivered as a normal `{t:'move', action:{type:'timeout',team}, clock}` to **both** sides. Env `CLOCK_UNIT_MS` (default `60000`) is the length of one "minute" (tests use a tiny value).

- [ ] **Step 1: Failing test** — `test/ws-clock.test.js`: spawn `node server/ws-server.mjs` with `PORT=8798 CLOCK_UNIT_MS=100`, connect two `ws` clients, create room, set `{t:'clock', minutes:2}` (= 200 ms), picks (`['hasim','genga','magumba','plantae']`), both ready. Assert:
  1. `start` message has `clock.ms.p1 === 200` and `clock.running === 'p1'`.
  2. Wait 400 ms; both clients received `{t:'move', action:{type:'timeout', team:'p1'}}`.
  3. Second room: p2 leaves right after start → p1's remaining stays ≈200 after 300 ms and `clock.running` is `null` in the `{t:'clock'}` message; p2 rejoining with its token resumes (`running:'p1'`).
  4. A guest sending `{t:'clock', minutes:5}` is ignored (lobby `clockMs` unchanged).
  Kill the server in an `after` hook. (Write it with small helpers `connect()`, `waitFor(ws, pred, ms)`.)
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `ws-server.mjs`:
  - `import { createClock, setRunning, remaining, snapshot, minutesToMs } from '../src/clock.js'; import { toMove ... }` (toMove already imported); `const UNIT = Number(process.env.CLOCK_UNIT_MS) || 60000;` and `const toMs = (m) => minutesToMs(m) / 60000 * UNIT;`.
  - `newRoom`: `clockMs: 0, clock: null, clockTimer: null`.
  - `lobbyMsg`: add `clockMs: room.clockMs`.
  - `handleClock(room, side, msg)`: host (`p1`) only, `room.clockMs = toMs(msg.minutes)`, `broadcastLobby`.
  - `maybeStart`: pass `clockMs: room.clockMs` to `matchFromConfig`; after setting `room.game`: `startClock(room)`; include `clock: clockSnap(room)` in each `start` message.
  - Helpers:
    - `clockSnap(room)` → `room.clock ? snapshot(room.clock, Date.now()) : null`.
    - `runClock(room)`: if no `room.clock` return; `const t = room.game.status === 'playing' ? toMove(room.game) : null; const away = t && !room.seats[other(t)].connected; room.clock = setRunning(room.clock, t && !away ? t : null, Date.now()); arm(room)`.
    - `arm(room)`: clear `room.clockTimer`; if `room.clock.running`, `setTimeout(() => timeout(room), remaining(room.clock, running, Date.now()))`.
    - `timeout(room)`: if game not playing return; `const team = room.clock.running; if (!team) return; const action = {type:'timeout', team}; const res = applyAction(room.game, action, {trusted:true}); room.game = res.state; room.clock = setRunning(room.clock, null, Date.now()); broadcast `{t:'move', action, clock}` to connected seats; `afterMatchEnds(room)`.
  - `handleAction`: after applying, `runClock(room)`; `move` message to opponent carries `clock: clockSnap(room)`. If the clock is `null` (Classic) nothing changes.
  - `handleHello` mid-match: `runClock(room)` first (the returning player un-pauses the opponent's clock), `sync` carries `clock`; also `send(opponentWs, {t:'clock', clock})` so the other side sees `running` resume.
  - `ws.on('close')` during a game: `runClock(room)` then `send` `{t:'clock', clock}` to the remaining seat (the existing `opponent` message stays).
  - Clear `room.clockTimer` when the room is deleted (in the cleanup callback) and when a new match starts.
- [ ] **Step 4: Run** `node --test test/ws-clock.test.js test/*.test.js` → PASS.
- [ ] **Step 5: Commit** — `feat(server): server-authoritative match clock`.

---

### Task 4: Client room (ws-room, capability room)

**Files:** Modify `src/ui/online/ws-room.ts`, `src/ui/online/room.ts`

**Interfaces:**
- Consumes: Task 3 protocol.
- Produces on both room classes: `canTime: boolean` (`true` only in `WsRoomClient`), `clockMin: number`, `setClock(min: number): void`. `onStart: (game, fresh, clock?: Snapshot|null) => void`. `WsRoomClient.config()` result unchanged (server builds the match).

- [ ] **Step 1:** `ws-room.ts`: add `canTime = true; clockMin = 0;` `setClock(min) { if (this.side !== 'p1') return; this.clockMin = min; this.send({ t: 'clock', minutes: min }); this.changed(); }`. In the `lobby` handler: `this.clockMin = Math.round((msg.clockMs || 0) / 60000)`. NOTE: with `CLOCK_UNIT_MS` ≠ 60000 the display would be off; production uses the default, so convert with `60000` only.
- [ ] **Step 2:** `start` → `this.onStart?.(msg.game, msg.fresh, msg.clock || null)`; `sync` → `if (this.controller) { this.controller.setGame(msg.game); this.controller.setClock(msg.clock || null); ... } else this.onStart?.(msg.game, false, msg.clock || null)`; `move` → `this.controller?.commit(msg.action, 'remote'); this.controller?.setClock(msg.clock || null)`; new `clock` message → `this.controller?.setClock(msg.clock || null)`.
- [ ] **Step 3:** `room.ts`: add `canTime = false; clockMin = 0; setClock(_min: number) {}` and widen `onStart` to `(game: any, fresh: boolean, clock?: any) => void` (the capability room never passes a clock).
- [ ] **Step 4:** `npm run typecheck` — will fail until Task 5 adds `controller.setClock`; do Tasks 4 and 5 together and run the check at the end of Task 5.
- [ ] **Step 5:** Commit together with Task 5.

---

### Task 5: Controller clock

**Files:** Modify `src/ui/game/controller.ts`

**Interfaces:**
- Consumes: Task 1 clock functions, Task 2 timeout action.
- Produces: `controller.clock: Clock | null`, `controller.timed(): boolean`, `controller.timeLeft(team): number`, `controller.setClock(snap|null)`, `controller.timedOut(): Team | null` (the loser, when the match ended on time).

- [ ] **Step 1:** imports `import { createClock, setRunning, remaining, expired, fromSnapshot } from '../../clock.js';`. Fields: `clock: any = null; private tickTimer: ReturnType<typeof setInterval> | null = null;`.
- [ ] **Step 2:** constructor: `if (game.setup?.clockMs > 0 && mode.kind !== 'online') { this.clock = setRunning(createClock(game.setup.clockMs), toMove(game), performance.now()); }`. Then `this.startTick()` when `game.setup?.clockMs > 0`.
- [ ] **Step 3:** methods

```ts
  timed() { return (this.game.setup?.clockMs || 0) > 0; }
  timeLeft(team: Team) { return this.clock ? remaining(this.clock, team, performance.now()) : 0; }
  /** Online: adopt the server's snapshot (null = Classic or unknown). */
  setClock(snap: any) { this.clock = snap ? fromSnapshot(snap, performance.now()) : null; this.changed(); }
  timedOut(): Team | null {
    const last = this.game.trail?.[this.game.trail.length - 1];
    return this.game.status !== 'playing' && last?.type === 'timeout' ? last.team : null;
  }
  private startTick() {
    if (this.tickTimer || !this.timed()) return;
    this.tickTimer = setInterval(() => {
      if (this.game.status !== 'playing' || !this.clock) return;
      const out = expired(this.clock, performance.now());
      if (out && this.mode.kind !== 'online') this.commit({ type: 'timeout', team: out }); // online: the server decides
      else this.changed();
    }, 250);
  }
```
- [ ] **Step 4:** `commit()`: `const res = applyAction(this.game, action, { trusted: action.type === 'timeout' });` After `this.game = res.state;` add `if (this.clock) this.clock = setRunning(this.clock, this.game.status === 'playing' ? toMove(this.game) : null, performance.now());`. `setGame(game)`: when a clock exists and not online, `this.clock = setRunning(this.clock, toMove(game), performance.now())`. `destroy()` (find it; it already exists) also `clearInterval(this.tickTimer)`.
- [ ] **Step 5:** `canUndo()` / `canRedo()` start with `!this.timed() &&`.
- [ ] **Step 6:** `App.tsx` `room.onStart = (game, fresh, clock) => ...` call `c.setClock(clock ?? null)` before `setCtrl` returns `c`; `startLocal` passes `clockMs` (Task 6). Run `npm run typecheck` and `node --test test/*.test.js` → PASS.
- [ ] **Step 7: Commit** — `feat(ui): match clock in controller and rooms`.

---

### Task 6: Setup UI (ClockPicker)

**Files:** Create `src/ui/components/ClockPicker.tsx`; Modify `src/ui/App.tsx`, `src/ui/theme.css`

**Interfaces:**
- Produces: `<ClockPicker minutes={number} onChange={(m:number)=>void} readOnly?: boolean />` — `0` = Classic.

- [ ] **Step 1:** `ClockPicker.tsx`:

```tsx
import { useState } from 'react';
import { MAX_MIN } from '../../clock.js';

const PRESETS = [3, 5, 10];

/** Classic (no clock) or a shared time bank per player, in whole minutes. */
export function ClockPicker({ minutes, onChange, readOnly }: { minutes: number; onChange: (m: number) => void; readOnly?: boolean }) {
  const [text, setText] = useState(PRESETS.includes(minutes) || !minutes ? '' : String(minutes));
  const custom = minutes > 0 && !PRESETS.includes(minutes);
  const commit = (v: string) => {
    setText(v);
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 1 && n <= MAX_MIN) onChange(n);
  };
  return (
    <div className="clockpicker">
      <h3>Time</h3>
      <div className="clock-opts" role="group" aria-label="Time per player">
        <button type="button" className="btn" aria-pressed={minutes === 0} disabled={readOnly} onClick={() => onChange(0)}>Classic · no clock</button>
        {PRESETS.map((m) => (
          <button key={m} type="button" className="btn" aria-pressed={minutes === m} disabled={readOnly} onClick={() => { setText(''); onChange(m); }}>{m} min</button>
        ))}
        <label className={`clock-custom${custom ? ' on' : ''}`}>
          <input type="number" inputMode="numeric" min={1} max={MAX_MIN} placeholder="Other" value={custom && !text ? String(minutes) : text}
            disabled={readOnly} onChange={(e) => commit(e.target.value)} aria-label={`Custom minutes, 1 to ${MAX_MIN}`} />
          <span>min</span>
        </label>
      </div>
      <p className="note">{minutes ? `Each player gets ${minutes} min in total. Run out of time and you lose; undo is off.` : 'No clock. A match can run as long as the players like.'}</p>
    </div>
  );
}
```
- [ ] **Step 2:** `App.tsx`: `import { ClockPicker } ...`, `const [clockMin, setClockMin] = useState<number>(pref('clockMin', 0));` + `useEffect(() => setPref('clockMin', clockMin), [clockMin])`. `startLocal`: `matchFromConfig({ ..., clockMs: clockMin * 60000 })`. In the `map` step, after `<MapPicker .../>`: `{(kind !== 'online' || r.canTime) && <ClockPicker minutes={kind === 'online' ? r.clockMin : clockMin} readOnly={kind === 'online' && r.side === 'p2'} onChange={(m) => (kind === 'online' ? r.setClock(m) : setClockMin(m))} />}`. The hint text above for guests: extend the existing note to "picks the battlefield and the time".
- [ ] **Step 3:** `theme.css`: `.clockpicker { margin-top: 14px } .clock-opts { display:flex; flex-wrap:wrap; gap:8px } .btn[aria-pressed="true"]` reuse existing pressed style if present; `.clock-custom { display:inline-flex; align-items:center; gap:6px } .clock-custom input { width: 5.5ch; background: var(--panel-hi); color: var(--bone); border:1px solid var(--line-hi); border-radius:2px; padding: 8px } .clock-custom.on input { border-color: var(--sand) }`.
- [ ] **Step 4:** `npm run typecheck` PASS. Commit — `feat(ui): pick match time in setup`.

---

### Task 7: In-game clocks and result

**Files:** Modify `src/ui/screens/GameScreen.tsx`, `src/ui/theme.css`, `src/ui/components/Rules.tsx` (one line)

- [ ] **Step 1:** `GameScreen.tsx`: add component

```tsx
function Clock({ c, team }: { c: GameController; team: Team }) {
  if (!c.timed() || !c.clock) return null;
  const ms = c.timeLeft(team);
  const running = c.clock.running === team && c.game.status === 'playing';
  return <span className={`clock${running ? ' running' : ''}${ms < 30000 ? ' low' : ''}`} aria-label={`${TEAM_NAMES[team]} time left`}>{formatClock(ms)}</span>;
}
```
  import `formatClock` from `../../clock.js`. Render `<Clock c={c} team={team} />` inside `Tokens` (after `.tn`), so it appears in the status bar and in each seat.
- [ ] **Step 2:** `statusFor` when over: if `c.timedOut()`, append: online/bot `You win on time` / `You lose on time`; bot `The bot wins on time`; face to face `${TEAM_NAMES[g.status]} wins on time` (use the existing branches and add ` on time`). The overlay `<p>`: when `c.timedOut()`, show `${TEAM_NAMES[c.timedOut()!]} ran out of time` instead of the "no heroes left" line.
- [ ] **Step 3:** `theme.css`: `.clock { font-family: var(--f-mono); font-weight:600; font-variant-numeric: tabular-nums; margin-left: 6px; color: var(--muted) } .clock.running { color: var(--bone) } .clock.low { color: var(--blood) } .clock.low.running { animation: clockpulse 1s ease-in-out infinite } @keyframes clockpulse { 50% { opacity: .45 } }`. Check at 360px width that `.tokens` does not overflow (the pips already shrink); if it does, hide `.who` on `.statusbar .clock`-bearing tokens at `max-width: 480px`.
- [ ] **Step 4:** `Rules.tsx`: add one line describing Classic vs Timed.
- [ ] **Step 5:** `npm run typecheck && npm run build` PASS. Commit — `feat(ui): show match clocks and time-out result`.

---

### Task 8: Verify, changelog, finish

**Files:** Modify `src/ui/changelog.ts`

- [ ] **Step 1:** Add v0.5.0 (2026-10-15, "Timed mode") at the top of `CHANGELOG`: `new` — "Timed mode: pick a time per player (3, 5, 10 minutes or your own). Whoever runs out of time loses."; `new` — "Online: the server keeps the clock. It pauses while your opponent is disconnected."; `balance` — "Undo is off in Timed matches."
- [ ] **Step 2:** `npm test && npm run typecheck && npm run build` — all PASS.
- [ ] **Step 3:** Start `npm run dev` and `PORT=8787 VITE_WS_URL=ws://localhost:8787 npm run dev -- --port 5174` + `node server/ws-server.mjs`; in a browser: bot match at 1 min (clock ticks, low-time red, timeout ends the match "on time"), face to face, and two tabs online (host sets time, guest sees it read-only, disconnect pauses). Record anything off.
- [ ] **Step 4:** Commit — `feat: add Timed mode to changelog`. Do not push; report to the user.
