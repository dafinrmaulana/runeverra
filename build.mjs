// Post-build step after both vite builds (see vite.config.ts): dist/artifact.html is the
// single-file page from dist-artifact/ without its document skeleton, for hosts that add their own.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const page = readFileSync(new URL('./dist-artifact/index.html', import.meta.url), 'utf8');
const head = page
  .slice(page.indexOf('<head>') + 6, page.indexOf('</head>'))
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  // the PWA tags point at files that only exist next to dist/index.html
  .replace(/<link rel="(manifest|apple-touch-icon|canonical|icon)"[^>]*>\s*/gi, '')
  .replace(
    /<meta (name="(theme-color|apple-mobile-web-app-[a-z-]+|mobile-web-app-capable|robots|keywords|author)"|name="twitter:[a-z:]+"|property="og:[a-z_:]+")[^>]*>\s*/gi,
    '',
  )
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, '');
const body = page
  .slice(page.indexOf('<body>') + 6, page.lastIndexOf('</body>'))
  .replace(/<noscript>[\s\S]*?<\/noscript>\s*/i, '');
writeFileSync(new URL('./dist/artifact.html', import.meta.url), `${head.trim()}\n${body.trim()}\n`);
rmSync(new URL('./dist-artifact', import.meta.url), { recursive: true, force: true });
console.log('Built dist/ (site) and dist/artifact.html (single file)');
