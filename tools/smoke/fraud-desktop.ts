/**
 * Insurance Fraud on desktop controls in a real browser (brief §18): smash a
 * vase with bare hands, take a mallet (E), smash a bust, raise your Security
 * Level until a guard comes and you are held. Screenshots of the big pieces.
 *
 *   MUSEUM_TUNABLES='{"net":{"maxPoseSpeed":10000},"round":{"countdownSec":1},"insuranceFraud":{"heatLevels":[10,25,40,60,500],"heatDecayPerSec":2,"guards":{"hearHands":500,"hearTool":500,"hearHeavy":500,"chaseSpeed":6,"strikesToChase":4,"memorySec":300}}}' PORT=2568 npx tsx server/src/index.ts
 *   VITE_SERVER_URL=http://localhost:2568 npx vite --port 5174   (in client/)
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/fraud-desktop.ts
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
await page.goto(`${base}/party/fraud-smoke-${Math.floor(Math.random() * 900 + 100)}`);
await page.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await page.click('button.play');
await page.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 30000 });
await page.evaluate(`${G}.net.send('selectMode', { mode: 'insuranceFraud' })`);
await page.waitForFunction(`${G}.net.state.mode === 'insuranceFraud'`, undefined, { timeout: 10000 });
await page.evaluate(`${G}.totem.panel.buttons.find((x) => x.id === 'start').onClick()`);
await page.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 30000 });

const B = (id: string) => page.evaluate(`(() => { const b = ${G}.net.state.breakables.get('${id}'); return { x: b.x, y: b.y, z: b.z, stage: b.stage, hp: b.hp }; })()`) as Promise<any>;
const me = () => page.evaluate(`(() => { const p = ${G}.net.me(); return { score: p.score, wanted: p.wanted, status: p.status, x: p.head.px, z: p.head.pz }; })()`) as Promise<any>;
const hud = () => page.evaluate(`document.getElementById('hud').innerText`) as Promise<string>;
/** Stand `d` m from (x, z) on the given side, looking at a point at height y. */
async function face(x: number, y: number, z: number, d: number, side: [number, number], floor = 0) {
  const px = x + side[0] * d, pz = z + side[1] * d;
  const yaw = Math.atan2(-(x - px), -(z - pz));
  const pitch = Math.atan2(y - (floor + 1.65), d);
  await page.evaluate(`(() => { const g = ${G}; g.player.teleport([${px}, ${floor}, ${pz}], ${yaw}); g.player.pitch = ${pitch}; })()`);
  await page.waitForFunction(`Math.hypot(${G}.net.me().head.px - ${px}, ${G}.net.me().head.pz - ${pz}) < 0.3`, undefined, { timeout: 10000 });
  await page.waitForTimeout(400);
}
const smash = async (id: string, side: [number, number], times: number) => {
  const b = await B(id);
  await face(b.x, b.y, b.z, 1.3, side);
  // Click up to `times` + 3 times (slow software rendering can swallow a click), stopping once it breaks.
  for (let i = 0; i < times + 3; i++) {
    await page.evaluate(`${G}.debugClick()`);
    await page.waitForTimeout(700);
    if ((await B(id)).stage === 2 || (times === 1 && i === 0)) break;
  }
  return B(id);
};

// Note when security catches us, whenever it happens.
await page.evaluate(`(() => { window.__caught = false; ${G}.net.on('announcement', (m) => { if (/Caught!/.test(m.text)) window.__caught = true; }); })()`);

// 0. Guards are on patrol from the start, each with a vision cone on the floor.
await page.waitForFunction(`${G}.net.state.agents.size >= 3`, undefined, { timeout: 10000 }).catch(() => fail('no guards on patrol'));
const g1 = await page.evaluate(`(() => { let g; ${G}.net.state.agents.forEach((a) => { if (!g && Math.abs(a.y) < 1) g = { x: a.x, z: a.z, yaw: a.yaw }; }); return g; })()`) as any;
// Stand 6 m in front of a guard, inside its cone, and look at it.
await page.evaluate(`(() => { const g = ${G}; const fx = -Math.sin(${g1.yaw}), fz = -Math.cos(${g1.yaw}); g.player.teleport([${g1.x} + fx * 6, 0, ${g1.z} + fz * 6], ${g1.yaw} + Math.PI); g.player.pitch = -0.35; })()`);
await page.waitForTimeout(1500);
const cones = await page.evaluate(`${G}.mode.update && window.__museum.game.scene.getObjectByName('visionCones').children[0].geometry.attributes.position.count / 42`) as number;
console.log('vision cones drawn:', cones, '· seen:', await page.evaluate(`${G}.net.me().seen`));
if (cones < 3) fail('vision cones missing');
await page.screenshot({ path: 'docs/screens/_smoke-fraud-cones.png' });

// 1. The Great Hall: a vase and a bust with their price tags.
const bust = await B('ghBustN');
await face(bust.x, bust.y, bust.z, 3, [0.8, 0.6]);
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/screens/_smoke-fraud-tags.png' });

// 2. Bare hands: a vase breaks; a bust doesn't.
const vase = await smash('ghVaseN', [1, 0], 1);
if (vase.stage !== 2) fail(`vase not smashed (stage ${vase.stage})`);
if ((await me()).score !== 4) fail(`score after vase ${(await me()).score}`);
const tough = await smash('ghBustN', [0, 1], 1);
if (tough.stage !== 0) fail('bare hands damaged a bust');

// 3. Take the mallet (E) and smash the bust.
const mallet = await page.evaluate(`(() => { const o = ${G}.net.state.objects.get('toolMalletA'); return { x: o.x, y: o.y, z: o.z }; })()`) as any;
await face(mallet.x, mallet.y, mallet.z, 1.0, [1, 0]);
await page.keyboard.press('KeyE');
await page.waitForFunction(`${G}.net.state.objects.get('toolMalletA').status === 'carried'`, undefined, { timeout: 5000 }).catch(() => fail('could not take the mallet'));
const broke = await smash('ghBustN', [0, 1], 3);
if (broke.stage !== 2) fail(`bust not smashed with the mallet (hp ${broke.hp})`);
console.log('after bust:', JSON.stringify(await me()), JSON.stringify(await hud()));
await page.screenshot({ path: 'docs/screens/_smoke-fraud-mallet.png' });

// 4. More smashing. Those strikes are heard: enough of them and a guard gives chase. Watch it come, then get caught and locked in the cells.
await smash('ghBustS', [0, -1], 3);
await smash('ghUrnS', [-1, 0], 2);
// Keep at it until a guard gives chase (strikes are only noticed when a guard is close enough to hear).
for (const id of ['ghVaseS', 'ghUrnN', 'grAmphoraN']) {
  if (await page.evaluate(`[...${G}.net.state.agents.values()].some((a) => a.mood === 6) || window.__caught`)) break;
  await smash(id, [1, 0], 2);
}
await page.waitForFunction(`[...${G}.net.state.agents.values()].some((a) => a.mood === 6) || window.__caught`, undefined, { timeout: 15000 }).catch(() => fail('no guard gave chase'));
const chaser = await page.evaluate(`(() => { let g; ${G}.net.state.agents.forEach((a) => { if (a.mood === 6) g = { x: a.x, z: a.z }; }); return g; })()`) as any;
if (chaser) {
  const m = await me();
  await page.evaluate(`(() => { const g = ${G}; g.player.yaw = ${Math.atan2(-(chaser.x - m.x), -(chaser.z - m.z))}; g.player.pitch = -0.1; })()`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screens/_smoke-fraud-guard.png' });
}
await page.waitForFunction('window.__caught', undefined, { timeout: 30000 }).catch(() => fail('the guard never caught us'));
await page.waitForTimeout(1500);
console.log('held:', JSON.stringify(await hud()), '· cell door open?', await page.evaluate(`${G}.net.state.doors.get('jailDoor').open`));
await page.evaluate(`(() => { ${G}.player.yaw = -Math.PI / 2; ${G}.player.pitch = -0.1; })()`);
await page.waitForTimeout(800);
await page.screenshot({ path: 'docs/screens/_smoke-fraud-held.png' });

// 5. The big pieces, for the record (spectator camera so nothing moves us).
await page.waitForFunction(`${G}.net.me().status === 'active'`, undefined, { timeout: 20000 });
const shots: [string, string, [number, number], number, number][] = [
  ['mammoth', '_smoke-fraud-mammoth', [0.7, -0.7], 9, 0],
  ['giantCanvas', '_smoke-fraud-canvas', [1, 0.15], 9, 0],
  ['lionGate', '_smoke-fraud-gate', [0, -1], 11, 0],
  ['grStatueW', '_smoke-fraud-statue', [1, 0.3], 3.5, 0],
  ['pEMaster', '_smoke-fraud-masterpiece', [0.3, 1], 4, 8],
];
for (const [id, file, side, d, floor] of shots) {
  const b = await B(id);
  await face(b.x, b.y, b.z, d, side, floor);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `docs/screens/${file}.png` });
}
const perf = await page.evaluate(`${G}.renderer.info.render`) as any;
console.log('draws', perf.calls, 'tris', perf.triangles);
await browser.close();
console.log(process.exitCode ? 'FRAUD SMOKE FAILED' : 'FRAUD SMOKE OK');
