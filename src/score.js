// The Runeverra theme: an original piece in a dark, driving orchestral style (a galloping cello figure in 6/8,
// war drums, brass and a wordless choir over a minor progression). It is not any existing tune. This file is
// only the notes (pure data); src/ui/music.ts turns them into sound.
export const EIGHTH = 0.18;           // seconds per eighth note
export const BAR = EIGHTH * 6;        // 6/8
export const BARS = 48;
export const LOOP_SECONDS = BARS * BAR;

// D minor, an eight-bar cycle: Dm Dm C Bb | Dm Am Bb C  (root as a low MIDI note, and the third)
const PROG = [[50, 3], [50, 3], [48, 4], [46, 4], [50, 3], [45, 3], [46, 4], [48, 4]];
const chord = (bar) => { const [root, third] = PROG[bar % 8]; return { root, third: root + third, fifth: root + 7 }; };

// the tune, as [eighth within the bar, length in eighths, MIDI note] for each bar of the 8-bar cycle
const TUNE = [
  [[0, 3, 69], [3, 3, 74]],  [[0, 3, 77], [3, 3, 76]],  [[0, 3, 72], [3, 3, 76]],  [[0, 3, 70], [3, 3, 69]],
  [[0, 3, 74], [3, 3, 77]],  [[0, 3, 76], [3, 3, 72]],  [[0, 3, 74], [3, 3, 77]],  [[0, 6, 76]],
];
// the cello figure: eighth, interval above the chord root, loudness
const GALLOP = [[0, 0, 1.0], [2, 0, 0.7], [3, 7, 0.9], [5, 12, 0.7]];

/** Every note of one pass through the piece, sorted by time: { t, voice, midi, dur, vel }. */
export function buildScore() {
  const ev = [];
  const add = (t, voice, midi, dur, vel) => ev.push({ t: +t.toFixed(4), voice, midi, dur, vel });
  for (let bar = 0; bar < BARS; bar++) {
    const b0 = bar * BAR, c = chord(bar);
    const intro = bar < 4, build = bar >= 4 && bar < 8, full = bar >= 8, melody = bar >= 16, climax = bar >= 32, release = bar >= 40;
    // low drone under everything
    if (bar % 4 === 0) add(b0, 'pad', c.root - 12, BAR * 4, intro ? 0.34 : 0.3);
    if (intro) { add(b0, 'timpani', 38, 0.4, 0.36); continue; }
    // the galloping cello
    const g = build ? 0.55 : release ? 0.8 : 1;
    for (const [e, iv, v] of GALLOP) add(b0 + e * EIGHTH, 'cello', c.root + 12 + iv, EIGHTH * 0.8, v * g);
    if (climax && !release) for (const [e, iv, v] of GALLOP) add(b0 + e * EIGHTH, 'cello', c.root + 24 + iv, EIGHTH * 0.8, v * 0.55);
    // drums
    add(b0, 'timpani', 38, 0.4, build ? 0.5 : 0.8); add(b0 + 3 * EIGHTH, 'timpani', 43, 0.4, build ? 0.4 : 0.65);
    if (full) add(b0, 'drum', 33, 0.6, release ? 0.5 : 0.9);
    if (climax && !release) [2, 5].forEach((e) => add(b0 + e * EIGHTH, 'drum', 33, 0.4, 0.6));
    // strings under the cello
    if (full) { add(b0, 'pad', c.root, BAR, 0.5); add(b0, 'pad', c.third, BAR, 0.4); add(b0, 'pad', c.fifth, BAR, 0.4); }
    // the tune: cello then horn and choir
    if (melody) {
      const lift = bar >= 24 ? 12 : 0;
      for (const [e, len, note] of TUNE[bar % 8]) {
        add(b0 + e * EIGHTH, 'lead', note + lift - (bar >= 24 ? 0 : 12), len * EIGHTH * 0.95, climax ? 1 : 0.85);
        if (bar >= 24) add(b0 + e * EIGHTH, 'horn', note - 12, len * EIGHTH * 0.9, climax ? 0.9 : 0.6);
        if (bar >= 16 && !release) add(b0 + e * EIGHTH, 'choir', note, len * EIGHTH, 0.5);
      }
    }
    // horn stabs on the first beat of the build to the climax
    if (bar >= 24 && bar % 2 === 0 && !release) add(b0, 'horn', c.root + 12, EIGHTH * 3, 0.8);
  }
  return ev.sort((a, b) => a.t - b.t);
}
