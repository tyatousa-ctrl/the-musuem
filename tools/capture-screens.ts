/**
 * Capture every camera bookmark to docs/screens/<id>.png (brief §22).
 * Needs the client dev server running (npm run dev, or npm run dev -w client).
 *   SCREENS_BASE=http://localhost:5173 npm run screens [-- id1 id2]
 */
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
  const perf = await page.evaluate(() => document.getElementById('perf')?.textContent ?? '');
  await page.evaluate(() => { const p = document.getElementById('perf'); if (p) p.style.display = 'none'; });
  await page.screenshot({ path: `${out}${b.id}.png` });
  console.log(`${b.id}: ${perf.split('\n').slice(1, 3).join(' | ')}`);
  report.push(`${b.id}\t${perf.replace(/\n/g, ' | ')}`);
}
writeFileSync(`${out}perf.tsv`, report.join('\n') + '\n');
await browser.close();

declare global { interface Window { __museum?: { ready: boolean } } }
