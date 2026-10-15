// Sound effects, synthesised with Web Audio: no audio files, nothing to license, nothing to download.
// Steel, wind, thunder and wood are built from filtered noise and the low, uneven overtones of struck metal;
// impacts are saturated and weighted to the bass, and the whole mix is darkened and put in a stone room, so it
// sounds heavy and gritty rather than like bells and synth beeps.
// Every recipe takes a context so it can also be rendered offline (used to check that each one makes sound).
import { pref, setPref } from './data';

export type SfxName = 'move' | 'beast' | 'capture' | 'backstab' | 'grave' | 'root' | 'interrupt' | 'storm' | 'ice' | 'summon'
  | 'victory' | 'defeat' | 'error' | 'turn' | 'select';

type Ctx = BaseAudioContext;
const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

function noiseBuffer(ctx: Ctx) {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1337; // the same hiss every time
    for (let i = 0; i < d.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** A tone that slides from f0 to f1 and fades out. */
function tone(ctx: Ctx, out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.004) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

/** A burst of filtered noise whose filter slides from f0 to f1. */
function hiss(ctx: Ctx, out: AudioNode, type: BiquadFilterType, f0: number, f1: number, t: number, dur: number, peak: number, q = 1) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuffer(ctx);
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, 0.1); s.stop(t + dur + 0.02);
}

/** Metal with the uneven overtones of a struck blade, weighted to the low end so it rings dark, not bright. */
const METAL: [number, number, number][] = [[1, 1, 1], [2.32, 0.5, 0.7], [4.25, 0.26, 0.45], [6.63, 0.1, 0.3]];
function ring(ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, peak: number) {
  METAL.forEach(([r, a, d]) => tone(ctx, out, 'sine', f * r, f * r * 0.997, t, dur * d, peak * a, 0.002));
}
/** Saturation: pushes a sound into soft clipping so it bites and thickens. */
function grit(ctx: Ctx, out: AudioNode, amount = 4): AudioNode {
  const w = ctx.createWaveShaper(), n = 512, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  w.curve = curve; w.oversample = '2x'; w.connect(out);
  return w;
}
/** A heavy low hit: a body that falls in pitch, saturated. */
function thump(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number, drive = 3) {
  tone(ctx, grit(ctx, out, drive), 'sine', f0, f1, t, dur, peak, 0.003);
}
/** Wind, breath or rumble: noise that swells and fades while its filter drifts. */
function gust(ctx: Ctx, out: AudioNode, t: number, dur: number, peak: number, f0: number, f1: number, q = 0.8, type: BiquadFilterType = 'bandpass') {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuffer(ctx);
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, 0.3); s.stop(t + dur + 0.02);
}
/** A war horn: two slightly detuned saws through a filter that opens as it sounds, then closes. */
const horn = (ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, peak: number, open = 900) => {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(open * 0.3, t); lp.frequency.exponentialRampToValueAtTime(open, t + 0.1); lp.frequency.exponentialRampToValueAtTime(open * 0.4, t + dur);
  lp.connect(grit(ctx, out, 2));
  tone(ctx, lp, 'sawtooth', f, f * 0.996, t, dur, peak, 0.06); tone(ctx, lp, 'sawtooth', f * 1.006, f, t, dur, peak * 0.7, 0.06);
};

const RECIPES: Record<SfxName, (c: Ctx, o: AudioNode, t: number) => void> = {
  // a heavy boot on flagstone
  move: (c, o, t) => { hiss(c, o, 'lowpass', 900, 250, t, 0.1, 0.9, 0.8); thump(c, o, t, 90, 45, 0.14, 1.0, 2); hiss(c, o, 'bandpass', 1800, 1500, t, 0.03, 0.14, 2); },
  // a paw or hoof: lower and softer, still weighty
  beast: (c, o, t) => { thump(c, o, t, 70, 38, 0.16, 1.0, 2); hiss(c, o, 'lowpass', 500, 180, t, 0.1, 0.8); },
  // a kill: steel dragged across steel, a crunching blow, then the blade ringing low
  capture: (c, o, t) => {
    gust(c, o, t, 0.22, 0.6, 900, 5500, 1.3);
    thump(c, o, t + 0.1, 100, 40, 0.24, 1.0, 5); hiss(c, o, 'lowpass', 1200, 300, t + 0.1, 0.12, 0.85); hiss(c, o, 'bandpass', 700, 500, t + 0.1, 0.08, 0.6, 1);
    ring(c, o, t + 0.11, 640, 1.0, 0.24); ring(c, o, t + 0.12, 960, 0.6, 0.11);
  },
  // Hasim's leap: a hard wind, a thin blade, a heavy landing
  backstab: (c, o, t) => {
    gust(c, o, t, 0.55, 0.75, 180, 1400, 0.7); gust(c, o, t + 0.05, 0.3, 0.22, 1800, 4500, 1.2, 'highpass');
    [0.08, 0.16, 0.24].forEach((d, i) => hiss(c, o, 'bandpass', 700 + i * 120, 500, t + d, 0.04, 0.2, 2));
    thump(c, o, t + 0.45, 80, 40, 0.18, 0.9, 3); hiss(c, o, 'lowpass', 500, 200, t + 0.45, 0.08, 0.5);
    ring(c, o, t + 0.42, 900, 0.3, 0.13);
  },
  // Magumba's ward: a deep hum swelling under the stone, the air thickening
  grave: (c, o, t) => {
    tone(c, grit(c, o, 2), 'sine', 110, 112, t, 1.1, 0.5, 0.28); tone(c, o, 'sine', 165, 165, t, 0.9, 0.18, 0.3);
    gust(c, o, t, 0.9, 0.4, 300, 900, 1.5, 'lowpass'); ring(c, o, t + 0.1, 330, 1.2, 0.2);
  },
  // Plantae's roots: earth tearing, wood groaning and cracking
  root: (c, o, t) => {
    hiss(c, o, 'lowpass', 180, 70, t, 0.7, 1.0); thump(c, o, t + 0.02, 70, 34, 0.45, 0.85, 3); gust(c, o, t, 0.5, 0.9, 300, 900, 2);
    hiss(c, o, 'bandpass', 1500, 1500, t, 0.03, 0.9, 1);
    [0.06, 0.2, 0.34].forEach((d, i) => hiss(c, o, 'bandpass', 480 + i * 160, 800 + i * 120, t + d, 0.12, 1.0, 12));
  },
  // the interrupt: a heavy parry, steel hard on steel
  interrupt: (c, o, t) => {
    hiss(c, o, 'highpass', 1800, 1800, t, 0.03, 0.8);
    ring(c, o, t, 520, 0.8, 0.36); ring(c, o, t + 0.01, 780, 0.45, 0.2);
    thump(c, o, t, 120, 50, 0.2, 1.0, 5);
  },
  // Hexor's hammer: lightning cracks, thunder rolls, the ground gives way
  storm: (c, o, t) => {
    hiss(c, o, 'highpass', 800, 2600, t, 0.12, 0.9); hiss(c, o, 'bandpass', 3800, 3800, t, 0.05, 0.5, 0.7);
    [0.04, 0.09, 0.13, 0.2].forEach((d) => hiss(c, o, 'highpass', 3000, 3000, t + d, 0.025, 0.35));
    hiss(c, o, 'lowpass', 300, 55, t + 0.08, 1.4, 0.95); hiss(c, o, 'lowpass', 240, 50, t + 0.4, 1.0, 0.6); hiss(c, o, 'lowpass', 200, 45, t + 0.66, 1.0, 0.4);
    thump(c, o, t + 0.06, 60, 26, 0.9, 1.0, 4);
  },
  // Aqna's ice: a hard crack, brittle shards, a deep freeze underneath
  ice: (c, o, t) => {
    hiss(c, o, 'highpass', 3000, 1500, t, 0.08, 0.85);
    [0.05, 0.1, 0.17, 0.25].forEach((d) => hiss(c, o, 'bandpass', 2600, 2600, t + d, 0.035, 0.35, 8));
    ring(c, o, t + 0.02, 1100, 0.5, 0.1); hiss(c, o, 'lowpass', 400, 110, t, 0.7, 0.55);
    thump(c, o, t + 0.02, 85, 45, 0.3, 0.7, 3);
  },
  // Ge'nga calls the beast: a roar from the chest and war drums
  summon: (c, o, t) => {
    gust(c, o, t, 0.75, 0.8, 120, 300, 6); gust(c, o, t, 0.6, 0.3, 500, 800, 6);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.connect(grit(c, o, 3));
    tone(c, lp, 'sawtooth', 62, 48, t, 0.65, 0.45, 0.05);
    thump(c, o, t, 60, 35, 0.5, 1.0, 4); thump(c, o, t + 0.26, 55, 32, 0.5, 0.9, 4);
  },
  // war horns over drums
  victory: (c, o, t) => {
    [[196, 0, 0.3], [262, 0.2, 0.3], [330, 0.4, 0.3], [392, 0.62, 0.95]].forEach(([f, d, l]) => horn(c, o, t + d, f, l, 0.24, 1000));
    [0, 0.2, 0.4, 0.62].forEach((d) => thump(c, o, t + d, 70, 38, 0.3, 0.9, 3)); hiss(c, o, 'highpass', 5000, 5000, t + 0.62, 0.5, 0.12);
  },
  // a horn sinking, a drum tolling, rumble
  defeat: (c, o, t) => {
    [[147, 0, 0.6], [139, 0.32, 0.6], [123, 0.66, 1.1]].forEach(([f, d, l]) => horn(c, o, t + d, f, l, 0.26, 520));
    thump(c, o, t, 55, 30, 0.9, 1.0, 4); hiss(c, o, 'lowpass', 300, 80, t, 0.8, 0.55);
  },
  // a dull thud against a shield
  error: (c, o, t) => { thump(c, o, t, 110, 60, 0.11, 0.9, 3); hiss(c, o, 'lowpass', 500, 220, t, 0.06, 0.55); },
  // a single muted drum and a breath of horn
  turn: (c, o, t) => { thump(c, o, t, 130, 65, 0.16, 0.7, 3); horn(c, o, t + 0.04, 220, 0.3, 0.07, 500); },
  // a low tick of stone
  select: (c, o, t) => hiss(c, o, 'bandpass', 1200, 1200, t, 0.035, 1.0, 3),
};

/** The shared output: darkened (more low end, less top), through a small stone room, then a compressor. */
function buildBus(ctx: Ctx, dest: AudioNode): AudioNode {
  const input = ctx.createGain(), low = ctx.createBiquadFilter(), high = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor();
  low.type = 'lowshelf'; low.frequency.value = 140; low.gain.value = 4;
  high.type = 'highshelf'; high.frequency.value = 4500; high.gain.value = -7;
  const verb = ctx.createConvolver(), send = ctx.createGain(), dark = ctx.createBiquadFilter();
  const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 99;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3); }
  }
  verb.buffer = ir; send.gain.value = 0.24; dark.type = 'lowpass'; dark.frequency.value = 2600;
  input.connect(low); low.connect(high); high.connect(comp); high.connect(send); send.connect(dark); dark.connect(verb); verb.connect(comp); comp.connect(dest);
  return input;
}

// ---------- the live player ----------
let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let master: GainNode | null = null;
let volume: number = pref('sfxVol', 0.55);
const lastPlayed = new Map<string, number>();

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
  if (!AC) return null;
  try {
    ctx = new AC() as AudioContext;
    master = ctx.createGain(); master.gain.value = volume;
    master.connect(ctx.destination);
    bus = buildBus(ctx, master);
  } catch { ctx = null; }
  return ctx;
}

// Browsers keep audio silent until the player has touched the page once.
if (typeof window !== 'undefined') {
  const unlock = () => { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); };
  ['pointerdown', 'keydown', 'touchend'].forEach((e) => window.addEventListener(e, unlock, { passive: true }));
}

export function sfx(name: SfxName | null) {
  if (!name || volume <= 0 || (typeof document !== 'undefined' && document.hidden)) return;
  const c = ensure();
  if (!c || !bus) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const now = performance.now();
  if (now - (lastPlayed.get(name) || 0) < 45) return; // never stack the same sound on itself
  lastPlayed.set(name, now);
  try { RECIPES[name](c, bus, c.currentTime + 0.002); } catch { /* a sound must never break the game */ }
}

export const sfxVolume = () => volume;
export function setSfxVolume(v: number) {
  volume = Math.min(1, Math.max(0, v)); setPref('sfxVol', volume);
  if (master) master.gain.value = volume;
}

/** Render one effect offline and report how loud it is (used to check every recipe really makes sound). */
export async function measureSfx(name: SfxName) {
  const off = new OfflineAudioContext(1, 44100 * 2, 44100);
  const bus = buildBus(off, off.destination);
  RECIPES[name](off, bus, 0.01);
  const data = (await off.startRendering()).getChannelData(0);
  let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; sum += data[i] * data[i]; if (a > 0.001) last = i; }
  return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / data.length).toFixed(4), seconds: +(last / 44100).toFixed(2) };
}
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];
