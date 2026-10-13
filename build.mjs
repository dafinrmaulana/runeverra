// Post-build step after `vite build`:
//   dist/artifact.html   the app page without its document skeleton (for hosts that add their own)
//   dist/classic.html    the classic mode, its ES modules inlined into one file
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const IMPORT = /import\s*\{([^}]+)\}\s*from\s*'\.\/([\w.-]+\.js)';\n?/g;
const names = (list) => list.split(',').map((x) => x.trim()).filter(Boolean);
const exportsOf = (src) => [...src.matchAll(/^export\s+(?:const|let|function)\s+(\w+)/gm)].map((m) => m[1]);
const varFor = (file) => `__${file.replace(/[^\w]/g, '_')}`;

/** Wrap src/<file> as an IIFE (after its own dependencies) and return the blocks in order. */
function buildModule(file, done, blocks) {
  if (done.has(file)) return;
  done.add(file);
  let src = read(`./src/${file}`);
  const pre = [];
  for (const m of [...src.matchAll(IMPORT)]) {
    buildModule(m[2], done, blocks);
    pre.push(`const { ${names(m[1]).join(', ')} } = ${varFor(m[2])};`);
  }
  const body = src.replace(IMPORT, '').replace(/^export\s+/gm, '');
  blocks.push(`const ${varFor(file)} = (() => {\n${pre.join('\n')}\n${body}\nreturn { ${exportsOf(src).join(', ')} };\n})();`);
}

export function bundle(page = 'index.html') {
  let html = read(`./src/${page}`);
  const done = new Set(), blocks = [], binds = [];
  for (const m of [...html.matchAll(IMPORT)]) {
    buildModule(m[2], done, blocks);
    binds.push(`const { ${names(m[1]).join(', ')} } = ${varFor(m[2])};`);
  }
  html = html.replace(IMPORT, '');
  return html.replace('<script type="module">\n', () => `<script type="module">\n${blocks.join('\n')}\n${binds.join('\n')}\n`);
}

export const wrap = (content) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${content}\n</body>\n</html>\n`;

if (import.meta.url === `file://${process.argv[1]}`) {
  // Runs after `vite build` (which writes dist/index.html, JS and CSS inlined, plus public/assets).
  // 1. dist/artifact.html: the same page without the document skeleton, for hosts that add their own.
  const page = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');
  const head = page.slice(page.indexOf('<head>') + 6, page.indexOf('</head>'))
    .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
  const body = page.slice(page.indexOf('<body>') + 6, page.lastIndexOf('</body>'));
  writeFileSync(new URL('./dist/artifact.html', import.meta.url), `${head.trim()}\n${body.trim()}\n`);
  // 2. dist/classic.html: the earlier Assassin/Mage/Guardian version, inlined from src/.
  writeFileSync(new URL('./dist/classic.html', import.meta.url), wrap(bundle('classic.html')));
  console.log('Built dist/index.html (vite), dist/artifact.html, dist/classic.html');
}
