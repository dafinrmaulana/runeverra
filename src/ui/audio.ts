// Sound effects, synthesised with Web Audio: no audio files, nothing to license, nothing to download.
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

const RECIPES: Record<SfxName, (c: Ctx, o: AudioNode, t: number) => void> = {
  // stone underfoot
  move: (c, o, t) => { hiss(c, o, 'bandpass', 900, 500, t, 0.09, 0.75, 1.2); tone(c, o, 'sine', 140, 70, t, 0.1, 0.8); },
  beast: (c, o, t) => { hiss(c, o, 'bandpass', 520, 300, t, 0.08, 0.6, 1); tone(c, o, 'sine', 100, 55, t, 0.1, 0.85); },
  // a takedown: a bright strike, a ring of metal, a thud
  capture: (c, o, t) => {
    hiss(c, o, 'highpass', 1600, 800, t, 0.12, 0.7);
    tone(c, o, 'triangle', 520, 480, t, 0.3, 0.32); tone(c, o, 'triangle', 780, 740, t, 0.24, 0.22);
    tone(c, o, 'sine', 110, 48, t, 0.2, 0.75);
  },
  // Hasim's jump: a whoosh and a slice
  backstab: (c, o, t) => {
    hiss(c, o, 'bandpass', 400, 3200, t, 0.2, 0.5, 2);
    tone(c, o, 'sawtooth', 2000, 700, t + 0.14, 0.12, 0.3); hiss(c, o, 'highpass', 3000, 3000, t + 0.15, 0.06, 0.5);
  },
  // Magumba's shield: a rising shimmer
  grave: (c, o, t) => {
    [392, 523, 659, 784].forEach((f, i) => { tone(c, o, 'sine', f, f, t + i * 0.07, 0.9, 0.2); tone(c, o, 'triangle', f * 2, f * 2, t + i * 0.07, 0.5, 0.07); });
    hiss(c, o, 'bandpass', 3200, 3200, t, 0.45, 0.1, 3); tone(c, o, 'sine', 196, 220, t, 0.7, 0.18);
  },
  // Plantae's roots: a creaking growth and snapping wood
  root: (c, o, t) => {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.connect(o);
    tone(c, lp, 'sawtooth', 70, 135, t, 0.5, 0.5, 0.05);
    [0.05, 0.14, 0.22, 0.33].forEach((d, i) => hiss(c, o, 'bandpass', 1100 + i * 260, 700, t + d, 0.04, 0.35, 4));
  },
  // the interrupt: a rising snap, then a hard dissonant stop
  interrupt: (c, o, t) => {
    hiss(c, o, 'bandpass', 300, 4000, t, 0.16, 0.5, 2);
    tone(c, o, 'square', 220, 160, t + 0.16, 0.2, 0.28); tone(c, o, 'square', 233, 170, t + 0.16, 0.2, 0.22);
    hiss(c, o, 'lowpass', 800, 200, t + 0.16, 0.16, 0.6);
  },
  // Hexor's hammer: a deep boom with a crack
  storm: (c, o, t) => {
    tone(c, o, 'sine', 90, 32, t, 0.7, 0.95); hiss(c, o, 'lowpass', 240, 80, t, 0.8, 0.8);
    hiss(c, o, 'highpass', 1800, 600, t, 0.18, 0.5);
  },
  // Aqna's ice: glass bells
  ice: (c, o, t) => {
    [1568, 2093, 2637, 3136].forEach((f, i) => tone(c, o, 'sine', f, f, t + i * 0.05, 0.55, 0.17));
    hiss(c, o, 'highpass', 6000, 6000, t, 0.28, 0.22);
  },
  // Ge'nga calls the beast: a growl and a drum
  summon: (c, o, t) => {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(700, t + 0.5); bp.connect(o);
    tone(c, bp, 'sawtooth', 95, 70, t, 0.55, 0.5, 0.03); tone(c, o, 'sine', 60, 45, t, 0.42, 0.9);
    hiss(c, o, 'bandpass', 500, 200, t, 0.4, 0.28);
  },
  victory: (c, o, t) => [523, 659, 784, 1047].forEach((f, i) => { tone(c, o, 'triangle', f, f, t + i * 0.11, 0.7, 0.3); tone(c, o, 'sine', f * 2, f * 2, t + i * 0.11, 0.5, 0.1); }),
  defeat: (c, o, t) => {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(o);
    [392, 349, 294, 196].forEach((f, i) => tone(c, lp, 'sawtooth', f, f * 0.98, t + i * 0.16, 0.6, 0.25));
  },
  error: (c, o, t) => tone(c, o, 'square', 130, 100, t, 0.14, 0.45),
  turn: (c, o, t) => { tone(c, o, 'sine', 880, 880, t, 0.22, 0.16); tone(c, o, 'sine', 1320, 1320, t + 0.08, 0.26, 0.12); },
  select: (c, o, t) => hiss(c, o, 'bandpass', 2000, 2000, t, 0.035, 0.5, 3),
};

// ---------- the live player ----------
let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let master: GainNode | null = null;
let enabled: boolean = pref('sfx', true);
let volume: number = pref('sfxVol', 0.7);
const lastPlayed = new Map<string, number>();

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
  if (!AC) return null;
  try {
    ctx = new AC() as AudioContext;
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain(); master.gain.value = volume;
    comp.connect(master); master.connect(ctx.destination);
    bus = comp;
  } catch { ctx = null; }
  return ctx;
}

// Browsers keep audio silent until the player has touched the page once.
if (typeof window !== 'undefined') {
  const unlock = () => { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); };
  ['pointerdown', 'keydown', 'touchend'].forEach((e) => window.addEventListener(e, unlock, { passive: true }));
}

export function sfx(name: SfxName | null) {
  if (!name || !enabled || (typeof document !== 'undefined' && document.hidden)) return;
  const c = ensure();
  if (!c || !bus) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const now = performance.now();
  if (now - (lastPlayed.get(name) || 0) < 45) return; // never stack the same sound on itself
  lastPlayed.set(name, now);
  try { RECIPES[name](c, bus, c.currentTime + 0.002); } catch { /* a sound must never break the game */ }
}

export const sfxEnabled = () => enabled;
export const sfxVolume = () => volume;
export function setSfxEnabled(on: boolean) { enabled = on; setPref('sfx', on); if (on) sfx('select'); }
export function setSfxVolume(v: number) {
  volume = Math.min(1, Math.max(0, v)); setPref('sfxVol', volume);
  if (master) master.gain.value = volume;
}

/** Render one effect offline and report how loud it is (used to check every recipe really makes sound). */
export async function measureSfx(name: SfxName) {
  const off = new OfflineAudioContext(1, 44100 * 2, 44100);
  const comp = off.createDynamicsCompressor(); comp.connect(off.destination);
  RECIPES[name](off, comp, 0.01);
  const data = (await off.startRendering()).getChannelData(0);
  let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; sum += data[i] * data[i]; if (a > 0.001) last = i; }
  return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / data.length).toFixed(4), seconds: +(last / 44100).toFixed(2) };
}
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];
