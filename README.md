# Hero Gambit

A playable prototype of a deterministic hero tactics game on an 8×8 board. Pick three heroes, choose a battlefield, and play against a bot (Easy / Normal / Hard) or a friend on the same screen. No dice, no HP: positions, movement and skills decide everything.

## Run

Requires Node 18+. No dependencies.

```bash
npm run dev     # http://localhost:5173  (classic chess-hero mode at /classic.html)
npm test        # rules engine + bot tests (node:test)
npm run build   # dist/: index.html + assets/ (open dist/index.html directly), classic.html
```

## Layout

```
src/arena.js        Rules engine for the hero roster: pure functions, data-driven heroes and maps
src/arena-bot.js    Bot: time-boxed alpha-beta over the engine, incl. follow-up phases and reactions
src/index.html      Setup screen (maps, hero cards, opponent) and game screen (board, effects, ledger)
assets/icons, art   Character portraits and card art
src/classic.html    The earlier Assassin/Mage/Guardian version (src/engine.js, src/bot.js)
build.mjs, serve.mjs
```

## Heroes

Heroes are data in `HEROES` (src/arena.js): name, class, movement rules, skill. Movement rules are `slide` (directions + range, stops at the first unit or terrain, may capture the first enemy), `leap` (fixed jumps) or `backstab`.

| Hero | Class | Moves | Skill |
|---|---|---|---|
| Hasim, Desert Assassin | Claw | 1 square any direction | **Backstab** (passive): jumps in any of the 8 directions over an adjacent unit or terrain; a jumped enemy and an enemy on the landing square are both eliminated |
| Ge'nga, Beast Master | Claw | up to 2 straight | **Wild Company** (passive): starts with a beast; the beast acts right after him (or skip); it flees if he falls |
| Magumba, Shadow Shaman | Leaf | up to 2 diagonal | **Empty Grave** (active, 3 energy, range 3): an ally can't be captured, rooted, pushed or harmed until your next turn; clears Root |
| Plantae, Jungle Keeper | Leaf | 1 straight | **Aggressive Root** (active, 3 energy, range 3, cooldown 3): roots an enemy for its next turn; once per match it can instead interrupt an enemy action within range during their turn (the action is negated, their turn ends) |
| Hexor, Iron Knight | Shield | chess-knight jump | **Storm Hammer** (passive): on a capture, every unit around the target is pushed 1 square away, chaining; enemies pushed into terrain or off the board are eliminated; allies are pushed too but never die from it (blocked allies stay put) |
| Aqna, Winter Hunter | Shield | slides any distance straight | **Icy Step** (passive): after a kill she may raise an ice block within 3; max 10, then her oldest block moves |
| Beast | — | 1 square any direction | Companion; doesn't count toward victory |

Three more portraits are in the roster as "Coming soon"; they need skill descriptions.

### Interpretations (cards didn't specify)

- Movement for every hero was chosen by me (cards only describe skills). Change `move` in `HEROES` to adjust.
- Moving onto an enemy eliminates it (capture), for every hero and the beast.
- Hasim's Backstab works in all 8 directions. Board edges and terrain count as "terrain" for Storm Hammer.
- Empty Grave lasts until the caster's next turn. Aggressive Root's reaction negates the action; the unit isn't also rooted on its next turn.
- Energy: both start with 1, +1 at the start of each own turn, max 6.

## Creeps

Each side starts with 4 pawn-like creeps on its second rank in the flank lanes (files a, b, g, h), facing the enemy's creeps. Map terrain only sits in the four centre files (c–f), so obstacles never block a lane; heroes start on c, d, f (Ivory) and f, e, c (Ember). Settings live in `CREEPS` (src/arena.js) and can be switched off on the setup screen (`createMatch({ creeps: false })`).

- You move them yourself, like chess pawns, and moving one uses your turn: 1 square forward onto an empty square, or capture an enemy diagonally in front. Never back or sideways. (An earlier version marched them automatically; that made the board hard to predict, so it was dropped.)
- Eliminating an enemy creep gives the killer's side +1 energy (last hit). A creep that reaches the far rank breaks through: it leaves the board and its side gains +2 energy.
- Creeps don't count for victory, but a creep capture can eliminate a hero and win the match.
- They interact with every skill: Hasim jumps them, Hexor pushes them, Aqna's kills on them raise ice, Plantae can root or interrupt them, Magumba can ward them.

Bot Normal vs Normal, 24 games each, current rules:

| | Ivory–Ember | Unfinished at 300 actions | Median length | First hero kill (median turn) |
|---|---|---|---|---|
| No creeps | 5–7 | 12 | 111 | 25 |
| Manual creeps | 8–5 | 11 | 158 | 29 |

Manual creeps keep sides even but make matches longer. About half of bot games still stall, with or without creeps: an anti-stall rule is the biggest open problem.

### Limiting Aggressive Root

Plantae's team vs a team without Plantae, bot Normal vs Normal, 20–24 games each:

| Limit | Plantae team | Other team | Unfinished |
|---|---|---|---|
| none (before) | 24 | 0 | 0 |
| cooldown 3 | 19 | 1 | 4 |
| cooldown 3, interrupt costs 5 | 17 | 1 | 2 |
| cooldown 3, max 2 interrupts | 14 | 3 | 3 |
| **cooldown 3, max 1 interrupt (default)** | **7** | **5** | 8 |

Plantae without the skill loses 0–5, so its strength was the interrupt itself: each one cancels a whole enemy turn.

## Maps

`MAPS` in src/arena.js; obstacles are listed for one half and mirrored 180°, and only placed in files c–f so the flank lanes stay clear for creeps.

| Map | Theme | Terrain (centre files only) |
|---|---|---|
| Oasis Bazaar | desert, drifting sand | 4 pillars around the market square |
| Savanna Crossing | savanna, dust motes | 4 acacia trees splitting the centre |
| Jungle Ruins | jungle, falling leaves | 6 ruins forming a central fort |
| Winter Keep | snow, snowfall | 4 rocks forming a keep |
| Open Field | slate | none |

## Engine API

`createMatch({ p1, p2, map })`, `listActions(state)` (the single source of legality), `applyAction(state, action)` → `{ ok, state, reason }` (never mutates), `validateAction`, `moveOptions`, `skillTargets`, `getThreats`, `toMove(state)` (who decides now).

Phases: `main` → optional `beast` (after Ge'nga) or `ice` (after Aqna kills) → next turn. `react` pauses a unit action when the opponent's Plantae can interrupt it; `toMove` is then the opponent.

## Bot

`chooseAction(state, level)` uses iterative deepening alpha-beta under a time limit (Easy 0.15 s, Normal 0.6 s, Hard 1.4 s), extends capture sequences, and spends no depth on in-turn follow-ups. It decides reactions too.

## Balance notes (bot vs bot, random teams and maps)

- Normal vs Easy: 9–2, 5 unfinished (16 games). Normal vs Normal: 16 decided, 8 unfinished at 300 actions.
- Plantae's team won 15 of 21 decided games; Hasim's team 7 of 16. Aggressive Root's reaction is probably too strong at 3 energy.
- About a third of bot games stall. There is no draw rule yet.

## Tests

- `npm test`: 44 tests (classic engine/bot 28, arena engine 12, arena bot 4): every hero's movement and skill, reactions, Storm Hammer chains and edge kills, ice limit, energy, win condition, random-play invariants, bot legality.
- Browser click-through: setup (map, picks, start), beast follow-up, reaction prompt and interrupt, Storm Hammer, ice placement, Backstab double kill, undo, back to setup, phone width without horizontal scroll.

## Known limitations

- No draw/anti-stall rule; bots can circle forever.
- The bot always plays Ember.
- Hero movement patterns are placeholders until you define them.
