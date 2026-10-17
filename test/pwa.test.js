import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));

test('manifest has what installability needs, and every icon exists', () => {
  for (const k of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color'])
    assert.ok(manifest[k], k);
  assert.equal(manifest.display, 'standalone');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const i of manifest.icons) assert.ok(existsSync(`public/${i.src}`), i.src);
  assert.ok(existsSync('public/icons/apple-touch-180.png'));
});

test('index.html links the manifest; the service worker never intercepts other origins or non-GET', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /rel="manifest" href="\.\/manifest\.json"/);
  const sw = readFileSync('public/sw.js', 'utf8');
  assert.match(sw, /req\.method !== 'GET'/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
});
