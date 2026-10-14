// Post-build step after `vite build` (which writes dist/index.html with JS and CSS inlined,
// plus public/assets): dist/artifact.html is the same page without its document skeleton,
// for hosts that add their own.
import { readFileSync, writeFileSync } from 'node:fs';

const page = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');
const head = page.slice(page.indexOf('<head>') + 6, page.indexOf('</head>'))
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = page.slice(page.indexOf('<body>') + 6, page.lastIndexOf('</body>'));
writeFileSync(new URL('./dist/artifact.html', import.meta.url), `${head.trim()}\n${body.trim()}\n`);
console.log('Built dist/index.html (vite) and dist/artifact.html');
