// The Runeverra floor: a mossy medieval stone floor seen from above, with a great rune circle that turns
// forever. It sits behind every screen: full on the home screen, a faint turning circle elsewhere, and
// barely there during a match. It answers the pointer: a soft light follows it and the circle's lines
// glow under it, shining through a slow mist that drifts over the whole floor. Everything is SVG and CSS, no image files.
import { useEffect, useMemo, useRef } from 'react';

export type FloorMode = 'home' | 'dim' | 'game';

const S = 2400, C = S / 2;
const SAND = '#e3b878';

function rng(seed: number) { // mulberry32: the same floor every time
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const GLYPHS = [
  'M0,-22 V22 M0,-6 L12,-18 M0,8 L12,-4',
  'M0,-22 V22 M-12,-12 L0,-22 L12,-12 M-10,10 H10',
  'M-10,-20 L10,0 L-10,20 M10,-20 V20',
  'M0,-22 V22 M-12,-6 H12 M-8,14 L0,5 L8,14',
  'M-11,-22 V22 M-11,-4 L11,-22 M-11,-4 L11,18',
  'M0,-22 L12,0 L0,22 L-12,0 Z M0,-10 V10',
];

/** A compass star: long points north/east/south/west, shorter ones between. */
function star(long: number, mid: number, short: number) {
  return Array.from({ length: 16 }, (_, i) => {
    const r = i % 4 === 0 ? long : i % 2 === 0 ? mid : short, a = (i * Math.PI) / 8;
    return `${(r * Math.sin(a)).toFixed(1)},${(-r * Math.cos(a)).toFixed(1)}`;
  }).join(' ');
}
const ngon = (n: number, r: number, order?: number[]) => {
  const pts = Array.from({ length: n }, (_, i) => `${(r * Math.sin((i * 2 * Math.PI) / n)).toFixed(1)},${(-r * Math.cos((i * 2 * Math.PI) / n)).toFixed(1)}`);
  return (order || pts.map((_, i) => i)).map((i) => pts[i]).join(' ');
};

function StoneFloor() {
  const parts = useMemo(() => {
    const r = rng(11);
    const tones = ['#4a4036', '#4f4439', '#453c33', '#51463b', '#42392f', '#4c4238'];
    const tiles = [];
    for (let gy = 0; gy < 12; gy++) for (let gx = 0; gx < 12; gx++) {
      tiles.push(<rect key={`${gx}-${gy}`} x={gx * 200 + 5} y={gy * 200 + 5} width="190" height="190" rx="16" fill={tones[Math.floor(r() * tones.length)]} />);
    }
    const cracks = Array.from({ length: 22 }, (_, i) => {
      let x = r() * S, y = r() * S; const pts = [`${x.toFixed(0)},${y.toFixed(0)}`];
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; pts.push(`${x.toFixed(0)},${y.toFixed(0)}`); }
      return <polyline key={i} points={pts.join(' ')} fill="none" stroke="#17120f" strokeWidth={1.5 + r() * 2} opacity=".55" strokeLinejoin="round" />;
    });
    const mossTones = ['#41583a', '#4d6a43', '#58774b', '#35492f'];
    const moss = [];
    for (let i = 0; i < 70; i++) {
      const onV = r() < 0.5, line = Math.floor(r() * 12) * 200;
      const cx = onV ? line + (r() - 0.5) * 36 : r() * S, cy = onV ? r() * S : line + (r() - 0.5) * 36;
      const n = 6 + Math.floor(r() * 9);
      for (let k = 0; k < n; k++) {
        moss.push(<circle key={`${i}-${k}`} cx={(cx + (r() - 0.5) * 70).toFixed(0)} cy={(cy + (r() - 0.5) * 70).toFixed(0)} r={(5 + r() * 15).toFixed(1)} fill={mossTones[Math.floor(r() * mossTones.length)]} opacity={(0.55 + r() * 0.4).toFixed(2)} />);
      }
    }
    const flowers = Array.from({ length: 26 }, (_, i) => {
      const x = r() * S, y = r() * S;
      return (
        <g key={i} transform={`translate(${x.toFixed(0)} ${y.toFixed(0)})`} opacity=".85">
          {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={5 * Math.sin((a * Math.PI) / 180)} cy={-5 * Math.cos((a * Math.PI) / 180)} r="3.4" fill="#efe6cf" />)}
          <circle r="2.4" fill="#d9a35a" />
        </g>
      );
    });
    return { tiles, cracks, moss, flowers };
  }, []);

  const medallion = (x: number, y: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y})`} fill="none" stroke={SAND} opacity=".5">
      <circle r="70" strokeWidth="3" /><circle r="58" strokeWidth="1.5" /><polygon points={star(52, 26, 16)} strokeWidth="2" />
    </g>
  );

  return (
    <svg className="floor-stone" viewBox={`0 0 ${S} ${S}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="fl-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#000" stopOpacity=".16" /></linearGradient>
        <filter id="fl-noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="4" /><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 .9 -.25" /></filter>
      </defs>
      <rect width={S} height={S} fill="#1a1512" />
      {parts.tiles}
      <rect width={S} height={S} fill="url(#fl-tile)" opacity=".5" style={{ mixBlendMode: 'multiply' }} />
      {parts.cracks}
      {parts.moss}
      {parts.flowers}
      {medallion(C - 880, C - 620)}{medallion(C + 880, C - 620)}{medallion(C - 880, C + 620)}{medallion(C + 880, C + 620)}
      <rect width={S} height={S} filter="url(#fl-noise)" opacity=".16" />
    </svg>
  );
}

const VB = '-600 -600 1200 1200';

/** Three layers that turn at their own pace: the rune band, the great star, the inner seal. */
function Rings({ lit }: { lit?: boolean }) {
  return (
    <div className={`floor-circle${lit ? ' lit' : ' base'}`}>
      <svg className="ring r1" viewBox={VB} aria-hidden="true">
        <circle r="560" strokeWidth="3.2" /><circle r="546" strokeWidth="1.4" /><circle r="470" strokeWidth="2.4" /><circle r="452" strokeWidth="1.2" />
        {Array.from({ length: 40 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 9}) translate(0 -509) scale(.72)`}><path d={GLYPHS[i % GLYPHS.length]} strokeWidth="3.4" /></g>
        ))}
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <circle cy="-470" r="64" strokeWidth="3" className="seal" /><polygon points={star(48, 22, 12).split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return `${x},${y - 470}`; }).join(' ')} strokeWidth="2" />
            <polygon points="-30,-408 30,-408 0,-346" strokeWidth="2.4" />
          </g>
        ))}
      </svg>
      <svg className="ring r2" viewBox={VB} aria-hidden="true">
        <circle r="330" strokeWidth="2.6" /><circle r="316" strokeWidth="1.2" /><circle r="224" strokeWidth="2" />
        <polygon points={star(330, 215, 120)} strokeWidth="2.4" />
        <polygon points={ngon(8, 330, [0, 3, 6, 1, 4, 7, 2, 5])} strokeWidth="1.6" />
        {Array.from({ length: 8 }, (_, i) => <polygon key={i} className="seal" points={`0,-380 11,-366 0,-352 -11,-366`} strokeWidth="2" transform={`rotate(${i * 45 + 22.5})`} />)}
      </svg>
      <svg className="ring r3" viewBox={VB} aria-hidden="true">
        <circle r="150" strokeWidth="2.4" className="jade" /><circle r="132" strokeWidth="1.2" className="jade" />
        <polygon points={ngon(3, 150)} strokeWidth="2" className="jade" /><polygon points={ngon(3, 150, [0, 2, 1]).split(' ').map((p) => { const [x, y] = p.split(',').map(Number); return `${x},${-y}`; }).join(' ')} strokeWidth="2" className="jade" />
        <polygon points={star(112, 44, 18)} strokeWidth="2.6" /><circle r="20" strokeWidth="2.4" />
      </svg>
    </div>
  );
}

export function Floor({ mode }: { mode: FloorMode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0, x = 0.5, y = 0.5;
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty('--mx', `${x}px`); el.style.setProperty('--my', `${y}px`); el.classList.add('touched'); });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className={`floor f-${mode}`} ref={root} aria-hidden="true">
      <StoneFloor />
      <Rings />
      <div className="floor-fog"><i className="g1" /><i className="g2" /><i className="g3" /><i className="g4" /><i className="g5" /><i className="g6" /></div>
      <div className="floor-lit"><Rings lit /></div>
      <div className="floor-vignette" />
    </div>
  );
}
