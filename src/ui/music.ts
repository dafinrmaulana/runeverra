// The soundtrack player: turns the notes in src/score.js into sound with the same Web Audio tools as the sound
// effects (bowed strings, horns, a wordless choir, timpani and war drums), then schedules them a moment ahead
// so the piece loops without a seam. Its own volume, its own output (the effects volume never changes it).
import { buildScore, LOOP_SECONDS } from '../score.js';
import { pref, setPref } from './data';
import { audioContext, hiss, thump, horn } from './audio';

type Ctx = BaseAudioContext;
type Voice = 'cello' | 'lead' | 'pad' | 'choir' | 'horn' | 'timpani' | 'drum';
type Note = { t: number; voice: Voice; midi: number; dur: number; vel: number };

export type Mood = 'home' | 'calm' | 'game';
const MOOD_LEVEL: Record<Mood, number> = { home: 1, calm: 0.7, game: 0.45 };

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** A bowed string: two saws with a little vibrato through a filter that opens as the bow bites. */
function bow(ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, peak: number, attack: number) {
  const f = hz(midi);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(Math.min(5000, f * 7), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.2), t + Math.min(0.2, dur));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + Math.max(attack, dur - 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  lp.connect(g); g.connect(out);
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 5.3; lg.gain.value = dur > 0.4 ? 9 : 3; lfo.connect(lg);
  [-6, 6].forEach((cents) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
    lg.connect(o.detune); o.connect(lp); o.start(t); o.stop(t + dur + 0.12);
  });
  lfo.start(t); lfo.stop(t + dur + 0.12);
}

/** A wordless choir: saws through two vowel filters ("ah"), slow to start. */
function choir(ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, peak: number) {
  const f = hz(midi), g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.5, dur * 0.5)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  g.connect(out);
  [[800, 1.0], [1150, 0.6], [2700, 0.2]].forEach(([fc, amp]) => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = 7;
    const a = ctx.createGain(); a.gain.value = amp; bp.connect(a); a.connect(g);
    [-8, 0, 8].forEach((cents) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents; o.connect(bp); o.start(t); o.stop(t + dur + 0.3); });
  });
}

/** Sustained strings: a few detuned saws through a soft filter, slow in and slow out. */
function strings(ctx: Ctx, out: AudioNode, t: number, midi: number, dur: number, peak: number) {
  const f = hz(midi), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.7;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.5); g.gain.setValueAtTime(peak, t + Math.max(0.5, dur - 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7);
  lp.connect(g); g.connect(out);
  [-9, 0, 9].forEach((cents) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents; o.connect(lp); o.start(t); o.stop(t + dur + 0.8); });
}

const PLAY: Record<Voice, (c: Ctx, o: AudioNode, n: Note, t: number) => void> = {
  cello: (c, o, n, t) => bow(c, o, t, n.midi, n.dur, 0.2 * n.vel, 0.012),
  lead: (c, o, n, t) => bow(c, o, t, n.midi, n.dur, 0.16 * n.vel, 0.08),
  pad: (c, o, n, t) => strings(c, o, t, n.midi, n.dur, 0.05 * n.vel),
  choir: (c, o, n, t) => choir(c, o, t, n.midi, n.dur, 0.08 * n.vel),
  horn: (c, o, n, t) => horn(c, o, t, hz(n.midi), n.dur, 0.16 * n.vel, 1100),
  timpani: (c, o, n, t) => { thump(c, o, t, hz(n.midi) * 1.6, hz(n.midi), 0.5, 0.9 * n.vel, 3); hiss(c, o, 'bandpass', 260, 200, t, 0.05, 0.25 * n.vel, 2); },
  drum: (c, o, n, t) => thump(c, o, t, hz(n.midi) * 1.4, hz(n.midi) * 0.7, 0.7, 1.0 * n.vel, 4),
};

/** The music's own output: a touch of low end, a long hall, a compressor, then the speakers. */
function buildMusicBus(ctx: Ctx, dest: AudioNode): AudioNode {
  const input = ctx.createGain(), low = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor();
  input.gain.value = 0.78; // headroom: the full band is loud
  low.type = 'lowshelf'; low.frequency.value = 120; low.gain.value = 3;
  const verb = ctx.createConvolver(), send = ctx.createGain(), dark = ctx.createBiquadFilter();
  const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 4242;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  }
  verb.buffer = ir; send.gain.value = 0.38; dark.type = 'lowpass'; dark.frequency.value = 3200;
  input.connect(low); low.connect(comp); low.connect(send); send.connect(dark); dark.connect(verb); verb.connect(comp); comp.connect(dest);
  return input;
}

// ---------- the live player ----------
const SCORE = buildScore() as Note[];
let volume: number = pref('musicVol', 0.4);
let mood: Mood = 'home';
let out: GainNode | null = null;
let bus: AudioNode | null = null;
let timer: number | null = null;
let loopStart = 0;
let cursor = 0;

const target = () => volume * MOOD_LEVEL[mood] * 0.85;
function applyLevel(c: AudioContext, seconds = 0.8) { if (out) out.gain.setTargetAtTime(target(), c.currentTime, seconds / 3); }

function tick() {
  const c = audioContext();
  if (!c || !bus || document.hidden) return;
  const horizon = c.currentTime + 1.4;
  while (loopStart + SCORE[cursor].t < horizon) {
    const n = SCORE[cursor], at = loopStart + n.t;
    if (at > c.currentTime - 0.05) { try { PLAY[n.voice](c, bus, n, Math.max(at, c.currentTime + 0.01)); } catch { /* one bad note must not stop the music */ } }
    if (++cursor >= SCORE.length) { cursor = 0; loopStart += LOOP_SECONDS + 1.0; }
  }
}

export function startMusic() {
  if (timer !== null || volume <= 0) return;
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  out = c.createGain(); out.gain.value = 0.0001; out.connect(c.destination);
  bus = buildMusicBus(c, out);
  loopStart = c.currentTime + 0.4; cursor = 0;
  applyLevel(c, 3);
  timer = window.setInterval(tick, 120);
  tick();
}

export function stopMusic() {
  if (timer !== null) { clearInterval(timer); timer = null; }
  const c = audioContext();
  if (c && out) { const o = out; o.gain.setTargetAtTime(0.0001, c.currentTime, 0.2); window.setTimeout(() => { try { o.disconnect(); } catch { /* gone */ } }, 1500); }
  out = null; bus = null;
}

export const musicVolume = () => volume;
export function setMusicVolume(v: number) {
  volume = Math.min(1, Math.max(0, v)); setPref('musicVol', volume);
  const c = audioContext();
  if (volume <= 0) stopMusic();
  else if (timer === null) startMusic();
  else if (c) applyLevel(c);
}
export function setMusicMood(m: Mood) { mood = m; const c = audioContext(); if (c && out) applyLevel(c, 1.5); }

if (typeof window !== 'undefined') {
  // The browser only lets sound start after a touch: begin with the first one.
  const begin = () => { startMusic(); };
  ['pointerdown', 'keydown', 'touchend'].forEach((e) => window.addEventListener(e, begin, { once: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    const c = audioContext();
    if (!c || timer === null) return;
    if (document.hidden) { c.suspend().catch(() => {}); } else { c.resume().then(() => { loopStart = Math.max(loopStart, c.currentTime); }).catch(() => {}); }
  });
}

/** Render the first `seconds` of the piece offline and report how loud it gets (a check, not used in play). */
export async function measureMusic(seconds = 70) {
  const off = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100);
  const bus2 = buildMusicBus(off, off.destination);
  for (const n of SCORE) { if (n.t > seconds) break; PLAY[n.voice](off, bus2, n, n.t + 0.01); }
  const buf = await off.startRendering(), d = buf.getChannelData(0);
  const windows: number[] = [];
  for (let w = 0; w < seconds; w += 10) {
    let peak = 0, sum = 0, cnt = 0;
    for (let i = Math.floor(w * 44100); i < Math.min(d.length, Math.floor((w + 10) * 44100)); i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; cnt++; }
    windows.push(+Math.sqrt(sum / Math.max(1, cnt)).toFixed(4));
  }
  let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  return { peak: +peak.toFixed(3), rmsPer10s: windows, notes: SCORE.filter((n) => n.t <= seconds).length };
}
