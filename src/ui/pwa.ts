// Install support: Chrome/Android fire `beforeinstallprompt`; iPhone Safari never does, so it gets a hint instead.
import { useEffect, useState } from 'react';

let deferred: any = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export type InstallState = { kind: 'prompt' | 'ios' | 'none'; install: () => Promise<void> };

export function useInstall(): InstallState {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const kind = isStandalone() ? 'none' : deferred ? 'prompt' : isIos() ? 'ios' : 'none';
  return {
    kind,
    install: async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* dismissed */ }
      deferred = null; notify();
    },
  };
}
