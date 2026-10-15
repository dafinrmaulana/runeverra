// The home backdrop: an ancient ritual ground at night, drawn as SVG (no image files). A great rune circle
// turns on a stone altar, a beam of light climbs from it into an aurora sky, standing stones glow with runes
// and shards of rune-stone hang in the air. Layers from far to near; everything moves slowly and stops
// under reduced motion.
import { useEffect, useMemo, useState } from 'react';

const W = 1600, H = 900;
const CX = 1100, CY = 690; // the circle's centre on the ground
const R = 330, TILT = 0.27; // circle radius and how far it is laid down

function rng(seed: number) { // mulberry32: the same scene every time
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function ridge(seed: number, base: number, amp: number, fill: string, opacity = 1) {
  const r = rng(seed), p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 20) {
    const y = base - amp * (0.55 * Math.sin(x / 230 + p1) + 0.3 * Math.sin(x / 95 + p2) + 0.15 * Math.sin(x / 43 + p3)) - r() * 4;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return <path d={`M0,${H} L${pts.join(' L')} L${W},${H} Z`} fill={fill} opacity={opacity} />;
}

const GLYPHS = [
  'M0,-22 V22 M0,-6 L12,-18 M0,8 L12,-4',
  'M0,-22 V22 M-12,-12 L0,-22 L12,-12 M-10,10 H10',
  'M-10,-20 L10,0 L-10,20 M10,-20 V20',
  'M0,-22 V22 M-12,-6 H12 M-8,14 L0,5 L8,14',
  'M-11,-22 V22 M-11,-4 L11,-22 M-11,-4 L11,18',
  'M0,-22 L12,0 L0,22 L-12,0 Z M0,-10 V10',
];

/** The circle itself, drawn flat around the origin; the caller lays it down and turns it. */
function Circle() {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i * 5 * Math.PI) / 180, r1 = R - 14, r2 = i % 6 === 0 ? R + 2 : R - 4;
    return <line key={i} x1={r1 * Math.sin(a)} y1={-r1 * Math.cos(a)} x2={r2 * Math.sin(a)} y2={-r2 * Math.cos(a)} />;
  });
  const star = Array.from({ length: 6 }, (_, i) => `${(190 * Math.sin((i * Math.PI) / 3)).toFixed(1)},${(-190 * Math.cos((i * Math.PI) / 3)).toFixed(1)}`);
  return (
    <g>
      <circle r={R} /><circle r={R - 20} /><circle r={R - 66} /><circle r={R - 140} />
      {ticks}
      <polygon points={`${star[0]} ${star[2]} ${star[4]}`} /><polygon points={`${star[1]} ${star[3]} ${star[5]}`} />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i} className="glyph" transform={`rotate(${i * 30}) translate(0 ${-(R - 43)}) scale(.9)`} style={{ animationDelay: `${i * 0.35}s` }}><path d={GLYPHS[i % GLYPHS.length]} /></g>
      ))}
    </g>
  );
}

function Stone({ t, scale, id }: { t: number; scale: number; id: number }) {
  const x = CX + (R + 55) * Math.sin(t), y = CY + (R + 55) * TILT * Math.cos(t) + 6;
  const h = (210 + id * 9) * scale, w = (58 + (id % 3) * 10) * scale;
  const glyph = GLYPHS[id % GLYPHS.length];
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <ellipse cx="0" cy="2" rx={w * 0.8} ry={w * 0.16} fill="#05040c" opacity=".55" />
      <path className="stone" d={`M${-w / 2},0 L${-w * 0.42},${-h * 0.8} L${-w * 0.2},${-h} L${w * 0.18},${-h * 0.96} L${w * 0.46},${-h * 0.78} L${w / 2},0 Z`} />
      <path className="stone-rim" d={`M${w * 0.18},${-h * 0.96} L${w * 0.46},${-h * 0.78} L${w / 2},0`} />
      <g className="glyph rune-on-stone" transform={`translate(${(w * 0.02).toFixed(1)} ${(-h * 0.52).toFixed(1)}) scale(${(scale * 1.15).toFixed(2)})`} style={{ animationDelay: `${id * 0.6}s` }}><path d={glyph} /></g>
    </g>
  );
}

export function RitualScene() {
  // On a tall phone screen, centre the view on the circle instead of the middle of the picture.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth / window.innerHeight < 0.9);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth / window.innerHeight < 0.9);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const stars = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 150 }, (_, i) => ({ x: r() * W, y: r() * 380, r: 0.5 + r() * 1.4, d: (r() * 6).toFixed(1), tw: i % 3 === 0 }));
  }, []);
  const sparks = useMemo(() => {
    const r = rng(33);
    return Array.from({ length: 34 }, () => ({ x: CX - 150 + r() * 300, d: (r() * 9).toFixed(1), s: 5 + r() * 6, size: 1.4 + r() * 2.4 }));
  }, []);
  const stones = useMemo(() => {
    const ts = [0.35, 1.1, 1.85, 2.6, 3.6, 4.4, 5.3];
    return ts.map((t, id) => ({ t, id, scale: 0.78 + 0.28 * Math.cos(t) * 0.5 + 0.22 }));
  }, []);
  const back = stones.filter((s) => Math.cos(s.t) < 0), front = stones.filter((s) => Math.cos(s.t) >= 0);

  return (
    <svg className="ritual" viewBox={narrow ? '840 0 520 900' : `0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="rs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070817" /><stop offset=".36" stopColor="#12123a" /><stop offset=".62" stopColor="#262058" />
          <stop offset=".8" stopColor="#3a3a78" /><stop offset=".9" stopColor="#4d7f8c" />
        </linearGradient>
        <radialGradient id="rs-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#eaf6ff" stopOpacity=".9" /><stop offset=".3" stopColor="#bcd8f2" stopOpacity=".35" /><stop offset="1" stopColor="#bcd8f2" stopOpacity="0" /></radialGradient>
        <radialGradient id="rs-aura" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#9ff5df" stopOpacity=".8" /><stop offset=".35" stopColor="#5ad1b0" stopOpacity=".35" /><stop offset="1" stopColor="#5ad1b0" stopOpacity="0" /></radialGradient>
        <linearGradient id="rs-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#c8fff0" stopOpacity=".85" /><stop offset=".35" stopColor="#7fe8cf" stopOpacity=".42" /><stop offset="1" stopColor="#7fe8cf" stopOpacity="0" /></linearGradient>
        <linearGradient id="rs-aurora" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5ad1b0" stopOpacity="0" /><stop offset=".3" stopColor="#5ad1b0" stopOpacity=".7" /><stop offset=".65" stopColor="#8f7bff" stopOpacity=".6" /><stop offset="1" stopColor="#8f7bff" stopOpacity="0" /></linearGradient>
        <linearGradient id="rs-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0d0b1c" /><stop offset=".6" stopColor="#1a1832" /><stop offset="1" stopColor="#262248" /></linearGradient>
        <linearGradient id="rs-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fe3d0" stopOpacity="0" /><stop offset="1" stopColor="#8fe3d0" stopOpacity=".30" /></linearGradient>
        <linearGradient id="rs-fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stopColor="#06050d" stopOpacity="0" /><stop offset="1" stopColor="#06050d" stopOpacity=".92" /></linearGradient>
        <filter id="rs-blur" filterUnits="userSpaceOnUse" x="-300" y="-200" width="2200" height="1000"><feGaussianBlur stdDeviation="22" /></filter>
        <filter id="rs-soft"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>

      <rect width={W} height={H} fill="url(#rs-sky)" />
      {stars.map((s, i) => <circle key={i} className={s.tw ? 'star tw' : 'star'} cx={s.x} cy={s.y} r={s.r} fill="#f2f6ff" style={{ animationDelay: `${s.d}s` }} />)}
      <circle cx="250" cy="175" r="190" fill="url(#rs-moon)" /><circle cx="250" cy="175" r="52" fill="#eaf4ff" /><circle cx="236" cy="162" r="9" fill="#c4d6ea" opacity=".6" /><circle cx="264" cy="190" r="6" fill="#c4d6ea" opacity=".5" />

      <g className="aurora a1" filter="url(#rs-blur)"><path d="M-100,230 C250,130 520,300 820,200 S1300,90 1700,210" fill="none" stroke="url(#rs-aurora)" strokeWidth="64" /></g>
      <g className="aurora a2" filter="url(#rs-blur)"><path d="M-100,330 C300,270 560,380 900,300 S1380,230 1700,320" fill="none" stroke="url(#rs-aurora)" strokeWidth="44" /></g>

      {ridge(3, 560, 90, '#2a2352', 0.95)}
      {ridge(11, 615, 78, '#1d1840')}
      {ridge(19, 670, 62, '#141030')}

      {/* the beam and the glow under it sit behind the circle's front half */}
      <circle cx={CX} cy={CY - 20} r="360" fill="url(#rs-aura)" className="aura" />
      <g className="beam"><path d={`M${CX - 190},${CY} L${CX - 70},-40 L${CX + 70},-40 L${CX + 190},${CY} Z`} fill="url(#rs-beam)" opacity=".5" /><path d={`M${CX - 55},${CY} L${CX - 22},-40 L${CX + 22},-40 L${CX + 55},${CY} Z`} fill="url(#rs-beam)" /></g>

      {back.map((s) => <Stone key={s.id} {...s} />)}

      {/* altar: two stone steps, then the circle laid down and turning */}
      <ellipse cx={CX} cy={CY + 24} rx={R + 70} ry={(R + 70) * TILT} fill="#0c0a1a" />
      <ellipse cx={CX} cy={CY + 12} rx={R + 40} ry={(R + 40) * TILT} fill="#1a1736" />
      <ellipse cx={CX} cy={CY + 6} rx={R + 24} ry={(R + 24) * TILT} fill="#241f48" />
      <ellipse cx={CX} cy={CY} rx={R} ry={R * TILT} fill="#0f0d24" />
      <g transform={`translate(${CX} ${CY}) scale(1 ${TILT})`}>
        <g className="circle glow" filter="url(#rs-soft)"><g className="spin"><Circle /></g></g>
        <g className="circle"><g className="spin"><Circle /></g></g>
        <g className="circle inner"><g className="spin2"><circle r="96" /><polygon points="0,-96 83,48 -83,48" /><polygon points="0,96 83,-48 -83,-48" /></g></g>
      </g>

      {/* shards of rune-stone hanging around the beam */}
      {[[-150, 360, 1], [160, 300, 1.2], [-90, 190, 0.8], [110, 120, 0.9], [-200, 150, 0.7]].map(([dx, y, k], i) => (
        <g key={i} className="shard" transform={`translate(${CX + dx} ${y})`} style={{ animationDelay: `${i * 0.9}s` }}>
          <path d={`M0,${-26 * k} L${13 * k},0 L0,${26 * k} L${-13 * k},0 Z`} /><path className="glyph" d={`M0,${-12 * k} V${12 * k}`} />
        </g>
      ))}
      {sparks.map((s, i) => <circle key={i} className="spark" cx={s.x} cy={CY - 10} r={s.size} style={{ animationDelay: `${s.d}s`, animationDuration: `${s.s}s` }} />)}

      {front.map((s) => <Stone key={s.id} {...s} />)}

      <rect y="600" width={W} height="300" fill="url(#rs-mist)" />
      <g className="mist m1"><ellipse cx="320" cy="790" rx="360" ry="34" fill="#9fe8d6" opacity=".10" /></g>
      <g className="mist m2"><ellipse cx="1280" cy="800" rx="420" ry="30" fill="#9fe8d6" opacity=".09" /></g>
      {ridge(31, 835, 40, '#08060f')}
      <path d="M0,900 L0,800 L40,760 L70,812 L120,740 L170,820 L210,790 L260,860 L300,900 Z" fill="#05040b" />
      <path d={`M${W},900 L${W},790 L${W - 50},740 L${W - 90},800 L${W - 150},730 L${W - 210},820 L${W - 260},780 L${W - 330},890 L${W - 360},900 Z`} fill="#05040b" />
      <rect width={W} height={H} fill="url(#rs-fade)" />
    </svg>
  );
}
