/**
 * A walkthrough on desktop controls: every mode's how-to card, Free Roam
 * (rooms visited), the map on each floor (opened and closed with M and with
 * the on-screen button), and the personal menu's Map and End round buttons.
 *
 *   MUSEUM_TUNABLES='{"net":{"maxPoseSpeed":10000},"round":{"countdownSec":3,"resultsSec":2}}' PORT=2568 npx tsx server/src/index.ts
 *   VITE_SERVER_URL=http://localhost:2568 npx vite --port 5174   (in client/)
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/roam-map-desktop.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from 'playwright';
import { MODE_CATALOG } from '@museum/shared';

const base = process.env.SMOKE_BASE ?? 'http://localhost:5174';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const fail = (m: string) => { console.error('FAIL:', m); process.exitCode = 1; };
const G = 'window.__museum.game';
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${base}/party/roam-smoke-${Math.floor(Math.random() * 900 + 100)}`);
await page.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await page.click('button.play');
await page.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 30000 });
const hud = () => page.evaluate(`document.getElementById('hud').innerText`) as Promise<string>;
const tp = (x: number, y: number, z: number, yaw: number, pitch = 0) => page.evaluate(`(() => { const g = ${G}; g.player.teleport([${x}, ${y}, ${z}], ${yaw}); g.player.pitch = ${pitch}; })()`);
const start = async (mode: string) => {
  await page.evaluate(`${G}.net.send('selectMode', { mode: '${mode}' })`);
  await page.waitForFunction(`${G}.net.state.mode === '${mode}'`, undefined, { timeout: 10000 });
  await page.evaluate(`${G}.totem.panel.buttons.find((x) => x.id === 'start').onClick()`);
  await page.waitForFunction(`${G}.net.state.phase === 'countdown'`, undefined, { timeout: 10000 });
};
const toLobby = async () => {
  await page.evaluate(`${G}.net.send('endRound', {})`);
  await page.waitForFunction(`${G}.net.state.phase === 'lobby'`, undefined, { timeout: 20000 });
};

// 1. Every mode shows its how-to card when the round starts.
for (const m of MODE_CATALOG.filter((x) => x.available && x.id !== 'tour' && !process.env.SKIP_HOWTO)) {
  await tp(30, 0, 0, Math.PI / 2, 0);
  await start(m.id);
  await page.waitForTimeout(600);
  const card = await page.evaluate(`document.getElementById('card').innerText`) as string;
  if (!card.includes(m.name.toUpperCase())) fail(`${m.id}: how-to card missing (got ${JSON.stringify(card.slice(0, 40))})`);
  await page.screenshot({ path: `docs/screens/_howto-${m.id}.png` });
  await toLobby();
}

// 2. Free Roam: untimed, the HUD names your room and counts the rooms you've seen.
await start('tour');
await page.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 10000 });
if (await page.evaluate(`${G}.net.state.phaseEndsAt`) !== 0) fail('Free Roam has a timer');
await page.screenshot({ path: 'docs/screens/_howto-tour.png' });
const tourStops: [number, number, number][] = [[25, 0, 0], [5, 0, -30], [-12, 0, 0], [-40, 0, 0], [-40, 0, 30], [5, 0, 30], [25, 0, 40], [25, 0, -38], [-12, 0, -60]];
for (const [x, y, z] of tourStops) { await tp(x, y, z, 0); await page.waitForTimeout(450); }
const h = await hud();
console.log('Free Roam HUD:', JSON.stringify(h));
if (!/rooms visited/.test(h) || !/You're in/.test(h)) fail('Free Roam HUD missing room info');

// 3. The map: M opens it, M closes it; the on-screen button does the same.
await tp(25, 0, -10, 0);
await page.waitForTimeout(500);
await page.keyboard.press('KeyM');
await page.waitForFunction(`${G}.minimap.open`, undefined, { timeout: 3000 }).catch(() => fail('M did not open the map'));
await page.waitForTimeout(600);
await page.screenshot({ path: 'docs/screens/_map-ground.png' });
await page.keyboard.press('KeyM');
await page.waitForFunction(`!${G}.minimap.open`, undefined, { timeout: 5000 }).catch(() => fail('M did not close the map'));
if (!(await page.isVisible('#mapBtn'))) fail('no on-screen Map button');
// While mouse-look has the pointer locked, clicks go to the game (M is the way); free the cursor, then click the button.
await page.evaluate('document.exitPointerLock()');
await page.waitForTimeout(300);
await page.click('#mapBtn', { force: true }); // a real click at the button (actionability checks trip on slow software rendering)
await page.waitForFunction(`${G}.minimap.open`, undefined, { timeout: 5000 }).catch(() => fail('the Map button did not open the map'));
if (!/Close map/.test(await page.innerText('#mapBtn'))) fail('Map button label did not change to Close');
// Upstairs: the upper floor is highlighted.
await page.click('#mapBtn', { force: true });
await page.waitForFunction(`!${G}.minimap.open`, undefined, { timeout: 5000 });
await tp(-31.5, 8, -20, Math.PI / 2);
await page.evaluate('document.exitPointerLock()');
await page.waitForTimeout(800);
await page.click('#mapBtn', { force: true });
await page.waitForFunction(`${G}.minimap.open`, undefined, { timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: 'docs/screens/_map-upper.png' });
await page.click('#mapBtn', { force: true });
await page.waitForFunction(`!${G}.minimap.open`, undefined, { timeout: 5000 }).catch(() => fail('the Map button did not close the map'));
// The service level.
await tp(24, -6, -20, 0);
await page.waitForTimeout(800);
await page.keyboard.press('KeyM');
await page.waitForFunction(`${G}.minimap.open`, undefined, { timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: 'docs/screens/_map-service.png' });
await page.keyboard.press('KeyM');

// 4. The personal menu: Map and End round (host).
await tp(25, 0, 10, Math.PI / 2);
await page.waitForTimeout(400);
await page.evaluate(`${G}.menu.show()`);
await page.waitForTimeout(600);
await page.screenshot({ path: 'docs/screens/_menu-host.png' });
const ids = await page.evaluate(`${G}.menu.panel.buttons.map((b) => b.id)`) as string[];
if (!ids.includes('map') || !ids.includes('endRound')) fail(`menu buttons: ${ids.join(',')}`);
await page.evaluate(`${G}.menu.panel.buttons.find((b) => b.id === 'endRound').onClick()`);
await page.waitForFunction(`${G}.net.state.phase !== 'playing'`, undefined, { timeout: 10000 }).catch(() => fail('End round did nothing'));
await browser.close();
console.log(process.exitCode ? 'ROAM/MAP SMOKE FAILED' : 'ROAM/MAP SMOKE OK');
