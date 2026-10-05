/**
 * Movement on desktop controls in a real browser: walk vs sprint speed, riding
 * an elevator up and back down, and climbing the grand staircase to floor 2.
 * Same test-server setup as ctr-desktop.ts (big pose jumps allowed for setup):
 *
 *   MUSEUM_TUNABLES='{"net":{"maxPoseSpeed":10000}}' PORT=2568 npx tsx server/src/index.ts
 *   VITE_SERVER_URL=http://localhost:2568 npx vite --port 5174   (in client/)
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/movement-desktop.ts
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
const page = await (await browser.newContext({ viewport: { width: 480, height: 270 } })).newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${base}/party/move-smoke-${Math.floor(Math.random() * 900 + 100)}`);
await page.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await page.click('button.play');
await page.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 30000 });
const feet = () => page.evaluate(`${G}.player.feet.toArray()`) as Promise<number[]>;
const room = () => page.evaluate(`${G}.debugInfo().room`) as Promise<string>;
const speed = () => page.evaluate(`Math.hypot(${G}.player.velocity.x, ${G}.player.velocity.z)`) as Promise<number>;
const tp = (x: number, y: number, z: number, yaw: number) => page.evaluate(`${G}.player.teleport([${x}, ${y}, ${z}], ${yaw})`);

// 1. Walk vs sprint, down the length of the Great Hall (facing north, yaw 0).
await tp(30, 0, 20, 0);
await page.waitForTimeout(800);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
const walk = await speed();
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(1200);
const sprint = await speed();
await page.keyboard.up('ShiftLeft');
await page.keyboard.up('KeyW');
console.log(`walk ${walk.toFixed(2)} m/s, sprint ${sprint.toFixed(2)} m/s`);
if (Math.abs(walk - 2.6) > 0.2) fail(`walk speed ${walk}`);
if (Math.abs(sprint - 4.2) > 0.2) fail(`sprint speed ${sprint}`);

// 2. Elevator: stand in the Great Hall's north-west cab, press E, arrive on the balcony; E again to go down.
await tp(14.6, 0, -26.5, Math.PI / 2);
await page.waitForTimeout(1000);
await page.keyboard.press('KeyE');
await page.waitForFunction(`${G}.player.feet.y > 7.5`, undefined, { timeout: 10000 }).catch(() => fail('elevator did not go up'));
console.log('after elevator up:', (await feet()).map((v) => v.toFixed(1)).join(', '), await room());
await page.screenshot({ path: 'docs/screens/_smoke-elevator-up.png' });
await page.waitForTimeout(1200);
await page.keyboard.press('KeyE');
await page.waitForFunction(`${G}.player.feet.y < 0.5`, undefined, { timeout: 10000 }).catch(() => fail('elevator did not come down'));
console.log('after elevator down:', (await feet()).map((v) => v.toFixed(1)).join(', '));

// 3. Climb the grand staircase on foot (sprinting) to the second-floor landing.
await tp(14.5, 0, 0, Math.PI / 2);
await page.waitForTimeout(800);
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
await page.waitForFunction(`${G}.player.feet.y > 7.8`, undefined, { timeout: 90000 }).catch(() => fail('could not climb the grand staircase'));
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
console.log('top of the grand staircase:', (await feet()).map((v) => v.toFixed(1)).join(', '), await room());
await page.screenshot({ path: 'docs/screens/_smoke-stair-top.png' });
await browser.close();
console.log(process.exitCode ? 'MOVEMENT SMOKE FAILED' : 'MOVEMENT SMOKE OK');
