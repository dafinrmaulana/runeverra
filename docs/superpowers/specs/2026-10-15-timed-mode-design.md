# Timed mode — design

## Goal
Late-game deadlock: the only win is eliminating every enemy hero, so two defensive players can stall forever. Timed mode ends every match: each player has the same time bank, and whoever runs out loses.

Scope: **Timed mode only.** The smaller (7×7) map mode is deferred. Classic stays exactly as it is; Timed is a per-match choice, not a baked-in rule.

## Rules
- Both players get the **same bank**, agreed in setup. Presets 3 / 5 / 10 min plus a free number, 1–60 min. **No increment** (an increment would let two players shuffle forever).
- The clock runs for whoever is deciding (`toMove`). During an interrupt prompt it runs for the interrupter, not the acting player.
- Bank at 0 → that player loses ("ran out of time"). Counts as a win in the series tally.
- Undo / redo are disabled in Timed (otherwise time could be bought back).
- Animations do not pause the clock; it switches when a decision is committed.
- Face to face and bot: client-side clock. Bot clock runs but the bot moves fast.
- Online: **server-authoritative**, only on the WebSocket relay. The Claude-artifact room capability is peer-trust with no authority, so Timed is disabled there.
- Disconnect: if the **opponent** is away, my clock pauses. If **I** am away, my clock keeps running (prevents freezing the clock by disconnecting).

## Components
1. `src/clock.js` — pure functions, no DOM, tested with `node:test`.
   `createClock(ms)`, `startClock(clock, side, now)`, `switchTo(clock, side, now)`, `pause(clock, now)`, `remaining(clock, side, now)`, `expired(clock, now)`.
   State is plain data `{ ms: {p1,p2}, running: 'p1'|'p2'|null, since }` so it serializes over the wire.
2. `src/arena.js` — new trusted action `{ type: 'timeout', team }` handled in `applyAction(..., { trusted: true })`. Sets `status` to the other team, logs "<Team> ran out of time.", pushes to `trail`. `validateAction` still rejects it from untrusted callers. Replay (`ReplaysScreen.buildStates`) applies `timeout` entries as trusted.
   `createMatch` setup gains `clockMs` (0/absent = Classic) so replays know the mode.
3. `server/ws-server.mjs` — rooms get `clockMs`; set by host (like the map), shown to the guest, agreed through Ready. On start, a clock per room. On each applied action: switch the clock to the new `toMove`. A timer set to the running side's deadline fires `timeout` through the engine and broadcasts the result. `start`, `sync`, `move` carry the remaining ms of both sides. Pause when the opponent is disconnected, resume on return.
4. `src/ui/online/ws-room.ts` / `room.ts` — `clockMs` in lobby state and `setClock`. The capability room disables Timed.
5. `src/ui/game/controller.ts` — owns a local clock for bot / face to face; for online it mirrors the server snapshot and counts down locally for display only. On local timeout it commits the trusted action. Undo/redo return false in Timed.
6. UI
   - Battlefield step: mode (Classic / Timed) and time (chips + number input), host-only online. Remembered via `pref`.
   - Status bar: a small `m:ss` beside each side's tokens (no long text; mobile width). Red and pulsing under 30 s; the running side is marked.
   - Win overlay: "won on time"; replay label and score follow.
7. Changelog: one entry under the next version.

## Testing
- `clock.js`: switching, interrupt (toMove), expiry, pause/resume.
- Engine: `timeout` sets the winner, is rejected untrusted, replays to the same end.
- Server smoke test with two clients: timeout ends the match for both; opponent-away pauses the clock.
- Manual: setup UI on mobile width, low-time warning, face to face seats.

## Out of scope
7×7 / compact maps, increments or delay, handicap (different time per player), pausing for animations.
