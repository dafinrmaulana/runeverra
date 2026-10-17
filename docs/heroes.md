# Heroes: adding one, changing one

Everything a hero *does* lives in one file, `src/engine/heroes/<id>.ts`. The rules, the bot, the
server and the game screen never name a hero, so a new hero needs no changes there. Everything a
hero *looks and sounds like* lives in the UI, in a handful of tables listed below.

Read [architecture.md](architecture.md) first if the words `State`, `Unit`, `Action` or "phase" are new.

## Contents

1. [Adding a hero, step by step](#adding-a-hero-step-by-step)
2. [Changing an existing hero](#changing-an-existing-hero)
3. [Where the engine calls a hero](#where-the-engine-calls-a-hero)
4. [Every file a hero touches](#every-file-a-hero-touches)
5. [Which existing hero to copy](#which-existing-hero-to-copy)

## Adding a hero, step by step

Work in this order: each step builds on the one before, and the game stays playable after each.

### 1. Decide the rules on paper

Write down, before any code:

- **Movement**: one of the existing rules (`slide` along directions up to a range, `leap` fixed
  jumps, `backstab`), or a new one.
- **Skill type**:
  - `active`: cast as the turn's action (Empty Grave, Aggressive Root, Wild Company, Icy Step);
  - `follow`: offered right after the hero's own move, like Storm Hammer after a kill;
  - `move`: part of the hero's movement, like Backstab.
- Its **cost** in runes, **cooldown**, and **reach** (a fixed shape, lines, or a square of `range`).
- Whether it can be used **on the opponent's turn** (a reaction, like Plantae's interrupt).

### 2. Write the hero file — `src/engine/heroes/<id>.ts`

Copy the closest existing hero (see [the table below](#which-existing-hero-to-copy)) and change it.
A hero is one `defineHero(id, { … })` call:

```ts
const myHero = defineHero('myhero', {
  // identity
  name: 'My Hero', title: 'Short Epithet', cls: 'claw', role: 'roam', // roam | fighter | assassin | support
  // commander: true, // a team fields exactly one commander and loses when it falls (Plantae, Magumba)
  value: 320, // material value for the bot (others are 270–350)
  // movement: rules from MOVE_RULES (src/engine/movement.ts)
  move: [{ kind: 'slide', dirs: ORTHO, range: 1 }],
  moveText: 'Steps 1 square straight.',
  // the skill
  skill: {
    key: 'mark', // short id: used in actions, effects, sounds and CSS
    name: 'Hunter\'s Mark', type: 'active', cost: 2, range: 3, cooldown: 2,
    text: 'The full rules text shown in the hero details.',
  },
  short: { move: 'Steps 1 straight.', skill: 'One line for the picker.' },
  // how screens talk about the skill (optional)
  ui: { targets: 'enemy', unavailable: () => ({ text: 'No enemy in range.' }) },
  // what the skill does
  hooks: {
    skillTargets: (state, hero) => /* ids of units it may target */ [],
    resolveSkill(state, hero, action, logLines, lastAction) {
      // runes and cooldown are already paid; change `state`, describe it in `logLines`,
      // and fill `lastAction` (kind, from, to, hits, targetId) for the effects.
    },
  },
});
```

Only add the hooks the skill needs. What each one is for, and when it runs, is in
[Where the engine calls a hero](#where-the-engine-calls-a-hero); the full signatures and comments
are on `HeroHooks` in `src/engine/types.ts`.

If the hero needs something new:

- **a new way of moving** → add an entry to `MOVE_RULES` in `src/engine/movement.ts` and use its
  `kind` in `move`;
- **a decision after its move** (like Storm Hammer or the ice placement) → in the hero file, open the
  phase from `afterAction` and describe it with `definePhase('<name>', { list, resolve, explain, prompt, hint })`;
- **a companion unit** (like the beast) → `defineUnit('<kind>', …)` plus a `spawn` hook.

Write any state the hero needs on its `Unit` only if it must be saved (it ends up in replays); add
the field to `Unit` in `src/engine/types.ts` with a comment.

### 3. Register it — `src/engine/heroes/index.ts`

Add one import line. The order of imports is the order of the hero picker.

```ts
import './myhero.ts';
```

From this point the hero is fully playable: it appears in the picker, the bot plays it, and the
online relay accepts it. The art is still missing, so it shows broken images until step 4.

### 4. Art — `public/assets/`

| File | Used for |
|---|---|
| `public/assets/icons/<id>.png` | The round portrait: board pieces, picker, roster. |
| `public/assets/art/<id>.jpg` | The card art: hero details, selected-unit panel. |

Match the size and style of the existing files.

### 5. Look and sound — the UI tables

None of these are required for the hero to work; each makes it look finished.

| What | Where |
|---|---|
| Skill effect on the board | `SKILL_FX[skill.key]` in `src/ui/game/effects.ts` |
| Death particles, capture strike, move touch | `HERO_FX[id]` in `src/ui/game/effects.ts` |
| Colour of the skill's reach | `--z-<key>` in `:root` and `.cell[data-zone='<key>']`, `.zone-diag[data-zone='<key>']` in `src/ui/theme.css` |
| Colour of its targets | `.cell.target.<key>` in `src/ui/styles.css`, and the class toggle in `render()` in `src/ui/game/board.ts` (only `grave` and `root` have their own today) |
| Skill button glyph | `SKILL_ICON[key]` in `src/ui/screens/GameScreen.tsx` |
| Sound | add the key to `DIRECT` in `src/sfx-map.ts` and a recipe to `RECIPES` in `src/ui/audio.ts` |
| Caption in the home demo | `CAPTION[key]` in `src/ui/components/HomeDemo.tsx` |
| Short looping demo in the hero details | `DEMOS[id]` in `src/ui/components/HeroDemo.tsx` |

### 6. Test it — `test/`

Add tests next to the others in `test/arena.test.js`. The `setup()` helper at the top of that file
builds a custom position in one line. Cover at least:

- the skill is offered exactly when it should be (`listActions`) and refused otherwise, with a
  sensible reason (`applyAction(...).reason`);
- what it does to the state;
- any interaction with Empty Grave (warded units), Aggressive Root (rooted units) and the end of
  the turn.

`test/registry.test.js` shows a minimal hero defined inside a test, if you want to try an idea
before writing the real file.

### 7. Tell players — `src/ui/changelog.ts`

Add an entry at the top of `CHANGELOG` (tag `new`).

### 8. Run every check

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

Then play it: `npm run dev`, pick the hero against the bot, use the skill, and watch a replay of
the match (Match review on the home screen).

## Changing an existing hero

| Change | Where |
|---|---|
| Cost, range, cooldown, reach, bot value | the hero file only |
| What the skill does | the hero file's `hooks` (and its `definePhase`, if it has one) |
| Rules text | `skill.text` (details), `short` (picker), `moveText`, `ui` (prompts) — keep all of them in step |
| Look or sound | the UI tables in [step 5](#5-look-and-sound--the-ui-tables) |

Things to know before changing rules:

- **Saved replays and the home demo replay old matches with the new rules.** A rule change can make
  an old trail illegal. `test/demo-match.test.js` fails when that happens to the home demo; re-record
  `DEMO_MATCH` in `src/demo-match.ts` then. Old personal replays simply stop where they become illegal.
- **Online, the relay and the page must run the same rules.** Deploy both together (the deploy
  workflow does).
- **Renaming a skill `key` or a hero id** breaks saved replays that mention it, and every UI table
  keyed by it. Prefer changing `name`, which is display-only.
- Run the tests for that hero in `test/arena.test.js` and update the ones that describe the old rule.

## Where the engine calls a hero

The order inside one call to `applyAction(state, action)` (`src/engine/rules.ts`), with the hook
that runs at each point. Hooks belong to `HeroHooks` in `src/engine/types.ts`.

```
createMatch(options)                                   src/engine/match.ts
 └─ for each picked hero ─────────────────────────────▶ hooks.spawn(units, hero)

listActions(state)                     (what is legal; validation, bot and UI all use it)
 ├─ phase 'react' ──▶ [use the reaction, let it happen]
 ├─ a hero phase ───▶ PHASES[phase].list(state)
 └─ main phase, for each unit that may act:
     ├─ moves ──────▶ MOVE_RULES[rule.kind] for each rule in `move`
     └─ skill ──────▶ hooks.skillActions(state, hero)
                      or, if absent, hooks.skillTargets(state, hero) → one action per target

applyAction(state, action)
 ├─ not in listActions → refused, reason from:
 │     PHASES[phase].explain, or for skills hooks.explainSkill then hooks.explainTarget
 ├─ phase 'react' (the opponent answers):
 │     use it ──────▶ reaction.resolve(state, reactor, actor, negated, logLines) → turn ends
 │     let it go ───▶ the waiting action continues below
 ├─ a hero phase ───▶ PHASES[phase].resolve(state, action, context)
 │                    (returns null for a unit phase: the beast's step continues below)
 ├─ can an opponent hero react? ─▶ reaction.can(state, reactor, actor, action)
 │     yes → phase becomes 'react' and the opponent decides (stop here)
 └─ resolve the action:
     ├─ move ───────▶ captures → eliminate(victim) ──▶ hooks.onEliminated(state, victim, logLines)
     └─ skill ──────▶ runes and cooldown paid ──▶ hooks.resolveSkill(state, hero, action, logLines, lastAction)
     ├─ a team has no hero left → match over
     ├─ it was a skill → turn ends
     └─ it was a move ─▶ hooks.afterAction(state, hero, { killed })
                          true  → the hero opened its phase (storm, ice, beast): same player decides again
                          false → turn ends

endTurn(state)                                          src/engine/turn.ts
 └─ roots tick down, wards drop, cooldowns tick, the next side with a legal action plays
```

The UI reads, without calling hooks: `HeroDef.ui` (prompts and button texts), `PhaseDef.prompt` and
`hint` (follow-up prompts), `skillReach` (the tinted reach on the board).

## Every file a hero touches

| File | Required? | What for |
|---|---|---|
| `src/engine/heroes/<id>.ts` | yes | rules, skill, phases, bot value, texts |
| `src/engine/heroes/index.ts` | yes | registration and picker order |
| `public/assets/icons/<id>.png`, `public/assets/art/<id>.jpg` | yes | portrait and card art |
| `test/arena.test.js` | yes | its rules |
| `src/ui/changelog.ts` | yes | patch notes |
| `src/engine/movement.ts` | if it moves in a new way | a `MOVE_RULES` entry |
| `src/engine/types.ts` | if it stores new state on a unit | a documented `Unit` field |
| `src/ui/game/effects.ts` | recommended | `SKILL_FX`, `HERO_FX` |
| `src/ui/theme.css`, `src/ui/styles.css` | recommended | reach and target colours |
| `src/ui/screens/GameScreen.tsx` | recommended | `SKILL_ICON` |
| `src/sfx-map.ts`, `src/ui/audio.ts` | recommended | its sound |
| `src/ui/components/HeroDemo.tsx` | recommended | its demo in hero details |
| `src/ui/components/HomeDemo.tsx` | optional | caption if it appears in the home demo |
| `src/ui/game/board.ts` | optional | a target class of its own |

Not touched by a new hero: `src/engine/rules.ts`, `src/engine/bot.ts`, `server/ws-server.ts`,
`src/ui/game/controller.ts`, the rest of `GameScreen.tsx`.

## Which existing hero to copy

| If the new skill… | Start from |
|---|---|
| targets a unit as the turn's action | `magumba.ts` (allies) or `plantae.ts` (enemies) |
| targets a square | `aqna.ts` (charge-gated) or `genga.ts` (summon) |
| triggers after the hero's own kill, with a choice | `hexor.ts` (`afterAction` + `definePhase`) |
| can be used on the opponent's turn | `plantae.ts` (`hooks.reaction`) |
| is part of its movement | `hasim.ts` (a movement rule, no hooks) |
| brings a companion unit | `genga.ts` (`defineUnit` + `spawn` + the `beast` phase) |
