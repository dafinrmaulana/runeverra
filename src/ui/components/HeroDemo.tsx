// A short looping demo of a hero's movement and skill on a 7×7 board, played like a clip.
// Scripted frames (absolute positions per frame); pieces glide between frames.
import { useEffect, useRef, useState } from 'react';
import { BEAST_SVG } from '../game/board.js';
import { ICON, moveCells } from '../data';

type Team = 'p1' | 'p2';
type Unit = { id: string; kind?: 'hero' | 'beast' | 'block' | 'ice'; hero?: string; team?: Team; r: number; c: number; gone?: boolean; fx?: 'ward' | 'root' | 'pulse' | 'bump' };
type Mark = { r: number; c: number; t: 'go' | 'jump' | 'target' | 'hit' | 'shield' };
type Frame = { units: Unit[]; marks?: Mark[]; text: string; ms?: number };

const N = 7;
const at = (r: number, c: number) => ({ r, c });
const reach = (hero: string, r = 3, c = 3): Mark[] =>
  moveCells(hero).flatMap((k, i) => (k === 'go' || k === 'jump' ? [{ r: Math.floor(i / N) - 3 + r, c: (i % N) - 3 + c, t: k as 'go' | 'jump' }] : []))
    .filter((m) => m.r >= 0 && m.c >= 0 && m.r < N && m.c < N);
const me = (hero: string, r: number, c: number, x: Partial<Unit> = {}): Unit => ({ id: hero, hero, team: 'p1', r, c, ...x });
const foe = (id: string, hero: string, r: number, c: number, x: Partial<Unit> = {}): Unit => ({ id, hero, team: 'p2', r, c, ...x });
const ally = (id: string, hero: string, r: number, c: number, x: Partial<Unit> = {}): Unit => ({ id, hero, team: 'p1', r, c, ...x });

const SCRIPTS: Record<string, Frame[]> = {
  hasim: [
    { units: [me('hasim', 3, 3)], marks: reach('hasim'), text: 'Steps 1 square in any direction. Red squares: Backstab.', ms: 2400 },
    { units: [me('hasim', 4, 3), foe('a', 'genga', 3, 3)], marks: [{ ...at(2, 3), t: 'jump' }, { ...at(3, 3), t: 'target' }], text: 'An enemy stands next to him…' },
    { units: [me('hasim', 2, 3), foe('a', 'genga', 3, 3, { gone: true })], marks: [{ ...at(3, 3), t: 'hit' }], text: 'Backstab (free): he jumps over it and the enemy is eliminated.', ms: 2200 },
    { units: [me('hasim', 2, 3)], text: 'No tokens needed: it is simply one of his moves.' },
  ],
  genga: [
    { units: [me('genga', 3, 3), { id: 'b', kind: 'beast', team: 'p1', r: 4, c: 3 }], marks: reach('genga'), text: 'Moves up to 2 squares in a straight line.', ms: 2200 },
    { units: [me('genga', 1, 3), { id: 'b', kind: 'beast', team: 'p1', r: 4, c: 3 }], text: 'Ge\'nga moves first…' },
    { units: [me('genga', 1, 3), { id: 'b', kind: 'beast', team: 'p1', r: 3, c: 4 }], marks: [{ ...at(3, 4), t: 'go' }], text: '…then his beast takes a free step (1 square, any way).' },
    { units: [me('genga', 1, 3), { id: 'b', kind: 'beast', team: 'p1', r: 3, c: 4, gone: true }, foe('a', 'hexor', 3, 4)], marks: [{ ...at(3, 4), t: 'hit' }], text: 'If the beast falls…' },
    { units: [me('genga', 1, 3), { id: 'b', kind: 'beast', team: 'p1', r: 1, c: 2, fx: 'pulse' }, foe('a', 'hexor', 3, 4)], marks: [{ ...at(1, 2), t: 'target' }], text: 'Wild Company (3 tokens): summon it back next to Ge\'nga.', ms: 2200 },
  ],
  magumba: [
    { units: [me('magumba', 3, 3)], marks: reach('magumba'), text: 'Moves up to 2 squares diagonally.', ms: 2200 },
    { units: [me('magumba', 4, 2), ally('h', 'hasim', 2, 4), foe('a', 'aqna', 1, 4)], marks: [{ ...at(2, 4), t: 'target' }], text: 'Empty Grave (2 tokens): pick an ally within 3 squares.' },
    { units: [me('magumba', 4, 2), ally('h', 'hasim', 2, 4, { fx: 'ward' }), foe('a', 'aqna', 1, 4)], text: 'It is protected until Magumba\'s next turn.' },
    { units: [me('magumba', 4, 2), ally('h', 'hasim', 2, 4, { fx: 'ward' }), foe('a', 'aqna', 1, 4, { fx: 'bump' })], marks: [{ ...at(2, 4), t: 'shield' }], text: 'Enemy attacks on it are negated.', ms: 2200 },
  ],
  plantae: [
    { units: [me('plantae', 3, 3)], marks: reach('plantae'), text: 'Steps 1 square in a straight line.', ms: 2200 },
    { units: [me('plantae', 3, 3), foe('a', 'hexor', 1, 5)], marks: [{ ...at(1, 5), t: 'target' }], text: 'Aggressive Root (3 tokens): an enemy within 3 squares, diagonals too.' },
    { units: [me('plantae', 3, 3), foe('a', 'hexor', 1, 5, { fx: 'root' })], text: 'It can\'t act on its next turn. Then the skill recharges for 3 turns.', ms: 2200 },
    { units: [me('plantae', 3, 3), foe('b', 'genga', 5, 1)], text: 'Or on the enemy\'s turn, as an interrupt (3 tokens):' },
    { units: [me('plantae', 3, 3), foe('b', 'genga', 4, 2)], marks: [{ ...at(4, 2), t: 'hit' }], text: 'an enemy acting within 3 squares has its action negated…' },
    { units: [me('plantae', 3, 3, { fx: 'root' }), foe('b', 'genga', 5, 1)], text: '…but Plantae is rooted on your next turn.', ms: 2200 },
  ],
  hexor: [
    { units: [me('hexor', 3, 3), { id: 'w', kind: 'block', r: 1, c: 6 }], marks: reach('hexor'), text: 'Jumps in an L, like a chess knight, over anything.', ms: 2200 },
    { units: [me('hexor', 3, 3), foe('a', 'aqna', 1, 4), foe('b', 'genga', 1, 5), foe('c', 'plantae', 0, 4), ally('h', 'magumba', 2, 3), { id: 'w', kind: 'block', r: 1, c: 6 }], marks: [{ ...at(1, 4), t: 'target' }], text: 'He captures with a jump…' },
    { units: [me('hexor', 1, 4), foe('a', 'aqna', 1, 4, { gone: true }), foe('b', 'genga', 1, 5), foe('c', 'plantae', 0, 4), ally('h', 'magumba', 2, 3), { id: 'w', kind: 'block', r: 1, c: 6 }], marks: [{ ...at(1, 4), t: 'hit' }], text: '…then may spend 2 tokens on Storm Hammer:' },
    { units: [me('hexor', 1, 4, { fx: 'pulse' }), foe('b', 'genga', 1, 5, { gone: true }), foe('c', 'plantae', 0, 4, { gone: true }), ally('h', 'magumba', 3, 2), { id: 'w', kind: 'block', r: 1, c: 6 }], marks: [{ ...at(1, 5), t: 'hit' }, { ...at(0, 4), t: 'hit' }], text: 'everything around him is pushed 1 square. Enemies hitting terrain or the edge are eliminated; allies just move.', ms: 2800 },
  ],
  aqna: [
    { units: [me('aqna', 3, 3)], marks: reach('aqna'), text: 'Moves up to 2 squares in a straight line.', ms: 2200 },
    { units: [me('aqna', 3, 3), foe('a', 'hasim', 1, 3)], marks: [{ ...at(1, 3), t: 'target' }], text: 'She eliminates an enemy…' },
    { units: [me('aqna', 1, 3), foe('a', 'hasim', 1, 3, { gone: true })], marks: [{ ...at(1, 3), t: 'hit' }], text: '…then may spend 1 token on Icy Step:' },
    { units: [me('aqna', 1, 3), { id: 'i', kind: 'ice', r: 3, c: 4, fx: 'pulse' }], marks: [{ ...at(3, 4), t: 'target' }], text: 'an ice block rises within 3 squares. Nobody can enter it, not even her.', ms: 2600 },
  ],
};

export function hasDemo(hero: string) { return !!SCRIPTS[hero]; }

export function HeroDemo({ hero, compact }: { hero: string; compact?: boolean }) {
  const frames = SCRIPTS[hero];
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(!reduce);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => { setI(0); }, [hero]);
  // Only run while on screen (the in-game panel can be collapsed or scrolled away).
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!frames || !playing || !visible) return;
    const t = setTimeout(() => setI((n) => (n + 1) % frames.length), frames[i].ms ?? 1800);
    return () => clearTimeout(t);
  }, [i, playing, visible, frames]);
  if (!frames) return null;
  const f = frames[i];
  const ids = new Set<string>();
  frames.forEach((fr) => fr.units.forEach((u) => ids.add(u.id)));
  return (
    <figure className={`demo${compact ? ' compact' : ''}`} ref={box} aria-label={`Demo: ${frames.map((x) => x.text).join(' ')}`}>
      <div className={`demo-board${i === 0 ? ' restart' : ''}`}>
        {Array.from({ length: N * N }, (_, k) => {
          const r = Math.floor(k / N), c = k % N;
          const m = f.marks?.find((x) => x.r === r && x.c === c);
          return <i key={k} className={`${(r + c) % 2 ? 'd' : ''}${m ? ` m-${m.t}` : ''}`} />;
        })}
        {[...ids].map((id) => {
          const u = f.units.find((x) => x.id === id);
          const last = u || [...frames.slice(0, i)].reverse().map((fr) => fr.units.find((x) => x.id === id)).find(Boolean);
          const next = frames.slice(i).map((fr) => fr.units.find((x) => x.id === id)).find(Boolean);
          const pos = u || last || next || { r: 0, c: 0 };
          const shown = !!u && !u.gone;
          const pu = frames[(i - 1 + frames.length) % frames.length].units.find((x) => x.id === id);
          const enter = shown && (!pu || pu.gone); // appears: fade in where it stands, don't slide there
          const proto: Unit = u || last || next || { id, r: 0, c: 0 };
          return (
            <span key={`${id}-${proto.kind || 'hero'}`} className={`du ${proto.kind || 'hero'} ${proto.team || ''}${shown ? '' : ' gone'}${enter ? ' enter' : ''}${u?.fx ? ` fx-${u.fx}` : ''}`}
              style={{ transform: `translate(${pos.c * 100}%, ${pos.r * 100}%)` }}>
              {(proto.kind || 'hero') === 'hero' && <img src={ICON(proto.hero!)} alt="" />}
              {proto.kind === 'beast' && <b dangerouslySetInnerHTML={{ __html: BEAST_SVG }} />}
            </span>
          );
        })}
        {f.marks?.filter((m) => m.t === 'hit').map((m) => <em key={`${i}-${m.r}-${m.c}`} className="burst" style={{ left: `${(m.c + .5) * 100 / N}%`, top: `${(m.r + .5) * 100 / N}%` }} />)}
      </div>
      <figcaption>
        <span className="demo-text" key={i}>{f.text}</span>
        <span className="demo-ctl">
          <button type="button" className="demo-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause demo' : 'Play demo'}>
            {playing ? <svg viewBox="0 0 16 16"><path d="M5 3v10M11 3v10" /></svg> : <svg viewBox="0 0 16 16"><path d="M5 3l8 5-8 5z" /></svg>}
          </button>
          {frames.map((_, k) => <button key={k} type="button" className={`demo-dot${k === i ? ' on' : ''}`} aria-label={`Step ${k + 1}`} onClick={() => { setI(k); setPlaying(false); }} />)}
        </span>
      </figcaption>
    </figure>
  );
}
