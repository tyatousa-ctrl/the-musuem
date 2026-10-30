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
import { museum } from '@museum/shared';

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

// 2. Elevators: look at the floor button in the cab and press E; the doors close, the cab rises, we arrive.
const button = (id: string, kind: string, floor: number) => page.evaluate(`(() => { const b = ${G}.elevators.buttons.find((x) => x.elevator === '${id}' && x.kind === '${kind}' && x.floor === ${floor}); return b.pos.toArray(); })()`) as Promise<number[]>;
/** Stand `back` m from a point at eye level and look straight at it. */
const lookAt = async (p: number[], from: [number, number], floorY: number) => {
  await tp(from[0], floorY, from[1], Math.atan2(-(p[0] - from[0]), -(p[2] - from[1])));
  await page.waitForTimeout(600);
  await page.evaluate(`(() => { const g = ${G}; const d = Math.hypot(${p[0]} - ${from[0]}, ${p[2]} - ${from[1]}); g.player.pitch = Math.atan2(${p[1]} - (${floorY} + 1.65), d); })()`);
  await page.waitForTimeout(400);
};
for (const id of ['elevGreatHallN', 'elevGreatHallS']) {
  const e = museum.elevators.find((x) => x.id === id)!;
  // Up: from inside the cab, press 2.
  const up = await button(id, 'car', 2);
  await lookAt(up, [e.x + 0.6, e.z], 0);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(`${G}.player.feet.y > 7.5`, undefined, { timeout: 15000 }).catch(() => fail(`${id}: floor button did not take us up`));
  console.log(`${id} up:`, (await feet()).map((v) => v.toFixed(1)).join(', '), await room());
  if (id === 'elevGreatHallN') await page.screenshot({ path: 'docs/screens/_smoke-elevator-up.png' });
  // Down: press 1.
  const down = await button(id, 'car', 1);
  await page.waitForTimeout(1500);
  await lookAt(down, [e.x + 0.6, e.z], 8);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(`${G}.player.feet.y < 0.5`, undefined, { timeout: 15000 }).catch(() => fail(`${id}: floor button did not take us down`));
  console.log(`${id} down:`, (await feet()).map((v) => v.toFixed(1)).join(', '));
}
// The balcony: walk from the north balcony round the cab to the west balcony (walk until there:
// software rendering is slow and each frame's step is capped).
const walkUntil = async (yaw: number, cond: string, what: string) => {
  await page.evaluate(`${G}.player.yaw = ${yaw}`);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(cond, undefined, { timeout: 30000 }).catch(() => fail(what));
  await page.keyboard.up('KeyW');
};
await tp(17, 8, -26.5, Math.PI);
await page.waitForTimeout(600);
await walkUntil(Math.PI, `${G}.player.feet.z > -23.2`, 'could not step onto the elevator landing');
await walkUntil(Math.PI / 2, `${G}.player.feet.x < 14`, 'could not walk from the landing onto the west balcony');
const onW = await feet();
console.log('north balcony -> round the cab -> west balcony:', onW.map((v) => v.toFixed(1)).join(', '));
if (onW[1] < 7.5) fail('fell off the balcony');
await page.screenshot({ path: 'docs/screens/_smoke-elevator-landing.png' });

// The basement: down the north service stair and back up into the court.
await tp(24, 0, -74.5, Math.PI);
await page.waitForTimeout(600);
await walkUntil(Math.PI, `${G}.player.feet.y < -5.8`, 'did not get down the service stair');
await walkUntil(0, `${G}.player.feet.z < -74 && ${G}.player.feet.y > -0.1`, 'could not climb back out of the basement');
console.log('basement: down and back up to', (await feet()).map((v) => v.toFixed(1)).join(', '));

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
