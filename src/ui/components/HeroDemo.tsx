// A short looping demo of a hero's movement and skill, played on the real board with the real
// rules engine, so it shows the same moves, ranges and effects (slashes, storms, ice) as a match.
import { useEffect, useRef, useState } from 'react';
import { createMatch, applyAction, listActions, parseSquare } from '../../engine/index.ts';
import type { Action, State, Team, Unit } from '../../engine/index.ts';
import { createBoard } from '../game/board.ts';

/** One beat of a demo: its caption, how long it stays, and at most one thing that happens. */
type Step = {
  text: string;
  ms?: number;
  show?: { live: string; armed?: boolean }; // select this unit (and arm its skill) to show its reach
  act?: Action; // play this action, with its effects
  state?: () => State; // jump to a new position first
  bounce?: { by: string; target: string }; // an attack bouncing off Empty Grave (nothing changes)
};
type Demo = { setup: () => State; steps: Step[] };

const sq = (name: string) => parseSquare(name);
/** A hero of `team` standing on square `at` ("d4"). */
const unit = (team: Team, hero: string, at: string, extra: Partial<Unit> = {}): Unit => ({
  id: `${team}-${hero}`,
  team,
  hero,
  kind: 'hero',
  pos: sq(at),
  alive: true,
  rooted: 0,
  warded: false,
  cd: 0,
  ...extra,
});
const beastUnit = (team: Team, at: string): Unit => ({
  ...unit(team, 'beast', at),
  id: `${team}-beast`,
  kind: 'beast',
  ownerId: `${team}-genga`,
});

/** A clean board on `map` (its own terrain removed) with just these units and blocks. */
function scene(map: string, units: Unit[], blocks: Record<string, string> = {}, extra: Partial<State> = {}): State {
  const s = createMatch({ map, creeps: false });
  s.units = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  s.blocks = Object.fromEntries(
    Object.entries(blocks).map(([square, kind]) => {
      const p = sq(square);
      return [`${p.r},${p.c}`, { kind }];
    }),
  );
  s.log = [];
  return Object.assign(s, extra);
}
const move = (unitId: string, to: string): Action => ({ type: 'move', unitId, to: sq(to) });
const cast = (unitId: string, details: Partial<Action>): Action => ({ type: 'skill', unitId, ...details });

// A far-away enemy keeps every demo from ending the match.
const KEEP = unit('p2', 'plantae', 'h8');

const DEMOS: Record<string, Demo> = {
  hasim: {
    setup: () => scene('oasis', [unit('p1', 'hasim', 'd3'), unit('p2', 'genga', 'd4'), KEEP]),
    steps: [
      { text: 'Hasim steps 1 square in any direction. Red squares: Backstab.', show: { live: 'p1-hasim' }, ms: 2600 },
      {
        text: 'Backstab (free): he jumps over the enemy next to him and eliminates it.',
        act: move('p1-hasim', 'd5'),
        ms: 2600,
      },
    ],
  },
  genga: {
    setup: () =>
      scene(
        'savanna',
        [unit('p1', 'genga', 'd3'), beastUnit('p1', 'd2'), unit('p2', 'hexor', 'f5'), KEEP],
        {},
        { energy: { p1: 4, p2: 0 } },
      ), // Hexor can't afford a storm here
    steps: [
      { text: "Ge'nga steps 1 square in a straight line.", show: { live: 'p1-genga' }, ms: 2200 },
      { text: 'He moves first…', act: move('p1-genga', 'd4'), ms: 1400 },
      {
        text: '…then his beast takes a free step, 1 square in any direction. No jumps, no special moves.',
        show: { live: 'p1-beast' },
        ms: 2200,
      },
      { text: 'The beast steps forward.', act: move('p1-beast', 'e3'), ms: 1500 },
      { text: 'If an enemy brings the beast down…', act: move('p2-hexor', 'e3'), ms: 2000 },
      {
        text: "Wild Company (3 runes): its reach is every square next to Ge'nga.",
        show: { live: 'p1-genga', armed: true },
        ms: 2200,
      },
      { text: 'The beast is summoned back.', act: cast('p1-genga', { skill: 'summon', to: sq('c4') }), ms: 2400 },
    ],
  },
  magumba: {
    setup: () =>
      scene('savanna', [unit('p1', 'magumba', 'c3'), unit('p1', 'hasim', 'e5'), unit('p2', 'aqna', 'e7'), KEEP]),
    steps: [
      { text: 'Magumba steps 1 square diagonally.', show: { live: 'p1-magumba' }, ms: 2200 },
      {
        text: 'Empty Grave (2 runes) covers a fan ahead of him, 2 squares deep — nothing in between blocks it.',
        show: { live: 'p1-magumba', armed: true },
        ms: 2800,
      },
      {
        text: 'He shields Hasim until his next turn.',
        act: cast('p1-magumba', { skill: 'grave', targetId: 'p1-hasim' }),
        ms: 2200,
      },
      { text: 'Aqna goes for Hasim…', show: { live: 'p2-aqna' }, ms: 1500 },
      {
        text: "…and the shield throws her back. Attacks on Hasim are negated until Magumba's next turn.",
        bounce: { by: 'p2-aqna', target: 'p1-hasim' },
        ms: 3000,
      },
    ],
  },
  plantae: {
    setup: () =>
      scene('jungle', [unit('p1', 'plantae', 'd3'), unit('p2', 'hexor', 'd6'), unit('p2', 'aqna', 'f5'), KEEP]),
    steps: [
      {
        text: 'Plantae steps 1 square straight. The green squares are her reach: a 3x3 block right in front of her, unblocked by anything in between.',
        show: { live: 'p1-plantae' },
        ms: 2800,
      },
      {
        text: "Aggressive Root (3 runes): Hexor is in the block, no matter what's between them. Aqna, outside it, can't be targeted.",
        show: { live: 'p1-plantae', armed: true },
        ms: 2600,
      },
      {
        text: "Hexor is rooted: he can't act on his next turn.",
        act: cast('p1-plantae', { skill: 'root', targetId: 'p2-hexor' }),
        ms: 2400,
      },
      {
        text: 'On the enemy turn it works as an interrupt…',
        state: () =>
          scene(
            'jungle',
            [unit('p1', 'plantae', 'd3'), unit('p2', 'genga', 'd5'), beastUnit('p2', 'c5'), KEEP],
            {},
            { current: 'p2', turn: 2 },
          ),
        ms: 1500,
      },
      { text: "Ge'nga acts inside her block: Plantae may answer.", act: move('p2-genga', 'd6'), ms: 2400 },
      {
        text: 'Interrupt (3 runes): the action is negated. Then the skill recharges for 3 turns.',
        act: { type: 'react', use: true },
        ms: 2800,
      },
    ],
  },
  hexor: {
    setup: () =>
      scene(
        'keep',
        [
          unit('p1', 'hexor', 'd5'),
          unit('p1', 'magumba', 'd7'),
          unit('p2', 'aqna', 'e7'),
          unit('p2', 'genga', 'e8'),
          unit('p2', 'plantae', 'f7'),
          unit('p2', 'hasim', 'a1'),
        ],
        { g7: 'rock' },
        { energy: { p1: 4, p2: 0 } },
      ), // no interrupt from that Plantae
    steps: [
      { text: 'Hexor jumps in an L, like a chess knight, over anything.', show: { live: 'p1-hexor' }, ms: 2400 },
      { text: 'He captures Aqna…', act: move('p1-hexor', 'e7'), ms: 1600 },
      { text: 'Storm Hammer (2 runes): pick a pattern, + or X.', ms: 1800 },
      {
        text: 'Slam +: the 4 straight squares around him are pushed 2 squares. Magumba slides 2; the edge and the rock block the others, so they slip into an empty square beside them — never eliminated.',
        act: { type: 'storm', pattern: 'plus' },
        ms: 3200,
      },
    ],
  },
  aqna: {
    setup: () => scene('keep', [unit('p1', 'aqna', 'd3'), unit('p2', 'hasim', 'd5'), KEEP]),
    steps: [
      { text: 'Aqna moves up to 2 squares in a straight line.', show: { live: 'p1-aqna' }, ms: 2200 },
      {
        text: 'She eliminates Hasim and stores an ice charge — never more than one at a time.',
        act: move('p1-aqna', 'd5'),
        ms: 2000,
      },
      {
        text: 'Spend it whenever you like, even turns later: Icy Step (1 rune) then reaches every square within 3 of her.',
        ms: 2400,
      },
      { text: 'An ice block rises. Nobody can enter it, not even her.', act: { type: 'ice', to: sq('f4') }, ms: 2600 },
    ],
  },
};

export function hasDemo(hero: string) {
  return !!DEMOS[hero];
}

export function HeroDemo({ hero, compact }: { hero: string; compact?: boolean }) {
  const demo = DEMOS[hero];
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = useRef<HTMLDivElement>(null);
  const fig = useRef<HTMLElement>(null);
  const board = useRef<ReturnType<typeof createBoard> | null>(null);
  const game = useRef<State | null>(null);
  const [i, setI] = useState(-1); // -1: initial board, then step index
  const [playing, setPlaying] = useState(!reduce);
  const [visible, setVisible] = useState(true);

  // Mount the board once per hero.
  useEffect(() => {
    if (!demo || !host.current) return;
    host.current.inert = true; // a picture, not controls
    board.current = createBoard(host.current, { onCell: () => {} });
    game.current = demo.setup();
    board.current.render(game.current, { acts: [], live: null, threats: new Set() });
    setI(-1);
    return () => {
      board.current?.destroy();
      board.current = null;
    };
    // `demo` is derived from `hero`: one board per hero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero]);

  useEffect(() => {
    const el = fig.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** Show the board as it stands after step `stepIndex` (replaying the steps without effects). */
  function seek(stepIndex: number) {
    const b = board.current;
    if (!b || !demo) return;
    let g = demo.setup();
    for (let j = 0; j <= stepIndex - 1; j++) g = advance(g, demo.steps[j]);
    b.reset();
    game.current = g;
    if (stepIndex >= 0) play(stepIndex, false);
    else b.render(g, { acts: [], live: null, threats: new Set() });
    setI(stepIndex);
  }
  function advance(state: State, st: Step) {
    if (st.state) state = st.state();
    if (st.act) {
      const r = applyAction(state, st.act);
      if (r.ok) state = r.state;
      else console.warn('demo step refused', hero, r.reason);
    }
    return state;
  }
  /** Run step `stepIndex` on the live board, with its effects when `fx`. */
  function play(stepIndex: number, fx = true) {
    const b = board.current,
      st = demo!.steps[stepIndex];
    if (!b) return;
    let g = game.current!;
    if (st.state) {
      g = st.state();
      b.reset();
    }
    if (st.act) {
      const before = g;
      const r = applyAction(g, st.act);
      if (!r.ok) {
        console.warn('demo step refused', hero, r.reason);
        return;
      }
      g = r.state;
      const plan = fx ? b.plan(before, g) : null;
      const hits = g.lastAction && g.lastAction !== before.lastAction ? g.lastAction.hits || [] : [];
      b.render(g, {
        acts: [],
        live: null,
        threats: new Set(),
        deathDelay: plan?.deathDelay ?? 0,
        hits: fx ? hits : [],
      });
      if (plan) {
        if (plan.hop) b.hop(plan.hop);
        b.run(plan);
      }
    } else if (st.bounce) {
      const by = g.units[st.bounce.by],
        t = g.units[st.bounce.target];
      b.render(g, { acts: [], live: by, threats: new Set() });
      if (fx) b.shieldBounce({ attackerId: by.id, from: by.pos, targetId: t.id, to: t.pos });
    } else {
      const live = st.show ? g.units[st.show.live] : null;
      b.render(g, { acts: listActions(g), live, armed: !!st.show?.armed, threats: new Set() });
    }
    game.current = g;
  }

  useEffect(() => {
    if (!demo || !playing || !visible) return;
    const wait = i < 0 ? 900 : (demo.steps[i].ms ?? 2000);
    const t = setTimeout(() => {
      const k = i + 1;
      if (k >= demo.steps.length) {
        seek(-1);
        return;
      } // loop: back to the opening position
      play(k);
      setI(k);
    }, wait);
    return () => clearTimeout(t);
    // `play` and `seek` are recreated every render but only read refs and `demo` (derived from `hero`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing, visible, hero]);

  if (!demo) return null;
  const text = i < 0 ? demo.steps[0].text : demo.steps[i].text;
  return (
    <figure className={`demo${compact ? ' compact' : ''}`} ref={fig}>
      <div className="demo-stage" ref={host} aria-hidden="true" />
      <figcaption>
        <span className="demo-text" key={i} aria-live="off">
          {text}
        </span>
        <span className="demo-ctl">
          <button
            type="button"
            className="demo-btn"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause demo' : 'Play demo'}
          >
            {playing ? (
              <svg viewBox="0 0 16 16">
                <path d="M5 3v10M11 3v10" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16">
                <path d="M5 3l8 5-8 5z" />
              </svg>
            )}
          </button>
          {demo.steps.map((_, stepIndex) => (
            <button
              key={stepIndex}
              type="button"
              className={`demo-dot${stepIndex === i ? ' on' : ''}`}
              aria-label={`Step ${stepIndex + 1}`}
              onClick={() => {
                setPlaying(false);
                seek(stepIndex);
              }}
            />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
