# Runeverra

A playable prototype of a deterministic hero tactics game on an 8×8 board. Pick four heroes, choose a battlefield, and play against a bot (Easy / Normal / Hard) or a friend on the same screen. No dice, no HP: positions, movement and skills decide everything.

## Run

Requires Node 18+.

```bash
npm install
npm run dev     # Vite dev server, http://localhost:5173
npm test        # rules engine, bot and online helpers (node:test)
npm run build   # type-check, then dist/index.html (single file, JS/CSS inlined) + dist/assets,
                # dist/artifact.html (same page without the document skeleton)
```

## Stack

- **Rules engine, bot, online protocol:** plain JavaScript ES modules (`src/arena.js`, `src/arena-bot.js`, `src/online.js`), no dependencies, tested with `node:test`.
- **UI:** React 18 + TypeScript, built with Vite into one self-contained HTML file (`vite-plugin-singlefile`). The board stage (cells, pieces, terrain, canvas effects and ambient particles) stays an imperative module (`src/ui/game/board.js`) driven by a small controller; React renders the screens, panels and menus around it.

## Layout

```
src/arena.js              Rules engine: pure functions, data-driven heroes and maps
src/arena-bot.js          Bot: time-boxed alpha-beta over the engine
src/online.js             Online helpers: room codes, move encoding, deterministic replay
src/ui/App.tsx            Screen flow: home → difficulty / room → heroes → battlefield → game
src/ui/screens/GameScreen.tsx   Game screen: board, prompts, roster, selected unit, log; face-to-face seats
src/ui/components/        HeroPicker (2-column list, tooltips, short/detail), MapPicker, Rules
src/ui/game/controller.ts Match state, selection, bot turns, undo; drives the board
src/ui/game/board.js      Board DOM, terrain, pieces, effects (canvas), ambient particles
src/ui/online/room.ts     Room client over the platform room capability
public/assets/            Character portraits and card art
```

## Screens

1. **Home:** Play vs Bot, Offline · face to face, Online · room code. How to play.
2. **Bot:** pick Easy / Normal / Hard. **Online:** create a room or join with a code.
3. **Heroes:** teams start empty. Heroes are listed in two columns; the ⓘ button opens its description full screen (Short or Detail, both with the move pattern); hovering shows nothing. Tap a hero to add it, tap a slot to remove it, or use Random / Clear. Against the bot you choose your side (**Ivory** moves first, **Ember** second; playing Ember turns the board so your side is at the bottom), and its team can be **Blind** (picked in secret, revealed when the match starts), **Shuffle** (random, visible) or **Pick manually**. Face to face, Player 2's picker is turned 180° for the player across the table.
4. **Battlefield:** map and creeps. Online, the host picks and both press Ready.
5. **Game:** above the board, your tokens on the left, the opponent's on the right and a turn banner in the middle (team-coloured, with an arrow toward whoever is acting). Below it: a square skill button with the skill's glyph, gold and shining when ready (its cost, effect and readiness slide in as a card underneath), undo/redo (not online), the menu, the turn number and last message, then the selected unit as an accordion whose short line also lists active effects (Shielded, Rooted, Recharging, In danger). Decisions (interrupt, slam, beast, ice) appear as a toast docked under the board, never over it. The threats overlay is a switch in the menu; the teams list is collapsed in the side panel. Face to face, each player's fixed-height panel shows only their own tokens, status and selected unit (tap it for full details), and Ember's toasts appear in Ember's panel.

Screens, modals, toasts and accordions fade or drop in; the hero details card opens full screen.

## Heroes

Heroes are data in `HEROES` (src/arena.js): name, class, role, movement rules, skill. Movement rules are `slide` (directions + range, stops at the first unit or terrain, may capture the first enemy), `leap` (fixed jumps) or `backstab`.

### Roles

| Role | Heroes | Movement |
|---|---|---|
| Roam | Aqna, Hexor, Ge'nga | Aqna up to 2 squares straight; Hexor's L jump counts as his 2 steps; Ge'nga 1 square straight (his beast adds a free step) |
| Assassin | Hasim | 1 square in any direction, plus the Backstab jump (free signature move) |
| Support | Plantae, Magumba | 1 square (Plantae straight, Magumba diagonally); the skill follows the same lines up to 3 squares, stopped by terrain or the first unit |

### Skill tokens

Each team has 4 heroes and at most 4 tokens. Both sides start full (4) and tokens do **not** refill each turn: the only income is +1 for killing an enemy creep (last hit) and +1 when your creep reaches the far rank. Every skill, passive or active, costs tokens according to its impact:

| Hero | Skill | Type | Cost | What it does |
|---|---|---|---|---|
| Hasim | Backstab | signature move | free | jumps in any of the 8 directions over an adjacent unit or terrain; a jumped enemy and an enemy on the landing square are both eliminated |
| Ge'nga | Wild Company | active | 3 | after Ge'nga acts, the beast may also step 1 square in any direction (always free, no special moves); once the beast has fallen, pay to summon it again on an empty square next to him (uses the turn); it flees if he falls |
| Aqna | Icy Step | follow-up | 1 | after a kill, raise an ice block within 3; max 10, then her oldest block moves |
| Magumba | Empty Grave | active, diagonals up to 3 | 2 | himself or an ally on those lines can't be captured, rooted, pushed or harmed until your next turn; clears Root |
| Hexor | Storm Hammer | follow-up | 2 | after Hexor captures, slam: every unit around him is pushed 1 square away, chaining; enemies pushed into terrain or off the board die, allies there stay put |
| Plantae | Aggressive Root | active, straight lines up to 3, cooldown 3 | 3 | roots an enemy for its next turn |
| Plantae | Root interrupt | reaction | 3 | on the enemy's turn, negates an action by a unit on her straight lines (up to 3); their turn ends. Shares the 3-turn recharge |

Paid follow-ups (ice, Storm Hammer) are offered only when you can afford them, and skipping is free. Three more portraits are in the roster as "Coming soon"; they need skill descriptions.

### Interpretations (cards didn't specify)

- Moving onto an enemy eliminates it (capture), for every hero, the beast and creeps.
- Board edges and terrain count as "terrain" for Storm Hammer.
- Empty Grave lasts until the caster's next turn. An interrupted unit isn't also rooted.

## Creeps

Each side starts with 4 pawn-like creeps on its second rank in the flank lanes (files a, b, g, h), facing the enemy's creeps. Map terrain only sits in the four centre files (c–f), so obstacles never block a lane; heroes start on c1–f1 (Ivory) and c8–f8 (Ember). Settings live in `CREEPS` (src/arena.js) and can be switched off on the setup screen (`createMatch({ creeps: false })`).

- You move them yourself, like chess pawns, and moving one uses your turn: 1 square forward onto an empty square, or capture an enemy diagonally in front. Never back or sideways. (An earlier version marched them automatically; that made the board hard to predict, so it was dropped.)
- Eliminating an enemy creep gives the killer's side +1 token (last hit). A creep that reaches the far rank breaks through: it leaves the board and its side gains +1 token.
- Creeps don't count for victory, but a creep capture can eliminate a hero and win the match.
- They interact with every skill: Hasim jumps them, Hexor pushes them, Aqna's kills on them raise ice, Plantae can root or interrupt them, Magumba can ward them.

Bot Normal vs Normal, 24 games each, 3-hero rules (before the token redesign):

| | Ivory–Ember | Unfinished at 300 actions | Median length | First hero kill (median turn) |
|---|---|---|---|---|
| No creeps | 5–7 | 12 | 111 | 25 |
| Manual creeps | 8–5 | 11 | 158 | 29 |

Manual creeps keep sides even but make matches longer. About half of bot games still stall, with or without creeps: an anti-stall rule is the biggest open problem.

### Limiting Aggressive Root

Plantae's team vs a team without Plantae, bot Normal vs Normal, 20–24 games each (3-hero rules):

| Limit | Plantae team | Other team | Unfinished |
|---|---|---|---|
| none (before) | 24 | 0 | 0 |
| cooldown 3 | 19 | 1 | 4 |
| cooldown 3, interrupt costs 5 | 17 | 1 | 2 |
| cooldown 3, max 2 interrupts | 14 | 3 | 3 |
| cooldown 3, max 1 interrupt | 7 | 5 | 8 |
| cooldown 3, interrupt also skips your next turn | 2 | 13–14 | 5 |

Plantae without the skill loses 0–5, so its strength was the interrupt itself: each one cancels a whole enemy turn. Skipping your whole next turn overcorrected, so the current rule (4-hero teams) is: interrupt costs 3 tokens, no per-match cap, and only Plantae itself is rooted on your next turn. Results below.

## Maps

`MAPS` in src/arena.js; obstacles are listed for one half and mirrored 180°, and only placed in files c–f so the flank lanes stay clear for creeps.

| Map | Theme | Terrain (centre files only) |
|---|---|---|
| Oasis Bazaar | desert, drifting sand | 4 pillars around the market square |
| Savanna Crossing | savanna, dust motes | 4 acacia trees splitting the centre |
| Jungle Ruins | jungle, falling leaves | 6 ruins forming a central fort |
| Winter Keep | snow, snowfall | 4 rocks forming a keep |
| Open Field | slate | none |

## Online play (room code)

Works in the published page (it uses the platform's `room` capability; the local build shows the option disabled).

- Home → **Online · room code**. One player presses **Create room** and sends the 5-character code; the other types it and presses **Join**. The creator plays Ivory and picks the battlefield and creeps; each player picks their own four heroes, then both press **Ready** on the battlefield step.
- Both players must be signed in and have access to the page: invite your friend by email from the Share menu (visitors on a public link can't join rooms).
- Nothing runs on a server. The engine is deterministic, so each player shares only their own decisions, as indexes into `listActions(state)`, in their room presence; both screens replay them in turn order (`src/online.js`). An index that isn't a legal action is rejected.
- The guest (Ember) sees the board turned so their side is at the bottom.
- Reloading the tab rejoins the room and replays the match; each side also keeps a copy of the other's decisions, so nothing is lost. Undo is off online. Rematch starts when both press it.

## Engine API

`createMatch({ p1, p2, map })`, `listActions(state)` (the single source of legality), `applyAction(state, action)` → `{ ok, state, reason }` (never mutates), `validateAction`, `moveOptions`, `skillTargets`, `getThreats`, `toMove(state)` (who decides now).

Phases: `main` → optional `storm` (after a Hexor capture), `beast` (after Ge'nga) or `ice` (after Aqna kills) → next turn. Each follow-up is offered only if the side can pay for it. `react` pauses a unit action when the opponent's Plantae can interrupt it; `toMove` is then the opponent.

## Bot

`chooseAction(state, level)` uses iterative deepening alpha-beta under a time limit (Easy 0.15 s, Normal 0.6 s, Hard 1.4 s), extends capture sequences, and spends no depth on in-turn follow-ups. It decides reactions too.

## Balance notes (bot vs bot, 4-hero teams)

Bot Normal, random maps, 300-action limit, run several at a time on 2 cores (shallower search than in the browser).

| Token rule | Games | Ivory | Ember | Unfinished | Plantae team vs other |
|---|---|---|---|---|---|
| start 1, +1 per turn, creep kill +1, breach +2 | 16 + 16 | 5 | 6 | 5 | 8–3, 5 unfinished |
| **start 4, no refill, creep kill +1, breach +1 (current)** | 8 + 8 | 0 | 2 | 6 | 0–1, 7 unfinished |

- With no refill, tokens run out early and skills almost disappear from the midgame (about 1–2 skill uses per game after the opening spend). Plantae interrupted once in 8 games instead of about 3 times per game.
- Matches stall far more often: most games end without a winner. An anti-stall rule matters even more now; creep income is the only way to get tokens back, so pushing creeps is the main route to skills.
- Small samples; treat as direction, not as numbers.

## Tests

- `npm test`: 29 tests (engine 21, bot 4, online 4): roles and movement, every skill's token cost, follow-up phases offered only when affordable, the Plantae hole, Storm Hammer chains and edge kills, ice limit, token cap, win condition, random-play invariants, bot legality.
- Browser click-through: 4-pick setup with role and cost labels, Storm Hammer slam prompt, interrupt then Plantae rooted, no Backstab without tokens, phone width without horizontal scroll.

## Known limitations

- No draw/anti-stall rule; bots can circle forever.
- The bot always plays Ember.
- Hero movement patterns are placeholders until you define them.
