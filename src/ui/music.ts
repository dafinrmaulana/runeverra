// The menu soundtrack (public/assets/audio/main-menu.mp3): plays on the menus, fades out for a match and back
// in after it, loops, and has its own volume. It streams through an <audio> element (no 160-second decode in
// memory) routed into the shared audio context, so its volume also works on iPhone, where an element's own
// volume is ignored.
import { pref, setPref } from './data';
import { audioContext } from './audio';

const FADE_SECONDS = 0.9;
let volume: number = pref('musicVol', 0.5);
let wanted = false; // on a menu screen
let element: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let pauseTimer: ReturnType<typeof setTimeout> | null = null;

function setup(): boolean {
  if (gain) return true;
  const context = audioContext();
  if (!context) return false;
  try {
    element = new Audio('assets/audio/main-menu.mp3');
    element.loop = true;
    element.preload = 'auto';
    gain = context.createGain();
    gain.gain.value = 0;
    context.createMediaElementSource(element).connect(gain);
    gain.connect(context.destination);
    return true;
  } catch {
    element = null;
    gain = null;
    return false;
  }
}

/** Fade toward what should be heard now: the music on a menu while the tab is visible, silence otherwise. */
function update() {
  const playing = wanted && volume > 0 && (typeof document === 'undefined' || !document.hidden);
  if (!playing && !gain) return;
  if (!setup() || !element || !gain) return;
  const context = gain.context as AudioContext;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
  if (playing) {
    if (context.state === 'suspended') context.resume().catch(() => {});
    element.play().catch(() => {}); // refused until the first touch; the unlock below tries again
    gain.gain.linearRampToValueAtTime(volume * 0.6, now + FADE_SECONDS);
  } else {
    gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    pauseTimer = setTimeout(() => element?.pause(), FADE_SECONDS * 1000 + 50);
  }
}

/** True on the menus (the music plays), false in a match (it fades out). */
export function setMenuMusic(onMenu: boolean) {
  wanted = onMenu;
  update();
}

export const musicVolume = () => volume;
export function setMusicVolume(level: number) {
  volume = Math.min(1, Math.max(0, level));
  setPref('musicVol', volume);
  update();
}

if (typeof window !== 'undefined') {
  // Browsers only let sound start after a touch: try again on each one until it is playing.
  const unlock = () => {
    if (wanted && (!element || element.paused)) update();
  };
  ['pointerdown', 'keydown', 'touchend'].forEach((eventName) =>
    window.addEventListener(eventName, unlock, { passive: true }),
  );
  document.addEventListener('visibilitychange', update);
}
