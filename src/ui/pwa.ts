// Install support: Chrome/Android fire `beforeinstallprompt`; iPhone Safari never does, so it gets a hint instead.
import { useEffect, useState } from 'react';

/** Chrome's install prompt event (not in the DOM typings yet). */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<unknown> };
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export type InstallState = { kind: 'prompt' | 'ios' | 'none'; install: () => Promise<void> };

export function useInstall(): InstallState {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((count) => count + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  const kind = isStandalone() ? 'none' : deferred ? 'prompt' : isIos() ? 'ios' : 'none';
  return {
    kind,
    install: async () => {
      if (!deferred) return;
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        /* dismissed */
      }
      deferred = null;
      notify();
    },
  };
}
