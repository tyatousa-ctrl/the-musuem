/**
 * Capture every camera bookmark to docs/screens/<id>.png (brief §22).
 * Needs the client dev server running (npm run dev, or npm run dev -w client).
 *   SCREENS_BASE=http://localhost:5173 npm run screens [-- id1 id2]
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BOOKMARKS } from '../client/src/debug/bookmarks.ts';

const base = process.env.SCREENS_BASE ?? 'http://localhost:5173';
const out = new URL('../docs/screens/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const quality = process.env.SCREENS_QUALITY ?? 'desktop';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('[page]', e.message));
const report: string[] = [];
for (const b of BOOKMARKS) {
  if (only.length && !only.includes(b.id)) continue;
  await page.goto(`${base}/?offline&clean&perf&quality=${quality}&cam=${b.id}`);
  await page.waitForFunction(() => window.__museum?.ready === true, undefined, { timeout: 120_000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => { const p = document.getElementById('perf'); if (p) p.style.display = 'none'; });
  // Budget check (brief §9.1): draw calls and triangles for this view, from the last rendered frame.
  const r = await page.evaluate(() => {
    const g = (window as any).__museum.game;
    g.renderer.render(g.scene, g.camera);
    const i = g.renderer.info.render;
    return { calls: i.calls, tris: i.triangles, rooms: g.perf.rooms.length };
  });
  await page.screenshot({ path: `${out}${b.id}.png` });
  const over = r.calls > 150 || r.tris > 350_000 ? '  OVER BUDGET' : '';
  console.log(`${b.id.padEnd(20)} draws ${String(r.calls).padStart(4)}  tris ${(r.tris / 1000).toFixed(0).padStart(4)}k  rooms ${r.rooms}${over}`);
  report.push(`${b.id}\t${r.calls}\t${r.tris}\t${r.rooms}`);
}
writeFileSync(`${out}perf.tsv`, 'bookmark\tdraws\ttris\trooms\n' + report.join('\n') + '\n');
await browser.close();

declare global { interface Window { __museum?: { ready: boolean } } }
