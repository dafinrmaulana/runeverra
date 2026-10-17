// The phone's back button (Android) and the swipe back gesture (iOS) step back inside the game, the
// same as its own Back buttons: close the open dialog, then the screen before. Only on the home screen,
// with nothing open, does back leave the page as usual.
// How: while anything can go back, one extra history entry sits on top. Going back pops it, and the
// newest, highest handler runs instead of the page closing; if more is still open, the entry goes back on.
import { useEffect, useRef } from 'react';

/** Higher layers go back first: a dialog before a game's menu, a game's menu before its screen. */
export type BackLayer = 'screen' | 'panel' | 'dialog';
const RANK: Record<BackLayer, number> = { screen: 0, panel: 1, dialog: 2 };

type Entry = { rank: number; order: number; run: () => void };
const entries = new Set<Entry>();
let order = 0;
let guarded = false; // our extra entry is on top of the history
let ignorePop = false; // the next popstate is our own history.back(), not the player's
let restoreUrl = '';

const top = () => [...entries].sort((first, second) => second.rank - first.rank || second.order - first.order)[0];

function sync() {
  if (typeof window === 'undefined' || ignorePop) return; // mid-way through our own back: its popstate syncs
  if (entries.size && !guarded) {
    history.pushState({ runeverraBack: true }, '');
    guarded = true;
  } else if (!entries.size && guarded) {
    // Closed from inside the game: take our entry back off so the next back press leaves as usual.
    guarded = false;
    ignorePop = true;
    restoreUrl = location.href;
    history.back();
  }
}
// Several handlers come and go in one render: settle the history once, after it.
let pending = false;
function scheduleSync() {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    sync();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePop) {
      ignorePop = false;
      if (restoreUrl && restoreUrl !== location.href) history.replaceState(history.state, '', restoreUrl);
      scheduleSync();
      return;
    }
    if (!guarded) return; // a back with nothing of ours open: let the page go
    guarded = false;
    top()?.run();
    // React re-renders first; whatever is still open puts the entry back.
    setTimeout(sync, 0);
  });
}

/** While `active`, the phone's back runs `onBack` (the newest handler of the highest layer wins). */
export function useBack(active: boolean, onBack: () => void, layer: BackLayer) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { rank: RANK[layer], order: ++order, run: () => latest.current() };
    entries.add(entry);
    scheduleSync();
    return () => {
      entries.delete(entry);
      scheduleSync();
    };
  }, [active, layer]);
}
