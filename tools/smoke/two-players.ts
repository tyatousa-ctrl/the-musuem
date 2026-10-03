/**
 * Client smoke test (brief §22): create a party, open the invite link in a second
 * browser context, see two avatars, move with desktop controls, start a round.
 * Headless with software WebGL. Needs `npm run dev` running.
 *   SMOKE_BASE=http://localhost:5173 npm run smoke
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium, type Page } from 'playwright';

const base = process.env.SMOKE_BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const fail = (m: string) => { console.error('FAIL:', m); process.exitCode = 1; };
const info = (p: Page) => p.evaluate(() => (window as any).__museum?.game?.debugInfo?.());
const ready = (p: Page) => p.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });

const ctxA = await browser.newContext({ viewport: { width: 960, height: 540 } });
const a = await ctxA.newPage();
a.on('pageerror', (e) => console.error('[A]', e.message));
await a.goto(base);
await a.click('text=Start a party');
await a.waitForURL(/\/party\/[a-z0-9-]+$/, { timeout: 15000 });
const link = a.url();
console.log('party link:', link);
await ready(a);
await a.click('button.play');

const ctxB = await browser.newContext({ viewport: { width: 960, height: 540 } });
const b = await ctxB.newPage();
b.on('pageerror', (e) => console.error('[B]', e.message));
await b.goto(link);
await ready(b);
await b.click('button.play');

await a.waitForFunction(() => (window as any).__museum.game.debugInfo().avatars === 1, undefined, { timeout: 30000 }).catch(() => fail('A does not see B'));
await b.waitForFunction(() => (window as any).__museum.game.debugInfo().avatars === 1, undefined, { timeout: 30000 }).catch(() => fail('B does not see A'));
console.log('A:', JSON.stringify(await info(a)));
console.log('B:', JSON.stringify(await info(b)));

// Walk B forward with desktop controls and check that A sees it move.
const headOfRemote = (p: Page) => p.evaluate(() => [...(window as any).__museum.game.avatars.entries()][0]?.[1].head.position.toArray() ?? [0, 0, 0]);
// Software WebGL runs at a few fps and the sim caps dt per frame, so walk until B has moved 2 m.
const before = await headOfRemote(a);
const bStart = (await info(b)).pos;
await b.keyboard.down('KeyW');
await b.waitForFunction((s) => { const p = (window as any).__museum.game.debugInfo().pos; return Math.hypot(p[0] - s[0], p[2] - s[2]) > 2; }, bStart, { timeout: 60000 }).catch(() => fail('B could not walk'));
await b.keyboard.up('KeyW');
const bEnd = (await info(b)).pos;
await a.waitForTimeout(1500);
const after = await headOfRemote(a);
const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
const real = Math.hypot(bEnd[0] - bStart[0], bEnd[2] - bStart[2]);
console.log(`B walked ${real.toFixed(2)} m (now in ${(await info(b)).room}); A saw B move ${moved.toFixed(2)} m`);
if (Math.abs(moved - real) > 0.5) fail('remote movement does not match');

// Host starts a round through the totem button's handler (the same code a click runs).
await a.evaluate(() => (window as any).__museum.game.totem.panel.buttons.find((x: any) => x.id === 'start')?.onClick());
await a.waitForFunction(() => ['countdown', 'playing'].includes((window as any).__museum.game.debugInfo().phase), undefined, { timeout: 15000 }).catch(() => fail('round did not start'));
await a.waitForTimeout(7000);
console.log('A after start:', JSON.stringify(await info(a)));
await a.screenshot({ path: 'docs/screens/_smoke-host.png' });
await b.screenshot({ path: 'docs/screens/_smoke-guest.png' });
await browser.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK');
