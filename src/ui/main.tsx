import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyCursor, cursorPref } from './cursor';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-800.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles.css';
import './theme.css';

applyCursor(cursorPref());
createRoot(document.getElementById('root')!).render(<App />);

// Installable app + offline shell: only on the self-hosted HTTPS site (a Claude artifact has no
// service worker scope, and dev would cache stale modules).
if ((import.meta as any).env?.PROD &&'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { try { navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch { /* unsupported */ } });
}
