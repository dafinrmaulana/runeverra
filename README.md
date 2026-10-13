# Hero Gambit

A playable prototype of a deterministic hero tactics game on an 8×8 board. Pick four heroes, choose a battlefield, and play against a bot (Easy / Normal / Hard) or a friend on the same screen. No dice, no HP: positions, movement and skills decide everything.

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

Heroes are data in `HEROES` (src/arena.js): name, class, role, movement rules, skill. Movement rules are `slide` (directions + range, stops at the first unit or terrain, may capture the first enemy), `leap` (fixed jumps) or `backstab`.

### Roles

| Role | Heroes | Movement |
|---|---|---|
| Roam | Ge'nga, Aqna, Hexor | up to 2 squares straight; Hexor's L jump counts as his 2 steps |
| Assassin | Hasim | up to 2 squares straight, plus the Backstab jump |
| Support | Plantae | 1 square straight; skill reaches 3, with a weakness (below) |
| (none yet) | Magumba | up to 2 squares diagonally |

### Skill tokens

Each team has 4 heroes and at most 4 tokens. Both sides start with 1, gain +1 at the start of each own turn, +1 for killing an enemy creep, +2 when a creep breaks through. Every skill costs tokens according to its impact:

| Hero | Skill | Type | Cost | What it does |
|---|---|---|---|---|
| Hasim | Backstab | per jump | 1 | jumps in any of the 8 directions over an adjacent unit or terrain; a jumped enemy and an enemy on the landing square are both eliminated |
| Ge'nga | Wild Company | follow-up | 1 | after Ge'nga acts, the beast also moves (or skip, free); it flees if he falls |
| Aqna | Icy Step | follow-up | 1 | after a kill, raise an ice block within 3; max 10, then her oldest block moves |
| Magumba | Empty Grave | active, range 3 | 2 | an ally can't be captured, rooted, pushed or harmed until your next turn; clears Root |
| Hexor | Storm Hammer | follow-up | 2 | after Hexor captures, slam: every unit around him is pushed 1 square away, chaining; enemies pushed into terrain or off the board die, allies there stay put |
| Plantae | Aggressive Root | active, range 3, cooldown 3 | 2 | roots an enemy for its next turn |
| Plantae | Root interrupt | reaction | 3 | on the enemy's turn, negates an action by a unit within 3; their turn ends. **The hole:** Plantae roots itself and can't act on your next turn |

Follow-ups are offered only when you can afford them, and skipping is free. Three more portraits are in the roster as "Coming soon"; they need skill descriptions.

### Interpretations (cards didn't specify)

- Moving onto an enemy eliminates it (capture), for every hero, the beast and creeps.
- Board edges and terrain count as "terrain" for Storm Hammer.
- Empty Grave lasts until the caster's next turn. An interrupted unit isn't also rooted.
- Magumba has no role yet; he keeps his diagonal move.

## Creeps

Each side starts with 4 pawn-like creeps on its second rank in the flank lanes (files a, b, g, h), facing the enemy's creeps. Map terrain only sits in the four centre files (c–f), so obstacles never block a lane; heroes start on c1–f1 (Ivory) and c8–f8 (Ember). Settings live in `CREEPS` (src/arena.js) and can be switched off on the setup screen (`createMatch({ creeps: false })`).

- You move them yourself, like chess pawns, and moving one uses your turn: 1 square forward onto an empty square, or capture an enemy diagonally in front. Never back or sideways. (An earlier version marched them automatically; that made the board hard to predict, so it was dropped.)
- Eliminating an enemy creep gives the killer's side +1 token (last hit). A creep that reaches the far rank breaks through: it leaves the board and its side gains +2 tokens.
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

## Engine API

`createMatch({ p1, p2, map })`, `listActions(state)` (the single source of legality), `applyAction(state, action)` → `{ ok, state, reason }` (never mutates), `validateAction`, `moveOptions`, `skillTargets`, `getThreats`, `toMove(state)` (who decides now).

Phases: `main` → optional `storm` (after a Hexor capture), `beast` (after Ge'nga) or `ice` (after Aqna kills) → next turn. Each follow-up is offered only if the side can pay for it. `react` pauses a unit action when the opponent's Plantae can interrupt it; `toMove` is then the opponent.

## Bot

`chooseAction(state, level)` uses iterative deepening alpha-beta under a time limit (Easy 0.15 s, Normal 0.6 s, Hard 1.4 s), extends capture sequences, and spends no depth on in-turn follow-ups. It decides reactions too.

## Balance notes (bot vs bot, 4-hero teams, token costs)

Small samples (16 games each, bot Normal, random maps, run 8 at a time on 2 cores, so the bots search shallower than in the browser):

- Random teams: Ivory 5, Ember 6, unfinished at 300 actions 5. Median length of decided games about 120 actions.
- Plantae's team vs a team without Plantae: 8–3, 5 unfinished, about 3 interrupts per game. Better than the uncapped original (24–0), but Plantae is still the strongest pick; if it stays ahead, the next lever is the interrupt cost (3 → 4, i.e. a full bank).
- Skill use per game (average): Empty Grave 13, Ge'nga's beast 9, Aggressive Root 8, Backstab 4, interrupt 3, Storm Hammer 1, Icy Step 1. Storm Hammer and Icy Step are rarely bought, so they may be priced too high or just rarely triggered.
- Stalls remain: about a third of games end without a winner. There is no draw rule yet.

## Tests

- `npm test`: 53 tests (classic 28, arena engine 21, arena bot 4): roles and movement, every skill's token cost, follow-up phases offered only when affordable, the Plantae hole, Storm Hammer chains and edge kills, ice limit, token cap, win condition, random-play invariants, bot legality.
- Browser click-through: 4-pick setup with role and cost labels, Storm Hammer slam prompt, interrupt then Plantae rooted, no Backstab without tokens, phone width without horizontal scroll.

## Known limitations

- No draw/anti-stall rule; bots can circle forever.
- The bot always plays Ember.
- Hero movement patterns are placeholders until you define them.
