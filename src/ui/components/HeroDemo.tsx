// A short looping demo of a hero's movement and skill, played on the real board with the real
// rules engine, so it shows the same moves, ranges and effects (slashes, storms, ice) as a match.
import { useEffect, useRef, useState } from 'react';
import { createMatch, applyAction, listActions, parseSquare } from '../../arena.js';
import { createBoard } from '../game/board.js';

type Game = any;
type Step = { text: string; ms?: number; show?: { live: string; armed?: boolean }; act?: any; state?: () => Game; bounce?: { by: string; target: string } };
type Demo = { setup: () => Game; steps: Step[] };

const sq = (n: string) => parseSquare(n);
const U = (team: 'p1' | 'p2', hero: string, at: string, x: any = {}) => ({
  id: `${team}-${hero}`, team, hero, kind: 'hero', pos: sq(at), alive: true, rooted: 0, warded: false, cd: 0, ...x,
});
const BEAST = (team: 'p1' | 'p2', at: string) => ({ ...U(team, 'beast', at), id: `${team}-beast`, kind: 'beast', ownerId: `${team}-genga` });

/** A clean board on `map` (its own terrain removed) with just these units and blocks. */
function scene(map: string, units: any[], blocks: Record<string, string> = {}, extra: any = {}): Game {
  const s = createMatch({ map, creeps: false });
  s.units = Object.fromEntries(units.map((u) => [u.id, u]));
  s.blocks = Object.fromEntries(Object.entries(blocks).map(([n, kind]) => { const p = sq(n); return [`${p.r},${p.c}`, { kind }]; }));
  s.log = [];
  return Object.assign(s, extra);
}
const mv = (id: string, to: string) => ({ type: 'move', unitId: id, to: sq(to) });
const sk = (id: string, x: any) => ({ type: 'skill', unitId: id, ...x });

// A far-away enemy keeps every demo from ending the match.
const KEEP = U('p2', 'plantae', 'h8');

const DEMOS: Record<string, Demo> = {
  hasim: {
    setup: () => scene('oasis', [U('p1', 'hasim', 'd3'), U('p2', 'genga', 'd4'), KEEP]),
    steps: [
      { text: 'Hasim steps 1 square in any direction. Red squares: Backstab.', show: { live: 'p1-hasim' }, ms: 2600 },
      { text: 'Backstab (free): he jumps over the enemy next to him and eliminates it.', act: mv('p1-hasim', 'd5'), ms: 2600 },
    ],
  },
  genga: {
    setup: () => scene('savanna', [U('p1', 'genga', 'd3'), BEAST('p1', 'd2'), U('p2', 'hexor', 'f5'), KEEP], {}, { energy: { p1: 4, p2: 0 } }), // Hexor can't afford a storm here
    steps: [
      { text: 'Ge\'nga steps 1 square in a straight line.', show: { live: 'p1-genga' }, ms: 2200 },
      { text: 'He moves first…', act: mv('p1-genga', 'd4'), ms: 1400 },
      { text: '…then his beast takes a free step, 1 square in any direction. No jumps, no special moves.', show: { live: 'p1-beast' }, ms: 2200 },
      { text: 'The beast steps forward.', act: mv('p1-beast', 'e3'), ms: 1500 },
      { text: 'If an enemy brings the beast down…', act: mv('p2-hexor', 'e3'), ms: 2000 },
      { text: 'Wild Company (3 runes): its reach is every square next to Ge\'nga.', show: { live: 'p1-genga', armed: true }, ms: 2200 },
      { text: 'The beast is summoned back.', act: sk('p1-genga', { skill: 'summon', to: sq('c4') }), ms: 2400 },
    ],
  },
  magumba: {
    setup: () => scene('savanna', [U('p1', 'magumba', 'c3'), U('p1', 'hasim', 'e5'), U('p2', 'aqna', 'e7'), KEEP]),
    steps: [
      { text: 'Magumba steps 1 square diagonally.', show: { live: 'p1-magumba' }, ms: 2200 },
      { text: 'Empty Grave (2 runes) covers a fan ahead of him, 2 squares deep — nothing in between blocks it.', show: { live: 'p1-magumba', armed: true }, ms: 2800 },
      { text: 'He shields Hasim until his next turn.', act: sk('p1-magumba', { skill: 'grave', targetId: 'p1-hasim' }), ms: 2200 },
      { text: 'Aqna goes for Hasim…', show: { live: 'p2-aqna' }, ms: 1500 },
      { text: '…and the shield throws her back. Attacks on Hasim are negated until Magumba\'s next turn.', bounce: { by: 'p2-aqna', target: 'p1-hasim' }, ms: 3000 },
    ],
  },
  plantae: {
    setup: () => scene('jungle', [U('p1', 'plantae', 'd3'), U('p2', 'hexor', 'd6'), U('p2', 'aqna', 'f5'), KEEP]),
    steps: [
      { text: 'Plantae steps 1 square straight. The green squares are her reach: a 3x3 block right in front of her, unblocked by anything in between.', show: { live: 'p1-plantae' }, ms: 2800 },
      { text: 'Aggressive Root (3 runes): Hexor is in the block, no matter what\'s between them. Aqna, outside it, can\'t be targeted.', show: { live: 'p1-plantae', armed: true }, ms: 2600 },
      { text: 'Hexor is rooted: he can\'t act on his next turn.', act: sk('p1-plantae', { skill: 'root', targetId: 'p2-hexor' }), ms: 2400 },
      {
        text: 'On the enemy turn it works as an interrupt…',
        state: () => scene('jungle', [U('p1', 'plantae', 'd3'), U('p2', 'genga', 'd5'), BEAST('p2', 'c5'), KEEP], {}, { current: 'p2', turn: 2 }),
        ms: 1500,
      },
      { text: 'Ge\'nga acts inside her block: Plantae may answer.', act: mv('p2-genga', 'd6'), ms: 2400 },
      { text: 'Interrupt (3 runes): the action is negated. Then the skill recharges for 3 turns.', act: { type: 'react', use: true }, ms: 2800 },
    ],
  },
  hexor: {
    setup: () => scene('keep', [U('p1', 'hexor', 'd5'), U('p1', 'magumba', 'd7'), U('p2', 'aqna', 'e7'), U('p2', 'genga', 'e8'), U('p2', 'plantae', 'f7'), U('p2', 'hasim', 'a1')], { g7: 'rock' }, { energy: { p1: 4, p2: 0 } }), // no interrupt from that Plantae
    steps: [
      { text: 'Hexor jumps in an L, like a chess knight, over anything.', show: { live: 'p1-hexor' }, ms: 2400 },
      { text: 'He captures Aqna…', act: mv('p1-hexor', 'e7'), ms: 1600 },
      { text: 'Storm Hammer (2 runes): pick a pattern, + or X.', ms: 1800 },
      { text: 'Slam +: the 4 straight squares around him are pushed 2 squares. Magumba slides 2; the edge and the rock block the others, so they slip into an empty square beside them — never eliminated.', act: { type: 'storm', pattern: 'plus' }, ms: 3200 },
    ],
  },
  aqna: {
    setup: () => scene('keep', [U('p1', 'aqna', 'd3'), U('p2', 'hasim', 'd5'), KEEP]),
    steps: [
      { text: 'Aqna moves up to 2 squares in a straight line.', show: { live: 'p1-aqna' }, ms: 2200 },
      { text: 'She eliminates Hasim and stores an ice charge — never more than one at a time.', act: mv('p1-aqna', 'd5'), ms: 2000 },
      { text: 'Spend it whenever you like, even turns later: Icy Step (1 rune) then reaches every square within 3 of her.', ms: 2400 },
      { text: 'An ice block rises. Nobody can enter it, not even her.', act: { type: 'ice', to: sq('f4') }, ms: 2600 },
    ],
  },
};

export function hasDemo(hero: string) { return !!DEMOS[hero]; }

export function HeroDemo({ hero, compact }: { hero: string; compact?: boolean }) {
  const demo = DEMOS[hero];
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = useRef<HTMLDivElement>(null);
  const fig = useRef<HTMLElement>(null);
  const board = useRef<ReturnType<typeof createBoard> | null>(null);
  const game = useRef<Game>(null);
  const [i, setI] = useState(-1); // -1: initial board, then step index
  const [playing, setPlaying] = useState(!reduce);
  const [visible, setVisible] = useState(true);

  // Mount the board once per hero.
  useEffect(() => {
    if (!demo || !host.current) return;
    (host.current as any).inert = true; // a picture, not controls
    board.current = createBoard(host.current, { onCell: () => {} });
    game.current = demo.setup();
    board.current.render(game.current, { acts: [], live: null, threats: new Set() });
    setI(-1);
    return () => { board.current?.destroy(); board.current = null; };
  }, [hero]);

  useEffect(() => {
    const el = fig.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** Show the board as it stands after step `k` (replaying the steps without effects). */
  function seek(k: number) {
    const b = board.current;
    if (!b || !demo) return;
    let g = demo.setup();
    for (let j = 0; j <= k - 1; j++) g = advance(g, demo.steps[j]);
    b.reset();
    game.current = g;
    if (k >= 0) play(k, false); else b.render(g, { acts: [], live: null, threats: new Set() });
    setI(k);
  }
  function advance(g: Game, st: Step) {
    if (st.state) g = st.state();
    if (st.act) { const r = applyAction(g, st.act); if (r.ok) g = r.state; else console.warn('demo step refused', hero, r.reason); }
    return g;
  }
  /** Run step `k` on the live board, with its effects when `fx`. */
  function play(k: number, fx = true) {
    const b = board.current, st = demo.steps[k];
    if (!b) return;
    let g = game.current;
    if (st.state) { g = st.state(); b.reset(); }
    if (st.act) {
      const before = g;
      const r = applyAction(g, st.act);
      if (!r.ok) { console.warn('demo step refused', hero, r.reason); return; }
      g = r.state;
      const plan = fx ? b.plan(before, g) : { deathDelay: 0 };
      const hits = g.lastAction && g.lastAction !== before.lastAction ? g.lastAction.hits || [] : [];
      b.render(g, { acts: [], live: null, threats: new Set(), deathDelay: plan.deathDelay, hits: fx ? hits : [] });
      if (fx) { if ((plan as any).hop) b.hop((plan as any).hop); b.run(plan); }
    } else if (st.bounce) {
      const by = g.units[st.bounce.by], t = g.units[st.bounce.target];
      b.render(g, { acts: [], live: by, threats: new Set() });
      if (fx) b.shieldBounce(by.id, by.pos, t.id, t.pos, true);
    } else {
      const live = st.show ? g.units[st.show.live] : null;
      b.render(g, { acts: listActions(g), live, armed: !!st.show?.armed, threats: new Set() });
    }
    game.current = g;
  }

  useEffect(() => {
    if (!demo || !playing || !visible) return;
    const wait = i < 0 ? 900 : demo.steps[i].ms ?? 2000;
    const t = setTimeout(() => {
      const k = i + 1;
      if (k >= demo.steps.length) { seek(-1); return; } // loop: back to the opening position
      play(k); setI(k);
    }, wait);
    return () => clearTimeout(t);
  }, [i, playing, visible, hero]);

  if (!demo) return null;
  const text = i < 0 ? demo.steps[0].text : demo.steps[i].text;
  return (
    <figure className={`demo${compact ? ' compact' : ''}`} ref={fig as any}>
      <div className="demo-stage" ref={host} aria-hidden="true" />
      <figcaption>
        <span className="demo-text" key={i} aria-live="off">{text}</span>
        <span className="demo-ctl">
          <button type="button" className="demo-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause demo' : 'Play demo'}>
            {playing ? <svg viewBox="0 0 16 16"><path d="M5 3v10M11 3v10" /></svg> : <svg viewBox="0 0 16 16"><path d="M5 3l8 5-8 5z" /></svg>}
          </button>
          {demo.steps.map((_, k) => (
            <button key={k} type="button" className={`demo-dot${k === i ? ' on' : ''}`} aria-label={`Step ${k + 1}`}
              onClick={() => { setPlaying(false); seek(k); }} />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
