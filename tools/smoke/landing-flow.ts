/**
 * The first-time flow against production builds (as on Render): the landing
 * page's "Start a party" makes a party link; a second browser opens the
 * invite link; both join without typing anything and see each other; the
 * host starts a round from the totem; the party returns to the lobby.
 *
 *   npm run build -w server && NODE_ENV=production PORT=2569 CLIENT_ORIGIN=http://localhost:4173 npm run start -w server
 *   (in client/) VITE_SERVER_URL=http://localhost:2569 npx vite build --outDir /tmp/prod-dist && npx vite preview --outDir /tmp/prod-dist --port 4173
 *   SMOKE_BASE=http://localhost:4173 npx tsx tools/smoke/landing-flow.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from 'playwright';

const base = process.env.SMOKE_BASE ?? 'http://localhost:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const fail = (m: string) => { console.error('FAIL:', m); process.exitCode = 1; };
const G = 'window.__museum.game';

const host = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
host.on('pageerror', (e) => console.error('[host]', e.message));
await host.goto(base);
await host.screenshot({ path: 'docs/screens/_flow-landing.png' });
await host.click('#start');
await host.waitForURL(/\/party\/[a-z]+-[a-z]+-\d+/, { timeout: 90000 }).catch(() => fail('Start a party did not make a party link'));
const link = host.url();
console.log('party link:', link);
await host.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await host.screenshot({ path: 'docs/screens/_flow-ready.png' });
await host.click('button.play');
await host.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 60000 }).catch(() => fail('host could not connect'));

const guest = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
guest.on('pageerror', (e) => console.error('[guest]', e.message));
await guest.goto(link);
await guest.waitForFunction(() => (window as any).__museum?.ready, undefined, { timeout: 180000 });
await guest.click('button.play');
await guest.waitForFunction(`${G}.net?.status === 'connected'`, undefined, { timeout: 60000 }).catch(() => fail('guest could not join from the invite link'));
await host.waitForFunction(`${G}.net.state.players.size === 2 && ${G}.avatars.count === 1`, undefined, { timeout: 20000 }).catch(() => fail('host does not see the guest'));
await guest.waitForFunction(`${G}.avatars.count === 1`, undefined, { timeout: 20000 }).catch(() => fail('guest does not see the host'));
const roles = await guest.evaluate(`[${G}.net.isHost(), ${G}.net.state.hostId !== ${G}.net.playerId]`);
console.log('guest is host?', JSON.stringify(roles));
// The guest's totem is locked; the host's works.
const guestStart = await guest.evaluate(`${G}.totem.panel.buttons.find((b) => b.id === 'start')?.enabled`);
if (guestStart) fail('a guest can press Start');
await host.evaluate(`${G}.net.send('selectMode', { mode: 'tour' })`);
await host.waitForFunction(`${G}.net.state.mode === 'tour'`, undefined, { timeout: 10000 });
await host.evaluate(`${G}.totem.panel.buttons.find((b) => b.id === 'start').onClick()`);
await guest.waitForFunction(`${G}.net.state.phase === 'playing'`, undefined, { timeout: 30000 }).catch(() => fail('round did not start for the guest'));
await host.evaluate(`${G}.menu.show()`);
await host.waitForTimeout(500);
await host.evaluate(`${G}.menu.panel.buttons.find((b) => b.id === 'endRound').onClick()`);
await guest.waitForFunction(`${G}.net.state.phase === 'lobby'`, undefined, { timeout: 60000 }).catch(() => fail('party did not return to the lobby'));
if (await guest.evaluate(`${G}.net.state.players.size`) !== 2) fail('party not intact after the round');
await browser.close();
console.log(process.exitCode ? 'LANDING FLOW FAILED' : 'LANDING FLOW OK');
