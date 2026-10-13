// Zero-dependency dev server: serves the pages with live ES modules from src/ and images from assets/.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { wrap } from './build.mjs';

const port = Number(process.env.PORT) || 5173;
const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html' };
const root = new URL('./', import.meta.url);

createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.includes('..')) { res.writeHead(400); return res.end('Bad path'); }
  try {
    if (url === '/' || url === '/index.html' || url === '/classic.html') {
      const page = url === '/classic.html' ? 'classic.html' : 'index.html';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(wrap(readFileSync(new URL(`src/${page}`, root), 'utf8')));
    }
    const ext = url.slice(url.lastIndexOf('.'));
    const file = url.startsWith('/assets/') ? new URL(`.${url}`, root) : new URL(`src${url}`, root);
    if (TYPES[ext] && existsSync(file)) {
      res.writeHead(200, { 'content-type': `${TYPES[ext]}; charset=utf-8` });
      return res.end(readFileSync(file));
    }
  } catch (e) {
    res.writeHead(500); return res.end(String(e));
  }
  res.writeHead(404); res.end('Not found');
}).listen(port, () => console.log(`Hero Gambit running at http://localhost:${port} (classic mode: /classic.html)`));
