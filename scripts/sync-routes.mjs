#!/usr/bin/env node
/**
 * Keep path-route copies of index.html in sync.
 *
 * GitHub Pages is a static host: for <root>/leaderboard/ to survive a page
 * refresh, a real file must exist there. Each route folder holds a copy of
 * index.html whose <base href="./" data-route-base> is rewritten to "../",
 * so every relative URL (scripts, styles, assets) resolves from the app root
 * — including for the browser's preload scanner (no stray 404s). The root
 * page keeps "./", which also pins assets when the app pushState()s routes.
 *
 *   node scripts/sync-routes.mjs          # write / refresh the copies
 *   node scripts/sync-routes.mjs --check  # exit 1 if any copy is stale (CI)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES = ['leaderboard'];
const MARKER = /<base href="[^"]*" data-route-base>/;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!MARKER.test(source)) {
  console.error('index.html is missing <base href="./" data-route-base>.');
  process.exit(1);
}
const check = process.argv.includes('--check');

let stale = 0;
for (const route of ROUTES) {
  const baseHref = '../'.repeat(route.split('/').length);
  const expected = source.replace(MARKER, `<base href="${baseHref}" data-route-base>`);
  const file = path.join(root, route, 'index.html');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === expected) {
    console.log(`ok      ${route}/index.html`);
    continue;
  }
  if (check) {
    console.error(`STALE   ${route}/index.html — run: node scripts/sync-routes.mjs`);
    stale++;
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, expected);
  console.log(`wrote   ${route}/index.html`);
}
process.exit(stale ? 1 : 0);
