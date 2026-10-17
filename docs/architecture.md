# Architecture

How Runeverra is put together, for someone opening the code for the first time. For adding or
changing a hero, read [heroes.md](heroes.md) next.

## The one idea to hold on to

The **rules engine** (`src/engine/`) is pure and deterministic: a match is a plain object (`State`),
and every rule is a function that takes a state and returns a new one. It has no DOM, no clock, no
randomness and no network. Everything else is built around it:

```
                  ┌─────────────────────────────┐
                  │  src/engine/  (rules)       │
                  │  createMatch → State        │
                  │  listActions(State)         │
                  │  applyAction(State, Action) │
                  └──────────────┬──────────────┘
          ┌──────────────────────┼───────────────────────┐
          │                      │                       │
  src/engine/bot.ts       src/ui/ (browser)       server/ws-server.ts
  searches listActions    renders a State,        runs the same engine to
  to pick an Action       turns taps into Actions  validate online moves
```

Because the same engine runs in the browser, the bot and the server, a move is legal everywhere or
nowhere. A replay is just the starting setup plus the list of actions (`state.setup` + `state.trail`).

## Folders

| Path | What lives there |
|---|---|
| `src/engine/` | The rules. `index.ts` is the only file other code imports from. |
| `src/engine/heroes/` | One file per hero: its data, its skill, its follow-up phase. |
| `src/engine/bot.ts` | The computer opponent (alpha-beta search over `listActions`). |
| `src/online.ts` | Room codes, move encoding and replaying for online play. |
| `src/clock.ts` | The chess clock, as plain data (never part of the game state). |
| `src/protocol.ts` | Every message between browser and relay, as types. |
| `src/sfx-map.ts` | Which sound goes with which `lastAction.kind`. |
| `src/ui/` | React screens and components. |
| `src/ui/game/controller.ts` | The match being played on screen: selection, bot turns, undo, online. |
| `src/ui/game/board.ts` | The board: squares, pieces, terrain, tap and drag input. |
| `src/ui/game/effects.ts` | Canvas effects per skill (`SKILL_FX`) and per hero (`HERO_FX`). |
| `src/ui/game/ambient.ts`, `motion.ts`, `art.ts` | Background particles, the lunge animation, inline SVG art. |
| `src/ui/online/` | Online clients: `room.ts` (claude.ai capability), `ws-room.ts` (self-hosted relay). |
| `server/ws-server.ts` | The self-hosted relay. Node runs the `.ts` file directly. |
| `test/` | `node:test` suites. `npm test` runs them all. |
| `public/` | Static files: portraits and card art, PWA manifest, service worker. |

## Words used in the code

| Word | Meaning |
|---|---|
| `State` | A whole match at one moment: units, terrain, runes, whose turn, phase, log. |
| `Unit` | Anything on the board: a hero, Ge'nga's beast, or a creep. |
| `Action` | One decision, exactly as `listActions` returns it: `{ type: 'move', unitId, to }`, `{ type: 'skill', … }`, `{ type: 'skip' }`… |
| `Team` | `'p1'` (Ivory, moves first) or `'p2'` (Ember). |
| `Pos` | A square, `{ r, c }`: row 0 is rank 8 (Ember's back rank), column 0 is file a. |
| Runes | Skill currency. Called `energy` in code (`state.energy[team]`). |
| Phase | `'main'` normally; `'react'` while the opponent decides on a reaction; or a hero's follow-up phase (`'storm'`, `'ice'`, `'beast'`). |
| `pending` | What a non-main phase is waiting for (whose follow-up, which action may be negated). |
| `lastAction` | What just happened, for effects, sounds and the log. `kind` is `'move'`, `'capture'` or a skill key. |
| `toMove(state)` | The team deciding right now (the opponent, during a reaction prompt). |

Short field names inside `State`, `Unit` and `Action` (`r`, `c`, `cd`) are a stored format: replays
and the online protocol keep them, so they don't change. Everywhere else, names are full words.

## A turn, from tap to screen

1. The player taps a square. `board.ts` calls the controller's `onCell(pos)`.
2. The controller finds the matching action in `listActions(state)` and calls `commit(action)`.
3. `applyAction(state, action)` validates it (it must be in `listActions`), then returns a new state.
4. The controller keeps the new state, plays the sound for `lastAction`, asks the board to `plan`
   and `run` the effect, and re-renders.
5. Against the bot, `chooseAction(state, level)` picks the reply and the same `commit` runs.
6. Online, the action goes to the relay, which runs `applyAction` itself and forwards it to the
   opponent only if it was legal.

Inside `applyAction` the order is fixed; [heroes.md](heroes.md#where-the-engine-calls-a-hero) lists
where each hero hook runs.

## Conventions

- **Formatting** is Prettier (`.prettierrc.json`); **linting** is ESLint (`eslint.config.js`). Run
  `npm run format` and `npm run lint`; CI fails on either.
- **Names are words.** No single-letter parameters (the linter enforces it), including callbacks
  (`(unit) => unit.alive`) and caught errors (`catch (error)`). Prefer an options object over
  several positional arguments (`shieldBounce({ attackerId, from, targetId, to })`).
- **Type imports say so**: `import type { State } from '…'`. Node runs our `.ts` files by stripping
  types, and an unmarked type import would fail at runtime. The linter checks this.
- **Engine imports end in `.ts`** (`'../engine/index.ts'`), so Node can load them without a bundler.
- **Anything from a client is untrusted.** Look ids up with `own(table, id)` / `isHero(id)`, never
  `table[id]` (ids like `"__proto__"` or `"toString"` would resolve to something).
- **The engine never mutates its input** and never uses `Math.random` or the clock. Randomness for
  effects lives in the UI.

## Checks before you push

```bash
npm run lint        # ESLint
npm run format:check
npm run typecheck   # browser code and server code (two tsconfigs)
npm test
npm run build
```

CI runs the same on every pull request; a push to `main` also deploys.
