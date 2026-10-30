/**
 * Draw calls and triangles at the busiest views during each mode, at Quest
 * quality (brief §9.1: 150 draw calls). The bookmark capture measures the empty
 * museum; this measures it with each mode's objects, NPCs and your hands.
 *
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/mode-perf.ts   (servers as in fraud-desktop.ts)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from 'playwright';

const base = process.env.SMOKE_BASE ?? 'http://localhost:5174';
const G = 'window.__museum.game';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${base}/party/perf-${Math.floor(Math.random() * 900 + 100)}?quality=quest`);
await page.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await page.click('button.play');
await page.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 30000 });
const spots: [string, number, number, number, number, number][] = [
  ['dino.nave', -12, 0, 46, 0, 0.17], ['greathall.length', 25.5, 0, 24, 0, 0.24], ['greathall.balcony', 36, 8, 22, Math.PI / 4, -0.17],
  ['sculpture.court', -25, 0, 0, Math.PI / 2, 0.1], ['south.court', -12, 0, 51.5, Math.PI, 0.17], ['arms.hall', 5, 0, -14, 0, 0.07],
];
let worst = 0;
const measure = async (mode: string) => {
  for (const [id, x, y, z, yaw, pitch] of spots) {
    await page.evaluate(`(() => { const g = ${G}; g.player.teleport([${x}, ${y}, ${z}], ${yaw}); g.player.pitch = ${pitch}; })()`);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(`(() => { const i = ${G}.renderer.info.render; return [i.calls, Math.round(i.triangles / 1000)]; })()`) as number[];
    worst = Math.max(worst, r[0]);
    console.log(`${mode.padEnd(15)} ${id.padEnd(18)} draws ${String(r[0]).padStart(3)}  tris ${r[1]}k${r[0] > 150 || r[1] > 350 ? '  OVER BUDGET' : ''}`);
  }
};
await measure('lobby');
for (const mode of ['ctr', 'artifactHunt', 'crowdControl', 'insuranceFraud', 'hideSeek', 'fixExhibit', 'tour']) {
  await page.evaluate(`${G}.net.send('selectMode', { mode: '${mode}' })`);
  await page.waitForFunction(`${G}.net.state.mode === '${mode}'`);
  await page.evaluate(`${G}.totem.panel.buttons.find((x) => x.id === 'start').onClick()`);
  await page.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 20000 });
  await page.waitForTimeout(mode === 'crowdControl' ? 20000 : 2500);
  await measure(mode);
  await page.evaluate(`${G}.net.send('endRound', {})`);
  await page.waitForFunction(`${G}.net.state.phase === 'lobby'`, undefined, { timeout: 30000 });
}
await browser.close();
console.log(worst > 150 ? `PERF OVER BUDGET (worst ${worst} draws)` : `PERF OK (worst ${worst} draws)`);
