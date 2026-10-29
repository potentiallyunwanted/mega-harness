// Save one rig page as a single HTML file. A command, not a browser's "save as": the pages are
// self-contained already — one inline stylesheet, no client JS (ADR 0001) — so what the server
// renders is the whole artifact.
//
//   tsx scripts/save-page.ts /digest/2026-10-28 preview/index.html
//
// The lane banner comes from LANE_MARKER in the environment. Run it unset and the banner reads
// "no marker set", which is how a preview loses its marker after review (ADR 0003).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const [route, out] = process.argv.slice(2);
if (!route || !out) {
  console.error('usage: tsx scripts/save-page.ts <route> <output.html>');
  process.exit(2);
}

const res = await createApp(loadConfig()).request(route);
if (!res.ok) {
  console.error(`${route} returned ${res.status}; nothing saved`);
  process.exit(1);
}

const html = await res.text();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, 'utf8');
console.log(`${route} -> ${out} (${html.length} bytes, marker: ${process.env.LANE_MARKER?.trim() || 'none'})`);
