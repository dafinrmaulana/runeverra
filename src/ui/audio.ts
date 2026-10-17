// Sound effects. The main ones are recorded files (public/assets/audio, see SAMPLES), loaded once on the first
// touch; every sound also has a recipe synthesised with Web Audio, which plays until its file has loaded or
// if it fails to. Steel, wind, thunder and wood are built from filtered noise and the low, uneven overtones of struck metal;
// impacts are saturated and weighted to the bass, and the whole mix is darkened and put in a stone room, so it
// sounds heavy and gritty rather than like bells and synth beeps.
// Every recipe takes a context so it can also be rendered offline (used to check that each one makes sound).
import { pref, setPref } from './data';

export type SfxName =
  | 'move'
  | 'beast'
  | 'capture'
  | 'backstab'
  | 'slash'
  | 'grave'
  | 'root'
  | 'interrupt'
  | 'storm'
  | 'ice'
  | 'shatter'
  | 'shield'
  | 'summon'
  | 'victory'
  | 'defeat'
  | 'error'
  | 'turn'
  | 'select';

type Ctx = BaseAudioContext;
const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

function noiseBuffer(ctx: Ctx) {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1337; // the same hiss every time
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** A tone that slides from f0 to f1 and fades out. */
function tone(
  ctx: Ctx,
  out: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  time: number,
  dur: number,
  peak: number,
  attack = 0.004,
) {
  const o = ctx.createOscillator(),
    g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, time);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), time + dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g);
  g.connect(out);
  o.start(time);
  o.stop(time + dur + 0.02);
}

/** A burst of filtered noise whose filter slides from f0 to f1. */
function hiss(
  ctx: Ctx,
  out: AudioNode,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  time: number,
  dur: number,
  peak: number,
  resonance = 1,
) {
  const s = ctx.createBufferSource(),
    f = ctx.createBiquadFilter(),
    g = ctx.createGain();
  s.buffer = noiseBuffer(ctx);
  f.type = type;
  f.Q.value = resonance;
  f.frequency.setValueAtTime(f0, time);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), time + dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(time, 0.1);
  s.stop(time + dur + 0.02);
}

/** Metal with the uneven overtones of a struck blade, weighted to the low end so it rings dark, not bright. */
const METAL: [number, number, number][] = [
  [1, 1, 1],
  [2.32, 0.5, 0.7],
  [4.25, 0.26, 0.45],
  [6.63, 0.1, 0.3],
];
function ring(ctx: Ctx, out: AudioNode, time: number, freq: number, dur: number, peak: number) {
  METAL.forEach(([ratio, level, decay]) =>
    tone(ctx, out, 'sine', freq * ratio, freq * ratio * 0.997, time, dur * decay, peak * level, 0.002),
  );
}
/** Saturation: pushes a sound into soft clipping so it bites and thickens. */
function grit(ctx: Ctx, out: AudioNode, amount = 4): AudioNode {
  const w = ctx.createWaveShaper(),
    n = 512,
    curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  w.curve = curve;
  w.oversample = '2x';
  w.connect(out);
  return w;
}
/** A heavy low hit: a body that falls in pitch, saturated. */
function thump(ctx: Ctx, out: AudioNode, time: number, f0: number, f1: number, dur: number, peak: number, drive = 3) {
  tone(ctx, grit(ctx, out, drive), 'sine', f0, f1, time, dur, peak, 0.003);
}
/** Wind, breath or rumble: noise that swells and fades while its filter drifts. */
function gust(
  ctx: Ctx,
  out: AudioNode,
  time: number,
  dur: number,
  peak: number,
  f0: number,
  f1: number,
  resonance = 0.8,
  type: BiquadFilterType = 'bandpass',
) {
  const s = ctx.createBufferSource(),
    f = ctx.createBiquadFilter(),
    g = ctx.createGain();
  s.buffer = noiseBuffer(ctx);
  f.type = type;
  f.Q.value = resonance;
  f.frequency.setValueAtTime(f0, time);
  f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), time + dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(time, 0.3);
  s.stop(time + dur + 0.02);
}
/** A war horn: two slightly detuned saws through a filter that opens as it sounds, then closes. */
const horn = (ctx: Ctx, out: AudioNode, time: number, freq: number, dur: number, peak: number, open = 900) => {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(open * 0.3, time);
  lp.frequency.exponentialRampToValueAtTime(open, time + 0.1);
  lp.frequency.exponentialRampToValueAtTime(open * 0.4, time + dur);
  lp.connect(grit(ctx, out, 2));
  tone(ctx, lp, 'sawtooth', freq, freq * 0.996, time, dur, peak, 0.06);
  tone(ctx, lp, 'sawtooth', freq * 1.006, freq, time, dur, peak * 0.7, 0.06);
};

const RECIPES: Record<SfxName, (context: Ctx, output: AudioNode, time: number) => void> = {
  // a heavy boot on flagstone
  move: (context, output, time) => {
    hiss(context, output, 'lowpass', 900, 250, time, 0.1, 0.9, 0.8);
    thump(context, output, time, 90, 45, 0.14, 1.0, 2);
    hiss(context, output, 'bandpass', 1800, 1500, time, 0.03, 0.14, 2);
  },
  // a paw or hoof: lower and softer, still weighty
  beast: (context, output, time) => {
    thump(context, output, time, 70, 38, 0.16, 1.0, 2);
    hiss(context, output, 'lowpass', 500, 180, time, 0.1, 0.8);
  },
  // a takedown: a short rush of air, a heavy crunching blow, and the body hitting the stone
  capture: (context, output, time) => {
    gust(context, output, time, 0.12, 0.45, 300, 1200, 0.9);
    thump(context, output, time + 0.07, 120, 38, 0.3, 1.0, 6);
    hiss(context, output, 'lowpass', 1600, 260, time + 0.07, 0.14, 0.9);
    [0.08, 0.1, 0.13].forEach((delay, index) =>
      hiss(context, output, 'bandpass', 900 - index * 150, 600, time + delay, 0.03, 0.45, 4),
    );
    thump(context, output, time + 0.3, 70, 34, 0.22, 0.7, 3);
    hiss(context, output, 'lowpass', 600, 150, time + 0.3, 0.16, 0.5);
  },
  // Hasim's blade finding its mark after the leap: a blade whipping through the air
  slash: (context, output, time) => {
    gust(context, output, time, 0.22, 0.6, 900, 5500, 1.3);
    hiss(context, output, 'bandpass', 700, 500, time + 0.1, 0.08, 0.6, 1);
    ring(context, output, time + 0.11, 640, 0.8, 0.2);
  },
  // Hasim's leap: a hard wind, a thin blade, a heavy landing
  backstab: (context, output, time) => {
    gust(context, output, time, 0.55, 0.75, 180, 1400, 0.7);
    gust(context, output, time + 0.05, 0.3, 0.22, 1800, 4500, 1.2, 'highpass');
    [0.08, 0.16, 0.24].forEach((delay, index) =>
      hiss(context, output, 'bandpass', 700 + index * 120, 500, time + delay, 0.04, 0.2, 2),
    );
    thump(context, output, time + 0.45, 80, 40, 0.18, 0.9, 3);
    hiss(context, output, 'lowpass', 500, 200, time + 0.45, 0.08, 0.5);
    ring(context, output, time + 0.42, 900, 0.3, 0.13);
  },
  // Magumba's ward: a deep hum swelling under the stone, the air thickening
  grave: (context, output, time) => {
    tone(context, grit(context, output, 2), 'sine', 110, 112, time, 1.1, 0.5, 0.28);
    tone(context, output, 'sine', 165, 165, time, 0.9, 0.18, 0.3);
    gust(context, output, time, 0.9, 0.4, 300, 900, 1.5, 'lowpass');
    ring(context, output, time + 0.1, 330, 1.2, 0.2);
  },
  // Plantae's roots: earth tearing, wood groaning and cracking
  root: (context, output, time) => {
    hiss(context, output, 'lowpass', 180, 70, time, 0.7, 1.0);
    thump(context, output, time + 0.02, 70, 34, 0.45, 0.85, 3);
    gust(context, output, time, 0.5, 0.9, 300, 900, 2);
    hiss(context, output, 'bandpass', 1500, 1500, time, 0.03, 0.9, 1);
    [0.06, 0.2, 0.34].forEach((delay, index) =>
      hiss(context, output, 'bandpass', 480 + index * 160, 800 + index * 120, time + delay, 0.12, 1.0, 12),
    );
  },
  // the interrupt: a heavy parry, steel hard on steel
  interrupt: (context, output, time) => {
    hiss(context, output, 'highpass', 1800, 1800, time, 0.03, 0.8);
    ring(context, output, time, 520, 0.8, 0.36);
    ring(context, output, time + 0.01, 780, 0.45, 0.2);
    thump(context, output, time, 120, 50, 0.2, 1.0, 5);
  },
  // Hexor's hammer: lightning cracks, thunder rolls, the ground gives way
  storm: (context, output, time) => {
    hiss(context, output, 'highpass', 800, 2600, time, 0.12, 0.9);
    hiss(context, output, 'bandpass', 3800, 3800, time, 0.05, 0.5, 0.7);
    [0.04, 0.09, 0.13, 0.2].forEach((delay) =>
      hiss(context, output, 'highpass', 3000, 3000, time + delay, 0.025, 0.35),
    );
    hiss(context, output, 'lowpass', 300, 55, time + 0.08, 1.4, 0.95);
    hiss(context, output, 'lowpass', 240, 50, time + 0.4, 1.0, 0.6);
    hiss(context, output, 'lowpass', 200, 45, time + 0.66, 1.0, 0.4);
    thump(context, output, time + 0.06, 60, 26, 0.9, 1.0, 4);
  },
  // Aqna's ice: a hard crack, brittle shards, a deep freeze underneath
  ice: (context, output, time) => {
    hiss(context, output, 'highpass', 3000, 1500, time, 0.08, 0.85);
    [0.05, 0.1, 0.17, 0.25].forEach((delay) =>
      hiss(context, output, 'bandpass', 2600, 2600, time + delay, 0.035, 0.35, 8),
    );
    ring(context, output, time + 0.02, 1100, 0.5, 0.1);
    hiss(context, output, 'lowpass', 400, 110, time, 0.7, 0.55);
    thump(context, output, time + 0.02, 85, 45, 0.3, 0.7, 3);
  },
  // ice giving way: a sharp crack and shards falling
  shatter: (context, output, time) => {
    hiss(context, output, 'highpass', 4000, 2000, time, 0.1, 0.9);
    [0.03, 0.08, 0.12, 0.19, 0.27, 0.36].forEach((delay, index) =>
      hiss(context, output, 'bandpass', 3200 - index * 250, 3000 - index * 250, time + delay, 0.04, 0.4, 9),
    );
    ring(context, output, time, 1500, 0.4, 0.08);
  },
  // a blow glancing off a warded shield
  shield: (context, output, time) => {
    thump(context, output, time, 140, 70, 0.14, 0.9, 4);
    ring(context, output, time, 420, 0.6, 0.3);
    hiss(context, output, 'bandpass', 2400, 1800, time, 0.06, 0.5, 2);
  },
  // Ge'nga calls the beast: a roar from the chest and war drums
  summon: (context, output, time) => {
    gust(context, output, time, 0.75, 0.8, 120, 300, 6);
    gust(context, output, time, 0.6, 0.3, 500, 800, 6);
    const lp = context.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.connect(grit(context, output, 3));
    tone(context, lp, 'sawtooth', 62, 48, time, 0.65, 0.45, 0.05);
    thump(context, output, time, 60, 35, 0.5, 1.0, 4);
    thump(context, output, time + 0.26, 55, 32, 0.5, 0.9, 4);
  },
  // war horns over drums
  victory: (context, output, time) => {
    [
      [196, 0, 0.3],
      [262, 0.2, 0.3],
      [330, 0.4, 0.3],
      [392, 0.62, 0.95],
    ].forEach(([freq, delay, duration]) => horn(context, output, time + delay, freq, duration, 0.24, 1000));
    [0, 0.2, 0.4, 0.62].forEach((delay) => thump(context, output, time + delay, 70, 38, 0.3, 0.9, 3));
    hiss(context, output, 'highpass', 5000, 5000, time + 0.62, 0.5, 0.12);
  },
  // a horn sinking, a drum tolling, rumble
  defeat: (context, output, time) => {
    [
      [147, 0, 0.6],
      [139, 0.32, 0.6],
      [123, 0.66, 1.1],
    ].forEach(([freq, delay, duration]) => horn(context, output, time + delay, freq, duration, 0.26, 520));
    thump(context, output, time, 55, 30, 0.9, 1.0, 4);
    hiss(context, output, 'lowpass', 300, 80, time, 0.8, 0.55);
  },
  // a dull thud against a shield
  error: (context, output, time) => {
    thump(context, output, time, 110, 60, 0.11, 0.9, 3);
    hiss(context, output, 'lowpass', 500, 220, time, 0.06, 0.55);
  },
  // a single muted drum and a breath of horn
  turn: (context, output, time) => {
    thump(context, output, time, 130, 65, 0.16, 0.7, 3);
    horn(context, output, time + 0.04, 220, 0.3, 0.07, 500);
  },
  // a low tick of stone
  select: (context, output, time) => hiss(context, output, 'bandpass', 1200, 1200, time, 0.035, 1.0, 3),
};

/** The shared output: darkened (more low end, less top), through a small stone room, then a compressor. */
function buildBus(ctx: Ctx, dest: AudioNode): AudioNode {
  const input = ctx.createGain(),
    low = ctx.createBiquadFilter(),
    high = ctx.createBiquadFilter(),
    comp = ctx.createDynamicsCompressor();
  low.type = 'lowshelf';
  low.frequency.value = 140;
  low.gain.value = 4;
  high.type = 'highshelf';
  high.frequency.value = 4500;
  high.gain.value = -7;
  const verb = ctx.createConvolver(),
    send = ctx.createGain(),
    dark = ctx.createBiquadFilter();
  const len = Math.floor(ctx.sampleRate * 1.6),
    ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 99;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3);
    }
  }
  verb.buffer = ir;
  send.gain.value = 0.24;
  dark.type = 'lowpass';
  dark.frequency.value = 2600;
  input.connect(low);
  low.connect(high);
  high.connect(comp);
  high.connect(send);
  send.connect(dark);
  dark.connect(verb);
  verb.connect(comp);
  comp.connect(dest);
  return input;
}

// Recorded sounds, by name, with a level to sit them with the rest. A name without a file plays its recipe.
const SAMPLES: Partial<Record<SfxName, { file: string; level: number }>> = {
  move: { file: 'move', level: 0.9 },
  beast: { file: 'move', level: 0.7 },
  slash: { file: 'slash', level: 0.9 },
  backstab: { file: 'backstab', level: 1 },
  grave: { file: 'grave', level: 0.85 },
  root: { file: 'root', level: 0.9 },
  interrupt: { file: 'root', level: 0.9 }, // Plantae's roots, cast on the enemy's turn
  storm: { file: 'storm', level: 0.9 },
  ice: { file: 'ice', level: 0.85 },
  shatter: { file: 'shatter', level: 0.7 },
  shield: { file: 'shield', level: 1 },
};
const sampleUrl = (file: string) => `assets/audio/${file}.mp3`;
const buffers = new Map<string, AudioBuffer>();
let loading = false;

function loadSamples(context: AudioContext) {
  if (loading || typeof fetch === 'undefined') return;
  loading = true;
  const files = new Set(Object.values(SAMPLES).map((sample) => sample!.file));
  for (const file of files)
    fetch(sampleUrl(file))
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => buffers.set(file, buffer))
      .catch(() => {}); // the recipe keeps playing instead
}

/** Play a recorded sound, if it is loaded. False when the recipe should play instead. */
function playSample(context: AudioContext, output: AudioNode, name: SfxName) {
  const sample = SAMPLES[name];
  const buffer = sample && buffers.get(sample.file);
  if (!sample || !buffer) return false;
  const source = context.createBufferSource(),
    gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = sample.level;
  source.connect(gain);
  gain.connect(output);
  source.start(context.currentTime + 0.002);
  return true;
}

// ---------- the live player ----------
let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let master: GainNode | null = null;
let volume: number = pref('sfxVol', 0.55);
const lastPlayed = new Map<string, number>();

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : null;
  if (!AC) return null;
  try {
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    bus = buildBus(ctx, master);
    loadSamples(ctx);
  } catch {
    ctx = null;
  }
  return ctx;
}

// Browsers keep audio silent until the player has touched the page once.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  ['pointerdown', 'keydown', 'touchend'].forEach((eventName) =>
    window.addEventListener(eventName, unlock, { passive: true }),
  );
}

/** The shared audio context (made on first use; null without Web Audio), for the menu music. */
export const audioContext = () => ensure();

export function sfx(name: SfxName | null) {
  if (!name || volume <= 0 || (typeof document !== 'undefined' && document.hidden)) return;
  const c = ensure();
  if (!c || !bus) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const now = performance.now();
  if (now - (lastPlayed.get(name) || 0) < 45) return; // never stack the same sound on itself
  lastPlayed.set(name, now);
  try {
    if (!playSample(c, master!, name)) RECIPES[name](c, bus, c.currentTime + 0.002);
  } catch {
    /* a sound must never break the game */
  }
}

export const sfxVolume = () => volume;
export function setSfxVolume(level: number) {
  volume = Math.min(1, Math.max(0, level));
  setPref('sfxVol', volume);
  if (master) master.gain.value = volume;
}

/** Render one effect offline and report how loud it is (used to check every recipe really makes sound). */
export async function measureSfx(name: SfxName) {
  const off = new OfflineAudioContext(1, 44100 * 2, 44100);
  const bus = buildBus(off, off.destination);
  RECIPES[name](off, bus, 0.01);
  const data = (await off.startRendering()).getChannelData(0);
  let peak = 0,
    sum = 0,
    last = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    sum += data[i] * data[i];
    if (a > 0.001) last = i;
  }
  return {
    name,
    peak: +peak.toFixed(3),
    rms: +Math.sqrt(sum / data.length).toFixed(4),
    seconds: +(last / 44100).toFixed(2),
  };
}
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];
