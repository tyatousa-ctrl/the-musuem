/**
 * Crowd Control on desktop controls in a real browser (brief §17): tourists
 * arrive and walk the circuit, a click taps a wrong-way tourist and turns them
 * around, and stanchions placed with E link up into a velvet rope.
 *
 *   MUSEUM_TUNABLES='{"net":{"maxPoseSpeed":10000},"round":{"countdownSec":1},"crowdControl":{"spawnIntervalSec":0.8,"wrongAtStartChance":[0.6,0.6,0.6,0.6,0.6]}}' PORT=2568 npx tsx server/src/index.ts
 *   VITE_SERVER_URL=http://localhost:2568 npx vite --port 5174   (in client/)
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/crowd-desktop.ts
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
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${base}/party/crowd-smoke-${Math.floor(Math.random() * 900 + 100)}`);
await page.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await page.click('button.play');
await page.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 30000 });
await page.evaluate(`(() => { window.__crowd = []; ${G}.net.on('crowd', (m) => window.__crowd.push(m)); })()`);
await page.evaluate(`${G}.net.send('selectMode', { mode: 'crowdControl' })`);
await page.waitForFunction(`${G}.net.state.mode === 'crowdControl'`, undefined, { timeout: 10000 });
await page.evaluate(`${G}.totem.panel.buttons.find((x) => x.id === 'start').onClick()`);
await page.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 30000 });
const tp = (x: number, z: number, yaw: number, pitch = 0) => page.evaluate(`(() => { const g = ${G}; g.player.teleport([${x}, 0, ${z}], ${yaw}); g.player.pitch = ${pitch}; })()`);
const hud = () => page.evaluate(`document.getElementById('hud').innerText`) as Promise<string>;
const agents = () => page.evaluate(`(() => { const out = []; ${G}.net.state.agents.forEach((a, id) => out.push({ id, x: a.x, z: a.z, yaw: a.yaw, mood: a.mood, kind: a.kind })); return out; })()`) as Promise<any[]>;

// 1. Arrivals: watch the entrance from inside the Great Hall.
await tp(27, -10, -2.2, -0.05);
await page.waitForFunction(`${G}.net.state.agents.size >= 7`, undefined, { timeout: 60000 }).catch(() => fail('tourists did not arrive'));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'docs/screens/_smoke-crowd-arrivals.png' });
console.log('HUD:', JSON.stringify(await hud()));

// 2. Tap a wrong-way tourist: stand in their path, face them, click.
let turned = false;
for (let attempt = 0; attempt < 12 && !turned; attempt++) {
  const wrong = (await agents()).find((a) => a.mood === 1);
  if (!wrong) { await page.waitForTimeout(1500); continue; }
  // 1.2 m in front of them (they face along yaw), looking back at them.
  const fx = -Math.sin(wrong.yaw), fz = -Math.cos(wrong.yaw);
  await tp(wrong.x + fx * 1.2, wrong.z + fz * 1.2, wrong.yaw + Math.PI, -0.12);
  await page.waitForTimeout(150);
  await page.evaluate(`${G}.debugClick()`);
  await page.waitForTimeout(400);
  turned = await page.evaluate(`window.__crowd.some((m) => m.type === 'touched' && (m.effect === 'turned' || m.effect === 'ignored'))`) as boolean;
}
if (!turned) fail('could not turn a wrong-way tourist around');
console.log('touch events:', JSON.stringify(await page.evaluate(`window.__crowd.filter((m) => m.type === 'touched').map((m) => m.effect)`)));
await page.waitForTimeout(250);
await page.screenshot({ path: 'docs/screens/_smoke-crowd-touch.png' });

// 3. Stanchions: pick two up with E and stand them 2 m apart; a rope appears.
const posts = await page.evaluate(`(() => { const out = []; ${G}.net.state.objects.forEach((o, id) => { if (o.kind === 'stanchion') out.push({ id, x: o.x, z: o.z }); }); return out; })()`) as any[];
for (const [i, p] of posts.slice(0, 2).entries()) {
  await tp(p.x + 1.0, p.z, -Math.PI / 2 + Math.PI, -0.5); // east of it, facing west
  await page.waitForFunction(`Math.abs(${G}.net.me().head.pz - (${p.z})) < 0.3 && Math.abs(${G}.net.me().head.px - (${p.x + 1})) < 0.3`, undefined, { timeout: 10000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(`${G}.net.state.objects.get('${p.id}').status === 'carried'`, undefined, { timeout: 5000 }).catch(() => fail(`could not pick up ${p.id}`));
  await tp(24, -16 + i * 2.2, Math.PI / 2, 0);
  // Software rendering is slow: wait until the server has our new position before letting go.
  await page.waitForFunction(`Math.abs(${G}.net.me().head.pz - (${-16 + i * 2.2})) < 0.5`, undefined, { timeout: 10000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(`${G}.net.state.objects.get('${p.id}').status === 'rest'`, undefined, { timeout: 5000 }).catch(() => fail(`could not place ${p.id}`));
}
await tp(19.5, -11, Math.atan2(-(23.6 - 19.5), -(-15 + 11)), -0.35); // looking at the new rope
await page.waitForTimeout(1500);
console.log('stanchions:', JSON.stringify(await page.evaluate(`(() => { const out = []; ${G}.net.state.objects.forEach((o, id) => { if (o.kind === 'stanchion') out.push([id, o.x.toFixed(1), o.y.toFixed(2), o.z.toFixed(1), o.status]); }); return out; })()`)));
const ropes = await page.evaluate(`${G}.scene.getObjectByName('ropes').children.filter((m) => m.visible).length`) as number;
console.log('rope pieces visible:', ropes);
if (ropes < 2) fail('no rope between the stanchions');
await page.screenshot({ path: 'docs/screens/_smoke-crowd-rope.png' });

// 4. The crowd flowing through Arms and Armor, and a closed area.
await tp(9, -40, Math.PI - 0.45, -0.05);
await page.waitForTimeout(6000);
await page.screenshot({ path: 'docs/screens/_smoke-crowd-arms.png' });
await tp(-12, -48, 0, -0.1);
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/screens/_smoke-crowd-closed.png' });
console.log('HUD:', JSON.stringify(await hud()));
const perf = await page.evaluate(`${G}.renderer.info.render`) as any;
console.log('draws', perf.calls, 'tris', perf.triangles);
await browser.close();
console.log(process.exitCode ? 'CROWD SMOKE FAILED' : 'CROWD SMOKE OK');
