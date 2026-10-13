// Inlines the page's ES modules into one HTML file and copies image assets:
//   dist/index.html      standalone page (open from the dist folder, no server needed)
//   dist/artifact.html   same page without the document skeleton (for hosts that add their own)
//   dist/assets/...      character portraits and card art
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';

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
  const out = bundle('index.html');
  mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./dist/artifact.html', import.meta.url), out);
  writeFileSync(new URL('./dist/index.html', import.meta.url), wrap(out));
  writeFileSync(new URL('./dist/classic.html', import.meta.url), wrap(bundle('classic.html')));
  cpSync(new URL('./assets/', import.meta.url), new URL('./dist/assets/', import.meta.url), { recursive: true });
  console.log('Built dist/index.html, dist/artifact.html, dist/classic.html and dist/assets/');
}
