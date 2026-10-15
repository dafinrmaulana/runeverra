import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LEGAL } from '../src/legal-config.js';

const html = readFileSync('index.html', 'utf8');
const tag = (re) => (html.match(re) || [])[1];

test('share preview: title, description, canonical and Open Graph / Twitter tags are present and agree', () => {
  assert.ok(tag(/<title>([^<]+)<\/title>/).length <= 65, 'title short enough');
  const desc = tag(/<meta name="description" content="([^"]+)"/);
  assert.ok(desc.length >= 80 && desc.length <= 200, `description length ${desc.length}`);
  for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name']) assert.ok(tag(new RegExp(`<meta property="${p}" content="([^"]+)"`)), p);
  for (const n of ['twitter:card', 'twitter:title', 'twitter:image']) assert.ok(tag(new RegExp(`<meta name="${n}" content="([^"]+)"`)), n);
  assert.equal(tag(/<meta name="twitter:card" content="([^"]+)"/), 'summary_large_image');
  const site = LEGAL.siteUrl.replace(/\/$/, '');
  assert.equal(tag(/<link rel="canonical" href="([^"]+)"/), `${site}/`);
  assert.equal(tag(/<meta property="og:url" content="([^"]+)"/), `${site}/`);
  assert.equal(tag(/<meta property="og:image" content="([^"]+)"/), `${site}/og-image.png`, 'image URL must be absolute');
});

test('every file the head points to exists, and the JSON-LD parses', () => {
  for (const f of ['public/og-image.png', 'public/favicon.ico', 'public/icons/icon-16.png', 'public/icons/icon-32.png', 'public/icons/apple-touch-180.png', 'public/manifest.json', 'public/robots.txt', 'public/sitemap.xml']) assert.ok(existsSync(f), f);
  const ld = JSON.parse(tag(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
  assert.equal(ld['@type'], 'VideoGame');
  assert.equal(ld.url, `${LEGAL.siteUrl.replace(/\/$/, '')}/`);
});

test('the manifest uses an extension nginx serves as JSON (not .webmanifest), and the sitemap names the site', () => {
  assert.ok(!existsSync('public/manifest.webmanifest'));
  assert.match(readFileSync('public/sitemap.xml', 'utf8'), new RegExp(`<loc>${LEGAL.siteUrl.replace(/\/$/, '')}/</loc>`));
  assert.match(readFileSync('public/robots.txt', 'utf8'), /Sitemap: https:\/\//);
});
