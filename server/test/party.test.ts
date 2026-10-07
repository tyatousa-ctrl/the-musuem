/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Headless bot clients against a real server (brief §22): party by slug,
 * party full, host migration, rejoin into the same seat, join-in-progress,
 * and a scripted Capture the Relic match played to the win.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { museum, type PoseArray } from '@museum/shared';

// Positions come from the map data so the tests follow layout changes.
const slot = (id: string) => museum.slots.find((x) => x.id === id)!.pos;
const [CX, , ZB] = slot('caseB');
const ZA = slot('caseA')[2];
const CASE_B: [number, number, number] = [CX, 1.45, ZB];
const RELIC_B: [number, number, number] = [CX, 1.28, ZB];
const towardCentre = (z: number, d: number) => z - Math.sign(z) * d;
const DESK = museum.zones.find((z) => z.kind === 'desk')!.center;
const SPAWN_B = museum.spawns.teamB[0].pos;

process.env.MUSEUM_TUNABLES = JSON.stringify({
  round: { countdownSec: 0.2, resultsSec: 0.3 },
  net: { maxPoseSpeed: 10000, reconnectWindowSec: 5 },
  // Crowd Control: quick arrivals, and everyone starts out going the wrong way.
  crowdControl: { spawnIntervalSec: 0.3, wrongAtStartChance: [1, 1, 1, 1, 1] },
  // Insurance Fraud: guards come after the first bit of damage.
  insuranceFraud: { heatLevels: [1, 2, 3, 4, 500] },
});

const PORT = 25670 + Math.floor(Math.random() * 300);
let server: { gracefullyShutdown(exit?: boolean): Promise<void> };

beforeAll(async () => {
  const { createServer } = await import('../src/app.js');
  const s = createServer();
  await s.listen(PORT);
  server = s;
});
afterAll(async () => { await server?.gracefullyShutdown(false); });

const client = () => new Client(`http://localhost:${PORT}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn: () => boolean, ms = 4000, what = 'condition') {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

function join(slug: string, playerId: string, name = playerId): Promise<Room> {
  return client().joinOrCreate('party', { slug, playerId, name, isVR: false });
}

/** Head at (x, y+1.6, z); both hands at `hand` (default: in front of the head). */
function pose(room: Room, x: number, y: number, z: number, hand?: [number, number, number]) {
  const h = hand ?? [x, y + 1.2, z - 0.4];
  const p: PoseArray = [x, y + 1.6, z, 0, 0, 0, 1, h[0], h[1], h[2], 0, 0, 0, 1, h[0], h[1], h[2], 0, 0, 0, 1];
  room.send('pose', { p, feetY: y, menuOpen: false });
}

const st = (room: Room) => room.state as any;

describe('parties', () => {
  it('two players join the same party from the same slug', async () => {
    const a = await join('jade-sphinx-101', 'pa');
    const b = await join('jade-sphinx-101', 'pb');
    expect(a.roomId).toBe(b.roomId);
    await waitFor(() => st(a).players.size === 2, 2000, 'two players');
    expect(st(a).hostId).toBe('pa');
    const c = await join('other-party-102', 'pc');
    expect(c.roomId).not.toBe(a.roomId);
    await Promise.all([a.leave(), b.leave(), c.leave()]);
  });

  it('a fifth visitor gets party_full and no twin room is created', async () => {
    const rooms = await Promise.all(['f1', 'f2', 'f3', 'f4'].map((id) => join('full-party-103', id)));
    await expect(join('full-party-103', 'f5')).rejects.toThrow(/party_full/);
    await Promise.all(rooms.map((r) => r.leave()));
  });

  it('host leaving promotes the longest-present player', async () => {
    const a = await join('host-party-104', 'h1');
    await sleep(20);
    const b = await join('host-party-104', 'h2');
    await sleep(20);
    const c = await join('host-party-104', 'h3');
    await a.leave();
    await waitFor(() => st(b).hostId === 'h2', 2000, 'host migration');
    await Promise.all([b.leave(), c.leave()]);
  });

  it('only the host can change mode or start a round', async () => {
    const a = await join('auth-party-105', 'x1');
    const b = await join('auth-party-105', 'x2');
    b.send('selectMode', { mode: 'tour' });
    b.send('startRound', {});
    await sleep(200);
    expect(st(a).mode).toBe('ctr');
    expect(st(a).phase).toBe('lobby');
    await Promise.all([a.leave(), b.leave()]);
  });

  it('rejoining with the same playerId after a drop restores the seat', async () => {
    const a = await join('seat-party-106', 's1');
    const b = await join('seat-party-106', 's2');
    a.send('startRound', {});
    await waitFor(() => st(a).phase === 'playing', 3000, 'playing');
    const teamBefore = st(a).players.get('s2').team;
    // Simulate an unexpected disconnect (not consented), then reopen the link.
    b.connection.close(4999 as never);
    await waitFor(() => st(a).players.get('s2')?.status === 'reconnecting', 3000, 'reconnecting');
    const b2 = await join('seat-party-106', 's2');
    await waitFor(() => st(a).players.get('s2')?.status === 'active', 3000, 'active again');
    expect(st(a).players.size).toBe(2);
    expect(st(a).players.get('s2').team).toBe(teamBefore);
    await Promise.all([a.leave(), b2.leave()]);
  });
});

describe('Capture the Relic, scripted', () => {
  it('a mid-round joiner lands on the smaller team at its base', async () => {
    const a = await join('jip-party-107', 'j1');
    a.send('startRound', {});
    await waitFor(() => st(a).phase === 'playing', 3000, 'playing');
    const soloTeam = st(a).players.get('j1').team;
    const b = await join('jip-party-107', 'j2');
    await waitFor(() => st(a).players.get('j2')?.team !== '' && st(a).players.get('j2') !== undefined, 2000, 'team');
    expect(st(a).players.get('j2').team).not.toBe(soloTeam);
    await Promise.all([a.leave(), b.leave()]);
  });

  it('plays a full match: smash, steal, carry home, score to the limit', async () => {
    const a = await join('match-party-108', 'm1');
    const b = await join('match-party-108', 'm2');
    a.send('setSetting', { key: 'ctrScoreLimit', value: 2 });
    a.send('startRound', {});
    await waitFor(() => st(a).phase === 'playing', 3000, 'playing');

    const players = st(a).players;
    const attackerRoom = players.get('m1').team === 'A' ? a : b;
    const defenderRoom = attackerRoom === a ? b : a;
    // Keep the defender parked at their own base, far from the action.
    pose(defenderRoom, SPAWN_B[0], 0, SPAWN_B[2]);
    const announcements: string[] = [];
    attackerRoom.onMessage('announcement', (m: { text: string }) => announcements.push(m.text));

    for (let round = 1; round <= 2; round++) {
      // Walk up to B's case and punch it twice.
      pose(attackerRoom, CX, 0, towardCentre(ZB, 1.2), CASE_B);
      await sleep(80);
      attackerRoom.send('hitBreakable', { id: 'caseB', hand: 'right', speed: 4 });
      await waitFor(() => st(a).breakables.get('caseB')?.stage === 1, 2000, 'cracked');
      await sleep(350);
      attackerRoom.send('hitBreakable', { id: 'caseB', hand: 'right', speed: 4 });
      await waitFor(() => st(a).breakables.get('caseB')?.stage === 2, 2000, 'shattered');

      // Grab the relic and carry it home.
      pose(attackerRoom, CX, 0, towardCentre(ZB, 1), RELIC_B);
      await sleep(80);
      attackerRoom.send('grab', { objectId: 'relicB', hand: 'right' });
      await waitFor(() => st(a).objects.get('relicB')?.status === 'carried', 2000, 'carried');
      pose(attackerRoom, CX, 0, 0);
      await sleep(80);
      pose(attackerRoom, CX, 0, towardCentre(ZA, 0.5));
      await waitFor(() => st(a).scoreA === round, 2000, `score ${round}`);
      // The case reseals and the relic is home again.
      expect(st(a).objects.get('relicB').status).toBe('home');
      expect(st(a).breakables.get('caseB').stage).toBe(0);
    }

    await waitFor(() => st(a).phase === 'roundEnd', 2000, 'round end');
    expect(st(a).result).toMatch(/Falcons win 2–0/);
    expect(announcements.some((t) => t.includes('Bring it home'))).toBe(true);
    // Results, then everyone is back in the lobby as a party.
    await waitFor(() => st(a).phase === 'lobby', 3000, 'back to lobby');
    expect(st(a).players.size).toBe(2);
    expect(st(a).objects.get('relicB')).toBeUndefined();
    await Promise.all([a.leave(), b.leave()]);
  });

  it('a KO drops the carried relic where the carrier stood', async () => {
    const a = await join('ko-party-109', 'k1');
    const b = await join('ko-party-109', 'k2');
    a.send('startRound', {});
    await waitFor(() => st(a).phase === 'playing', 3000, 'playing');
    const atk = st(a).players.get('k1').team === 'A' ? a : b;
    const def = atk === a ? b : a;
    pose(atk, CX, 0, towardCentre(ZB, 1.2), CASE_B);
    await sleep(80);
    atk.send('hitBreakable', { id: 'caseB', hand: 'right', speed: 4 });
    await sleep(350);
    atk.send('hitBreakable', { id: 'caseB', hand: 'right', speed: 4 });
    await waitFor(() => st(a).breakables.get('caseB')?.stage === 2, 2000, 'shattered');
    pose(atk, CX, 0, towardCentre(ZB, 1), RELIC_B);
    await sleep(80);
    atk.send('grab', { objectId: 'relicB', hand: 'right' });
    await waitFor(() => st(a).objects.get('relicB')?.status === 'carried', 2000, 'carried');

    // Carrier runs into the Dinosaur Hall; the defender catches up and shoves five times.
    // 1.5 m apart: inside shove reach, outside the defender's return-touch radius.
    pose(atk, CX, 0, 10);
    pose(def, CX, 0, 11.5);
    await sleep(100);
    const atkId = st(a).players.get('k1').team === 'A' ? 'k1' : 'k2';
    for (let i = 0; i < 6 && st(a).players.get(atkId).status !== 'ko'; i++) {
      def.send('hitPlayer', { targetId: atkId, hand: 'right', speed: 3, dir: [0, 0, -1], kind: 'shove' });
      await sleep(500);
    }
    await waitFor(() => st(a).players.get(atkId).status === 'ko', 2000, 'ko');
    const relic = st(a).objects.get('relicB');
    expect(relic.status).toBe('dropped');
    expect(relic.x).toBeCloseTo(CX, 1);
    expect(relic.z).toBeCloseTo(10, 1);
    await Promise.all([a.leave(), b.leave()]);
  });
});

describe('Artifact Hunt, scripted', () => {
  it('finds an artifact, secures it at the Registrar\'s Desk, and late joiners start at zero', async () => {
    const a = await join('hunt-party-110', 'h1');
    a.send('selectMode', { mode: 'artifactHunt' });
    await waitFor(() => st(a).mode === 'artifactHunt', 2000, 'mode');
    a.send('startRound', {});
    await waitFor(() => st(a).phase === 'playing', 3000, 'playing');

    const arts: { id: string; x: number; y: number; z: number; variant: string }[] = [];
    st(a).objects.forEach((o: any, id: string) => { if (o.kind === 'artifact') arts.push({ id, x: o.x, y: o.y, z: o.z, variant: o.variant }); });
    expect(arts).toHaveLength(12);
    expect(arts.filter((x) => x.variant === 'legendary')).toHaveLength(3);

    // Walk to the first artifact, pick it up, carry it to the desk.
    const t = arts[0];
    pose(a, t.x, t.y - 0.15, t.z + 0.3, [t.x, t.y, t.z]);
    await sleep(80);
    a.send('grab', { objectId: t.id, hand: 'right' });
    await waitFor(() => st(a).objects.get(t.id)?.status === 'carried', 2000, 'carried');
    pose(a, DESK[0] + 3.5, 0, 1); // beside the desk, inside the 4.5 m delivery ring
    await waitFor(() => st(a).objects.get(t.id) === undefined, 2000, 'secured');
    const value = { common: 1, rare: 3, legendary: 5 }[t.variant as 'common'];
    expect(st(a).players.get('h1').score).toBe(value);

    // A late joiner joins immediately (not spectating) with no retroactive credit.
    const b = await join('hunt-party-110', 'h2');
    await waitFor(() => st(a).players.get('h2') !== undefined, 2000, 'joined');
    expect(st(a).players.get('h2').status).toBe('active');
    expect(st(a).players.get('h2').score).toBe(0);

    a.send('endRound', {});
    await waitFor(() => st(a).phase === 'lobby', 4000, 'lobby');
    let left = 0;
    st(a).objects.forEach((o: any) => { if (o.kind === 'artifact') left++; });
    expect(left).toBe(0);
    await Promise.all([a.leave(), b.leave()]);
  });
});

describe('Crowd Control, scripted', () => {
  it('tourists arrive, a touch turns a wrong-way tourist around, stanchions are grabbable, late joiners play', async () => {
    const a = await join('crowd-party-112', 'c1');
    const events: { type: string; effect?: string }[] = [];
    a.onMessage('crowd', (m: { type: string; effect?: string }) => events.push(m));
    a.send('selectMode', { mode: 'crowdControl' });
    await waitFor(() => st(a).mode === 'crowdControl', 2000, 'mode');
    a.send('startRound', {});
    await waitFor(() => st(a).phase === 'playing', 3000, 'playing');
    await waitFor(() => st(a).agents.size >= 2, 5000, 'tourists');
    expect(st(a).ccWave).toBe(1);

    // Everyone starts wrong-way (mood 1). Reach out and touch one until it turns around.
    const touched = async () => {
      for (let i = 0; i < 40; i++) {
        let target: any;
        st(a).agents.forEach((g: any) => { if (!target && g.mood === 1) target = g; });
        if (target) pose(a, target.x + 0.7, 0, target.z, [target.x, 1.1, target.z]);
        await sleep(120);
        if (events.some((e) => e.type === 'touched' && e.effect === 'turned')) return true;
        pose(a, 30, 0, 0); // step back so the next touch is fresh
        await sleep(120);
      }
      return false;
    };
    expect(await touched()).toBe(true);

    // The tools: six stanchions and three signs, grabbable like any other object.
    let stanchion: any;
    let tools = 0;
    st(a).objects.forEach((o: any, id: string) => { if (o.kind === 'stanchion' || o.kind === 'sign') tools++; if (!stanchion && o.kind === 'stanchion') stanchion = { id, ...o.toJSON() }; });
    expect(tools).toBe(9);
    pose(a, stanchion.x + 0.4, 0, stanchion.z, [stanchion.x, stanchion.y, stanchion.z]);
    await sleep(80);
    a.send('grab', { objectId: stanchion.id, hand: 'right' });
    await waitFor(() => st(a).objects.get(stanchion.id)?.status === 'carried', 2000, 'stanchion carried');
    a.send('release', { hand: 'right', pos: [stanchion.x + 0.4, 1.2, stanchion.z + 2], vel: [0, 0, 0] });
    await waitFor(() => st(a).objects.get(stanchion.id)?.status === 'rest', 2000, 'stanchion placed');
    expect(st(a).objects.get(stanchion.id).y).toBeCloseTo(0.95, 2); // stands upright on the floor

    // Join-in-progress: immediately, as another security guard.
    const b = await join('crowd-party-112', 'c2');
    await waitFor(() => st(a).players.get('c2') !== undefined, 2000, 'joined');
    expect(st(a).players.get('c2').status).toBe('active');
    await waitFor(() => st(b).agents?.size > 0, 2000, 'late joiner sees tourists');

    a.send('endRound', {});
    await waitFor(() => st(a).phase === 'lobby', 4000, 'lobby');
    expect(st(a).agents.size).toBe(0);
    let left = 0;
    st(a).objects.forEach((o: any) => { if (o.kind === 'stanchion' || o.kind === 'sign') left++; });
    expect(left).toBe(0);
    await Promise.all([a.leave(), b.leave()]);
  });
});

describe('Insurance Fraud, scripted', () => {
  it('tools gate damage, damage pays its insured value, guards catch you, late joiners spectate', async () => {
    const a = await join('fraud-party-113', 'f1');
    a.send('selectMode', { mode: 'insuranceFraud' });
    await waitFor(() => st(a).mode === 'insuranceFraud', 2000, 'mode');
    a.send('startRound', {});
    await waitFor(() => st(a).phase === 'playing', 3000, 'playing');
    const b = (id: string) => st(a).breakables.get(id);
    expect(b('mammoth').locked).toBe(true);
    const hit = async (id: string) => {
      const t = b(id);
      pose(a, t.x + 0.5, t.y - 1.2, t.z, [t.x, t.y, t.z]);
      await sleep(120);
      a.send('hitBreakable', { id, hand: 'right', speed: 4 });
      await sleep(450);
    };

    // The anchored mammoth and a bronze statue shrug off bare hands.
    await hit('mammoth');
    await hit('grStatueW');
    expect(b('mammoth').hp).toBe(b('mammoth').maxHp);
    expect(b('grStatueW').hp).toBe(b('grStatueW').maxHp);
    expect(st(a).players.get('f1').score).toBe(0);

    // Pick up a mallet and smash a marble bust: three hits, $26,000.
    const mallet = st(a).objects.get('toolMalletA');
    pose(a, mallet.x + 0.4, 0, mallet.z, [mallet.x, mallet.y, mallet.z]);
    await sleep(100);
    a.send('grab', { objectId: 'toolMalletA', hand: 'right' });
    await waitFor(() => st(a).objects.get('toolMalletA')?.status === 'carried', 2000, 'mallet carried');
    for (let i = 0; i < 3; i++) await hit('ghBustN');
    expect(b('ghBustN').stage).toBe(2);
    expect(st(a).players.get('f1').score).toBe(26);

    // That much damage brings a guard, who catches us: held in the security office.
    await waitFor(() => st(a).players.get('f1').wanted >= 4, 2000, 'wanted');
    await waitFor(() => st(a).agents.size > 0, 2000, 'guard');
    const bust = b('ghBustN');
    for (let i = 0; i < 60 && st(a).players.get('f1').status !== 'held'; i++) { pose(a, bust.x + 0.5, 0, bust.z); await sleep(150); }
    expect(st(a).players.get('f1').status).toBe('held');
    expect(st(a).players.get('f1').wanted).toBe(0);
    expect(st(a).objects.get('toolMalletA').status).not.toBe('carried'); // dropped when caught

    // Late joiners spectate until the next round.
    const c = await join('fraud-party-113', 'f2');
    await waitFor(() => st(a).players.get('f2') !== undefined, 2000, 'joined');
    expect(st(a).players.get('f2').status).toBe('spectating');

    a.send('endRound', {});
    await waitFor(() => st(a).phase === 'lobby', 4000, 'lobby');
    let left = 0;
    st(a).breakables.forEach((x: any) => { if (x.kind === 'destructible') left++; });
    expect(left).toBe(0);
    expect(st(a).agents.size).toBe(0);
    expect(st(a).players.get('f1').status).toBe('active');
    await Promise.all([a.leave(), c.leave()]);
  });
});

describe('Elevators', () => {
  it('ride from the Great Hall floor to the balcony only when standing in the cab', async () => {
    const e = museum.elevators.find((x) => x.id === 'elevGreatHallN')!;
    const a = await join('elevator-party-111', 'e1');
    const teleports: { pos: number[]; fade?: boolean }[] = [];
    a.onMessage('teleport', (m: { pos: number[]; fade?: boolean }) => teleports.push(m));
    // Outside the cab: ignored.
    pose(a, e.x + 5, 0, e.z);
    await sleep(80);
    a.send('elevator', { id: e.id, floor: 2 });
    await sleep(200);
    expect(teleports.filter((t) => t.fade)).toHaveLength(0);
    // Inside the cab on floor 1: up to floor 2 with a fade.
    pose(a, e.x + 0.5, 0, e.z);
    await sleep(80);
    a.send('elevator', { id: e.id, floor: 2 });
    await waitFor(() => teleports.some((t) => t.fade), 2000, 'elevator teleport');
    const t = teleports.find((x) => x.fade)!;
    expect(t.pos[1]).toBe(8);
    expect(t.pos[0]).toBeCloseTo(e.x + 0.5, 3);
    await a.leave();
  });
});
