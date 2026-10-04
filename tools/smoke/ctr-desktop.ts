/**
 * Capture the Relic on desktop controls, in real browsers (brief §22, §11.4).
 * Exercises the client interaction code: punch the enemy case twice, grab the
 * relic with E, carry it home, score. To keep it fast under software WebGL the
 * attacker is moved with the client's own teleport, so it needs a test server
 * that accepts big pose jumps:
 *
 *   MUSEUM_TUNABLES='{"net":{"maxPoseSpeed":10000},"round":{"countdownSec":1}}' PORT=2568 npx tsx server/src/index.ts
 *   VITE_SERVER_URL=http://localhost:2568 npx vite --port 5174   (in client/)
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/ctr-desktop.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium, type Page } from 'playwright';

const base = process.env.SMOKE_BASE ?? 'http://localhost:5174';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const fail = (m: string) => { console.error('FAIL:', m); process.exitCode = 1; };
const ready = (p: Page) => p.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
const G = 'window.__museum.game';
const state = (p: Page) => p.evaluate(`(() => { const s = ${G}.net.state; return { phase: s.phase, scoreA: s.scoreA, scoreB: s.scoreB, caseA: s.breakables.get('caseA')?.stage, caseB: s.breakables.get('caseB')?.stage, relicA: s.objects.get('relicA')?.status, relicB: s.objects.get('relicB')?.status, result: s.result }; })()`) as Promise<any>;

const slug = `ctr-smoke-${Math.floor(Math.random() * 900 + 100)}`;
const pages: Page[] = [];
for (const name of ['host', 'guest']) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error(`[${name}]`, e.message));
  await p.goto(`${base}/party/${slug}`);
  await ready(p);
  await p.click('button.play');
  pages.push(p);
}
const [host] = pages;
await host.waitForFunction(`${G}.debugInfo().avatars === 1`, undefined, { timeout: 30000 });
await host.evaluate(`${G}.net.send('setSetting', { key: 'ctrScoreLimit', value: 1 })`);
await host.evaluate(`${G}.totem.panel.buttons.find((x) => x.id === 'start').onClick()`);
await host.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 30000 });

// Whoever is on team A attacks B's case in the South Court.
const teams = await Promise.all(pages.map((p) => p.evaluate(`${G}.net.me().team`)));
const atk = pages[teams.indexOf('A')];
console.log('teams', teams);
const go = (x: number, y: number, z: number, yaw: number, pitch: number) => atk.evaluate(`(() => { const g = ${G}; g.player.teleport([${x}, ${y}, ${z}], ${yaw}); g.player.pitch = ${pitch}; })()`);

// Stand 1.2 m north of case B, facing south (yaw π), looking slightly down.
await go(-17, 0, 50.2, Math.PI, -0.2);
await atk.waitForTimeout(1500);
for (let i = 1; i <= 2; i++) {
  await atk.evaluate(`${G}.debugClick()`);
  await host.waitForFunction(`${G}.net.state.breakables.get('caseB')?.stage === ${i}`, undefined, { timeout: 8000 }).catch(() => fail(`punch ${i} did not register`));
  await atk.waitForTimeout(600);
}
console.log('after punches', await state(host));

// Grab the relic with E.
await go(-17, 0, 50.9, Math.PI, -0.35);
await atk.waitForTimeout(1200);
await atk.keyboard.press('KeyE');
await atk.waitForTimeout(500);
await host.waitForFunction(`${G}.net.state.objects.get('relicB')?.status === 'carried'`, undefined, { timeout: 8000 }).catch(() => fail('grab did not register'));
console.log('after grab', await state(host));

// Carry it home into the North Court capture ring.
await go(-17, 0, 30, 0, 0);
await atk.waitForTimeout(800);
await go(-17, 0, -40, 0, 0);
await atk.waitForTimeout(800);
await go(-16.5, 0, -50, 0, 0);
await host.waitForFunction(`${G}.net.state.scoreA === 1`, undefined, { timeout: 10000 }).catch(() => fail('capture did not score'));
await host.waitForFunction(`${G}.net.state.phase === 'roundEnd'`, undefined, { timeout: 10000 }).catch(() => fail('round did not end'));
console.log('end', await state(host));
await atk.screenshot({ path: 'docs/screens/_smoke-ctr-attacker.png' });
await host.waitForFunction(`${G}.net.state.phase === 'lobby'`, undefined, { timeout: 30000 }).catch(() => fail('did not return to lobby'));
console.log('back in lobby with', await host.evaluate(`${G}.net.state.players.size`), 'players');
await browser.close();
console.log(process.exitCode ? 'CTR SMOKE FAILED' : 'CTR SMOKE OK');
