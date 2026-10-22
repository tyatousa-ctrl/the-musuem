/**
 * Hide and Seek and Fix the Exhibit on desktop controls in a real browser.
 * Two browsers join one party. Fix the Exhibit: memorise (corner countdown),
 * eyes close, the room is jumbled; one player carries a piece back with E
 * and it clicks into place; the other player is invisible. Hide and Seek:
 * the seeker counts blind, the hider calls out, a click tags them.
 *
 *   MUSEUM_TUNABLES='{"net":{"maxPoseSpeed":10000},"round":{"countdownSec":1},"hideSeek":{"hideSec":6,"pingEverySec":12}}' PORT=2568 npx tsx server/src/index.ts
 *   VITE_SERVER_URL=http://localhost:2568 npx vite --port 5174   (in client/)
 *   SMOKE_BASE=http://localhost:5174 npx tsx tools/smoke/party-games-desktop.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium, type Page } from 'playwright';
import { museum } from '@museum/shared';

const base = process.env.SMOKE_BASE ?? 'http://localhost:5174';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const fail = (m: string) => { console.error('FAIL:', m); process.exitCode = 1; };
const G = 'window.__museum.game';
const slug = `games-smoke-${Math.floor(Math.random() * 900 + 100)}`;

async function open(w: number, h: number): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(`${base}/party/${slug}`);
  await page.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
  await page.click('button.play');
  await page.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 30000 });
  return page;
}
const host = await open(1280, 720);
const guest = await open(480, 270);
const me = (p: Page) => p.evaluate(`(() => { const m = ${G}.net.me(); return { id: ${G}.net.playerId, team: m.team, status: m.status, score: m.score }; })()`) as Promise<any>;
const tp = (p: Page, x: number, z: number, yaw: number, pitch = 0) => p.evaluate(`(() => { const g = ${G}; g.player.teleport([${x}, 0, ${z}], ${yaw}); g.player.pitch = ${pitch}; })()`);
const synced = (p: Page, x: number, z: number) => p.waitForFunction(`Math.hypot(${G}.net.me().head.px - ${x}, ${G}.net.me().head.pz - ${z}) < 0.4`, undefined, { timeout: 10000 });
const start = async (mode: string) => {
  await host.evaluate(`${G}.net.send('selectMode', { mode: '${mode}' })`);
  await host.waitForFunction(`${G}.net.state.mode === '${mode}'`, undefined, { timeout: 10000 });
  await host.screenshot({ path: `docs/screens/_smoke-totem-${mode}.png` });
  await host.evaluate(`${G}.totem.panel.buttons.find((x) => x.id === 'start').onClick()`);
  await host.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 30000 });
};
const lobby = () => host.waitForFunction(`${G}.net.state.phase === 'lobby'`, undefined, { timeout: 60000 });

// ONLY=hide skips Fix the Exhibit.
if (process.env.ONLY !== 'hide') {
// ─── Fix the Exhibit ────────────────────────────────────────────────────────
// The host's view of the totem first.
await tp(host, 34, 0, Math.PI / 2, 0.05);
await start('fixExhibit');
await host.waitForFunction(`${G}.net.state.modePhase === 'memorize'`, undefined, { timeout: 10000 });
await tp(host, -25.5, 0, Math.PI / 2, -0.12);
await host.waitForTimeout(2500);
const corner = await host.evaluate(`[...document.querySelectorAll('div')].map((d) => d.innerText).find((t) => /Memorise/.test(t)) ?? ''`) as string;
console.log('corner during memorise:', JSON.stringify(corner));
if (!/Memorise/.test(corner)) fail('no corner countdown');
const guestVisible = await host.evaluate(`${G}.avatars.hideAll`) as boolean;
if (!guestVisible) fail('other players are not hidden');
await host.screenshot({ path: 'docs/screens/_smoke-exhibit-memorise.png' });
await host.waitForFunction(`${G}.net.state.modePhase === 'blind'`, undefined, { timeout: 15000 });
await host.waitForTimeout(500);
await host.screenshot({ path: 'docs/screens/_smoke-exhibit-blind.png' });
await host.waitForFunction(`${G}.net.state.modePhase === 'solve'`, undefined, { timeout: 10000 });
await host.waitForTimeout(1500);
await host.screenshot({ path: 'docs/screens/_smoke-exhibit-jumbled.png' });

// Carry the bust back: find it, grab with E, walk to its spot, drop with E.
const hostId = (await me(host)).id;
const slot = museum.slots.find((s) => s.id === 'exBustN')!;
const piece = await host.evaluate(`(() => { const o = ${G}.net.state.objects.get('${hostId}:exBustN'); return { x: o.x, y: o.y, z: o.z }; })()`) as any;
await tp(host, piece.x + 1.0, piece.z, Math.PI / 2, Math.atan2(piece.y - 1.65, 1.0));
await synced(host, piece.x + 1.0, piece.z);
await host.waitForTimeout(500);
await host.keyboard.press('KeyE');
await host.waitForFunction(`${G}.net.state.objects.get('${hostId}:exBustN').status === 'carried'`, undefined, { timeout: 5000 }).catch(() => fail('could not pick up the bust'));
// Desktop drops at the hand, about 0.45 m ahead: stand that far east of the spot, facing west.
const hand = await host.evaluate(`(() => { const g = ${G}; const h = g.player.hands.right.pos, f = g.player.feet; return [h.x - f.x, h.z - f.z]; })()`) as number[];
const off = Math.hypot(hand[0], hand[1]);
await tp(host, slot.pos[0] + off, slot.pos[2], Math.PI / 2, 0);
await synced(host, slot.pos[0] + off, slot.pos[2]);
await host.waitForTimeout(600);
await host.keyboard.press('KeyE');
await host.waitForFunction(`${G}.net.state.objects.get('${hostId}:exBustN').status === 'home'`, undefined, { timeout: 5000 }).catch(() => fail('the bust did not click into place'));
await host.waitForTimeout(200);
await host.screenshot({ path: 'docs/screens/_smoke-exhibit-snap.png' });
// The guest never sees the host's pieces.
const guestSees = await guest.evaluate(`${G}.objects.position('${hostId}:exBustN', new (${G}.camera.position.constructor)()) !== null`);
if (guestSees) fail("the guest can see the host's piece");
await host.waitForFunction(`${G}.net.state.phase === 'roundEnd'`, undefined, { timeout: 200000 });
console.log('exhibit result:', await host.evaluate(`${G}.net.state.result`));
await host.screenshot({ path: 'docs/screens/_smoke-exhibit-result.png' });
await lobby();
}

// ─── Hide and Seek ──────────────────────────────────────────────────────────
await start('hideSeek');
const [hm, gm] = [await me(host), await me(guest)];
const seeker = hm.team === 'B' ? host : guest, hider = hm.team === 'B' ? guest : host;
const hiderId = hm.team === 'B' ? gm.id : hm.id;
console.log('seeker is', hm.team === 'B' ? 'host' : 'guest');
if ((await me(seeker)).status !== 'blind') fail('the seeker is not blindfolded');
await seeker.screenshot({ path: 'docs/screens/_smoke-hide-counting.png' });
// The hider tucks in behind the T. rex plinth.
await tp(hider, -12.5, -36.5, 0);
await synced(hider, -12.5, -36.5);
await seeker.waitForFunction(`${G}.net.state.modePhase === 'seek'`, undefined, { timeout: 20000 });
await seeker.evaluate(`(() => { window.__pings = 0; ${G}.net.on('hidePing', () => window.__pings++); })()`);
await tp(seeker, -12.5, -24, 0, -0.1);
await seeker.waitForTimeout(1500);
await seeker.screenshot({ path: 'docs/screens/_smoke-hide-seeking.png' });
await seeker.waitForFunction('window.__pings > 0', undefined, { timeout: 30000 }).catch(() => fail('no call from the hider'));
// Walk up and click to tag.
await tp(seeker, -12.5, -35.3, 0, -0.1); // facing north, at the hider
await synced(seeker, -12.5, -35.3);
await seeker.waitForTimeout(500);
await seeker.evaluate(`${G}.debugClick()`);
await host.waitForFunction(`${G}.net.state.players.get('${hiderId}').team === 'B'`, undefined, { timeout: 5000 }).catch(() => fail('click did not tag the hider'));
await host.waitForFunction(`${G}.net.state.phase === 'roundEnd'`, undefined, { timeout: 10000 }).catch(() => fail('round did not end'));
console.log('hide result:', await host.evaluate(`${G}.net.state.result`));
await browser.close();
console.log(process.exitCode ? 'PARTY GAMES SMOKE FAILED' : 'PARTY GAMES SMOKE OK');
