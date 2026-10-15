// Sound effects, synthesised with Web Audio: no audio files, nothing to license, nothing to download.
// Steel, wind, thunder and wood are built from filtered noise and the uneven overtones of struck metal, then
// placed in a small stone room, so they sound physical rather than like synth beeps.
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

/** Metal rings with the uneven overtones of a struck blade (not a musical chord): ratio, loudness, decay factor. */
const METAL: [number, number, number][] = [[1, 1, 1], [2.32, 0.55, 0.7], [4.25, 0.36, 0.5], [6.63, 0.22, 0.34], [9.38, 0.12, 0.22]];
const GLASS: [number, number, number][] = [[1, 1, 1], [2.76, 0.6, 0.6], [5.4, 0.4, 0.4], [8.93, 0.2, 0.25]];
function ring(ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, peak: number, partials = METAL) {
  partials.forEach(([r, a, d]) => tone(ctx, out, 'sine', f * r, f * r * 0.998, t, dur * d, peak * a, 0.002));
}
/** Wind or breath: noise that swells and fades while its filter drifts. */
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
const horn = (ctx: Ctx, out: AudioNode, t: number, f: number, dur: number, peak: number, open = 1400) => {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(open * 0.35, t); lp.frequency.exponentialRampToValueAtTime(open, t + 0.07); lp.frequency.exponentialRampToValueAtTime(open * 0.5, t + dur);
  lp.connect(out);
  tone(ctx, lp, 'sawtooth', f, f * 0.995, t, dur, peak, 0.05); tone(ctx, lp, 'sawtooth', f * 1.004, f, t, dur, peak * 0.6, 0.05);
};

const RECIPES: Record<SfxName, (c: Ctx, o: AudioNode, t: number) => void> = {
  // a boot on flagstone
  move: (c, o, t) => { hiss(c, o, 'lowpass', 1300, 420, t, 0.07, 0.9, 0.8); tone(c, o, 'sine', 110, 60, t, 0.09, 0.8); hiss(c, o, 'highpass', 3200, 3200, t, 0.015, 0.16); },
  // a paw or hoof, softer and lower
  beast: (c, o, t) => { hiss(c, o, 'lowpass', 700, 250, t, 0.08, 0.8); tone(c, o, 'sine', 85, 50, t, 0.1, 0.95); },
  // a kill: steel drawn across steel ("sshring"), the blow, then the blade ringing
  capture: (c, o, t) => {
    gust(c, o, t, 0.2, 0.5, 1800, 8000, 1.4);
    tone(c, o, 'sine', 120, 50, t + 0.1, 0.2, 0.6); hiss(c, o, 'lowpass', 900, 300, t + 0.1, 0.1, 0.55);
    ring(c, o, t + 0.12, 1250, 0.9, 0.2); ring(c, o, t + 0.13, 1870, 0.5, 0.09);
  },
  // Hasim's leap: wind rushing past, cloth, a soft landing and one flash of the blade
  backstab: (c, o, t) => {
    gust(c, o, t, 0.5, 0.55, 250, 1900, 0.7);
    gust(c, o, t + 0.04, 0.4, 0.14, 2600, 5200, 1.2, 'highpass');
    [0.08, 0.15, 0.21, 0.28].forEach((d, i) => hiss(c, o, 'bandpass', 1100 + i * 140, 900, t + d, 0.035, 0.12, 2));
    tone(c, o, 'sine', 100, 60, t + 0.42, 0.12, 0.45); hiss(c, o, 'lowpass', 600, 250, t + 0.42, 0.06, 0.35);
    ring(c, o, t + 0.4, 2400, 0.3, 0.1);
  },
  // Magumba's shield: soft bells and a breath of air
  grave: (c, o, t) => {
    ring(c, o, t, 523, 1.2, 0.13, GLASS); ring(c, o, t + 0.09, 784, 1.0, 0.09, GLASS); ring(c, o, t + 0.18, 1046, 0.9, 0.06, GLASS);
    gust(c, o, t, 0.7, 0.14, 1500, 3500, 2); tone(c, o, 'sine', 130, 130, t, 0.9, 0.1, 0.2);
  },
  // Plantae's roots: a snap, rustling, creaking wood
  root: (c, o, t) => {
    hiss(c, o, 'highpass', 2500, 2500, t, 0.02, 0.7);
    gust(c, o, t, 0.45, 0.5, 600, 1400, 3); hiss(c, o, 'lowpass', 220, 100, t, 0.5, 0.65);
    [0.05, 0.17, 0.29].forEach((d, i) => hiss(c, o, 'bandpass', 900 + i * 220, 1500 + i * 150, t + d, 0.09, 0.55, 14));
  },
  // the interrupt: a parry, steel clanging against steel
  interrupt: (c, o, t) => {
    hiss(c, o, 'highpass', 2500, 2500, t, 0.02, 0.6);
    ring(c, o, t, 980, 0.6, 0.3); ring(c, o, t + 0.01, 1480, 0.35, 0.15);
    tone(c, o, 'sine', 150, 70, t, 0.15, 0.55);
  },
  // Hexor's hammer: lightning cracks, then thunder rolls
  storm: (c, o, t) => {
    hiss(c, o, 'highpass', 800, 2600, t, 0.12, 0.9); hiss(c, o, 'bandpass', 4200, 4200, t, 0.05, 0.5, 0.7);
    [0.04, 0.09, 0.13, 0.2].forEach((d) => hiss(c, o, 'highpass', 3500, 3500, t + d, 0.025, 0.35));
    hiss(c, o, 'lowpass', 300, 60, t + 0.08, 1.3, 0.85); hiss(c, o, 'lowpass', 240, 55, t + 0.38, 0.9, 0.5); hiss(c, o, 'lowpass', 200, 50, t + 0.62, 0.9, 0.35);
    tone(c, o, 'sine', 70, 30, t + 0.06, 0.8, 0.9);
  },
  // Aqna's ice: glass, frost crackle, a cold breath
  ice: (c, o, t) => {
    ring(c, o, t, 2200, 0.9, 0.11, GLASS); ring(c, o, t + 0.04, 3300, 0.6, 0.07, GLASS);
    [0, 0.03, 0.06, 0.11, 0.17].forEach((d) => hiss(c, o, 'highpass', 6500, 6500, t + d, 0.02, 0.22));
    gust(c, o, t, 0.5, 0.1, 3000, 6000, 2);
  },
  // Ge'nga calls the beast: a throat growl and a drum
  summon: (c, o, t) => {
    gust(c, o, t, 0.6, 0.5, 180, 420, 5); gust(c, o, t, 0.5, 0.22, 600, 900, 6);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(o);
    tone(c, lp, 'sawtooth', 80, 60, t, 0.55, 0.22, 0.04);
    tone(c, o, 'sine', 70, 40, t, 0.45, 0.9); hiss(c, o, 'lowpass', 500, 200, t, 0.05, 0.4);
  },
  // a horn fanfare and a bell
  victory: (c, o, t) => {
    [[392, 0, 0.26], [523, 0.17, 0.26], [659, 0.34, 0.26], [784, 0.52, 0.8]].forEach(([f, d, l]) => horn(c, o, t + d, f, l, 0.2));
    ring(c, o, t + 0.55, 1568, 1.2, 0.07, GLASS); tone(c, o, 'sine', 80, 45, t, 0.3, 0.5);
  },
  // a low horn falling, a heavy drum
  defeat: (c, o, t) => {
    [[196, 0, 0.5], [185, 0.28, 0.5], [165, 0.58, 0.9]].forEach(([f, d, l]) => horn(c, o, t + d, f, l, 0.2, 650));
    tone(c, o, 'sine', 60, 35, t, 0.6, 0.8); hiss(c, o, 'lowpass', 400, 120, t, 0.25, 0.4);
  },
  // a dull knock on wood
  error: (c, o, t) => { tone(c, o, 'sine', 160, 90, t, 0.09, 0.8); hiss(c, o, 'lowpass', 600, 250, t, 0.05, 0.6); },
  // a soft bell
  turn: (c, o, t) => { ring(c, o, t, 988, 0.6, 0.1, GLASS); ring(c, o, t + 0.07, 1480, 0.5, 0.07, GLASS); },
  // a tiny tick of stone
  select: (c, o, t) => hiss(c, o, 'bandpass', 2500, 2500, t, 0.03, 0.8, 4),
};

/** The shared output: everything goes through a little room (reverb), then a compressor. */
function buildBus(ctx: Ctx, dest: AudioNode): AudioNode {
  const input = ctx.createGain(), comp = ctx.createDynamicsCompressor();
  const verb = ctx.createConvolver(), send = ctx.createGain();
  const len = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 99;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  }
  verb.buffer = ir; send.gain.value = 0.2;
  input.connect(comp); input.connect(send); send.connect(verb); verb.connect(comp); comp.connect(dest);
  return input;
}

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
  const bus = buildBus(off, off.destination);
  RECIPES[name](off, bus, 0.01);
  const data = (await off.startRendering()).getChannelData(0);
  let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; sum += data[i] * data[i]; if (a > 0.001) last = i; }
  return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / data.length).toFixed(4), seconds: +(last / 44100).toFixed(2) };
}
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];
