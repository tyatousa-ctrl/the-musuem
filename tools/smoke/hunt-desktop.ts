/**
 * Artifact Hunt on desktop controls in a real browser (brief §16, §11.4):
 * find an artifact, grab it with E, carry it to the Registrar's Desk, score.
 * Same test-server setup as ctr-desktop.ts (big pose jumps allowed):
 *
 *   MUSEUM_TUNABLES='{"net":{"maxPoseSpeed":10000},"round":{"countdownSec":1}}' PORT=2568 npx tsx server/src/index.ts
 *   VITE_SERVER_URL=http://localhost:2568 npx vite --port 5174   (in client/)
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/hunt-desktop.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from 'playwright';

const base = process.env.SMOKE_BASE ?? 'http://localhost:5174';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const fail = (m: string) => { console.error('FAIL:', m); process.exitCode = 1; };
const G = 'window.__museum.game';

const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${base}/party/hunt-smoke-${Math.floor(Math.random() * 900 + 100)}`);
await page.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await page.click('button.play');
await page.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 30000 });
await page.evaluate(`${G}.net.send('selectMode', { mode: 'artifactHunt' })`);
await page.waitForFunction(`${G}.net.state.mode === 'artifactHunt'`, undefined, { timeout: 10000 });
await page.evaluate(`${G}.totem.panel.buttons.find((x) => x.id === 'start').onClick()`);
await page.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 30000 });

// Pick an obvious (common) artifact on a floor or low surface.
const target = await page.evaluate(`(() => { let t = null; ${G}.net.state.objects.forEach((o, id) => { if (!t && o.kind === 'artifact' && o.variant === 'common') t = { id, x: o.x, y: o.y, z: o.z }; }); return t; })()`) as any;
console.log('target', target);
const hudBefore = await page.evaluate(`document.getElementById('hud').innerText`);
console.log('HUD:', JSON.stringify(hudBefore));

// Stand 1 m south of it looking north and slightly down at it, then press E.
const feetY = target.y - 0.15;
const eye = feetY + 1.65;
const pitch = Math.atan2(target.y - eye, 1.0);
await page.evaluate(`(() => { const g = ${G}; g.player.teleport([${target.x}, ${feetY}, ${target.z + 1.0}], 0); g.player.pitch = ${pitch}; })()`);
await page.waitForTimeout(1500);
const hudNear = (await page.evaluate(`document.getElementById('hud').innerText`)) as string;
console.log('HUD near:', JSON.stringify(hudNear));
if (!/Burning|Hot/.test(hudNear)) fail('warmer/colder did not read hot next to an artifact');
await page.screenshot({ path: 'docs/screens/_smoke-hunt-find.png' });
await page.keyboard.press('KeyE');
await page.waitForFunction(`${G}.net.state.objects.get('${target.id}')?.status === 'carried'`, undefined, { timeout: 8000 }).catch(() => fail('grab did not register'));

// Carry to the desk.
await page.evaluate(`${G}.player.teleport([19.6, 0, 2], Math.PI / 2)`);
await page.waitForFunction(`${G}.net.me().score >= 1`, undefined, { timeout: 10000 }).catch(() => fail('delivery did not score'));
console.log('score', await page.evaluate(`${G}.net.me().score`), 'left', await page.evaluate(`(() => { let n = 0; ${G}.net.state.objects.forEach((o) => { if (o.kind === 'artifact') n++; }); return n; })()`));
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/screens/_smoke-hunt-desk.png' });
await browser.close();
console.log(process.exitCode ? 'HUNT SMOKE FAILED' : 'HUNT SMOKE OK');
