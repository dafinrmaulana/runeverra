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
| Hasim, Desert Assassin | Claw | 1 square any direction | **Backstab** (passive): jumps forward or back (straight or diagonal, not sideways) over an adjacent unit or terrain; a jumped enemy and an enemy on the landing square are both eliminated |
| Ge'nga, Beast Master | Claw | up to 2 straight | **Wild Company** (passive): starts with a beast; the beast acts right after him (or skip); it flees if he falls |
| Magumba, Shadow Shaman | Leaf | up to 2 diagonal | **Empty Grave** (active, 3 energy, range 3): an ally can't be captured, rooted, pushed or harmed until your next turn; clears Root |
| Plantae, Jungle Keeper | Leaf | 1 straight | **Aggressive Root** (active, 3 energy, range 3): roots an enemy for its next turn, or interrupts an enemy action within range during their turn (the action is negated, their turn ends) |
| Hexor, Iron Knight | Shield | chess-knight jump | **Storm Hammer** (passive): on a capture, every unit around the target is pushed 1 square away, chaining; pushed into terrain or off the board = eliminated (allies too) |
| Aqna, Winter Hunter | Shield | slides any distance straight | **Icy Step** (passive): after a kill she may raise an ice block within 3; max 10, then her oldest block moves |
| Beast | — | 1 square any direction | Companion; doesn't count toward victory |

Three more portraits are in the roster as "Coming soon"; they need skill descriptions.

### Interpretations (cards didn't specify)

- Movement for every hero was chosen by me (cards only describe skills). Change `move` in `HEROES` to adjust.
- Moving onto an enemy eliminates it (capture), for every hero and the beast.
- Hasim's Backstab goes forward or back, straight or diagonal; sideways jumps aren't included. Board edges and terrain count as "terrain" for Storm Hammer.
- Empty Grave lasts until the caster's next turn. Aggressive Root's reaction negates the action; the unit isn't also rooted on its next turn.
- Energy: both start with 1, +1 at the start of each own turn, max 6.

## Maps

`MAPS` in src/arena.js; obstacles are listed for one half and mirrored 180°.

| Map | Theme | Terrain |
|---|---|---|
| Oasis Bazaar | desert, drifting sand | 4 pillars |
| Savanna Crossing | savanna, dust motes | 4 acacia trees |
| Jungle Ruins | jungle, falling leaves | 6 overgrown ruins |
| Winter Keep | snow, snowfall | 4 rocks |
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
