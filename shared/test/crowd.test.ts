import { describe, expect, it } from 'vitest';
import { museum } from '../src/map/museum.js';
import { cloneTunables } from '../src/config/tunables.js';
import { AgentNav, ropeSegments } from '../src/rules/agents.js';
import {
  alive, createCrowd, crowdStars, moodOf, stepCrowd, touchTourist, waveRoster,
  type CrowdSim, type CrowdWorld, type Tourist, type TouristKind,
} from '../src/rules/crowd.js';

/** Small deterministic rng (mulberry32). */
function rng(seed = 7) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Walk a polyline in 5 cm steps and report the first illegal step. */
function walk(nav: AgentNav, pts: [number, number, number][], r = 0.3): string | null {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, , az] = pts[i], [bx, , bz] = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05);
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
      const x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
      if (!nav.canStep(x0, z0, x1, z1, r)) return `segment ${i}→${i + 1} blocked near (${x1.toFixed(2)}, ${z1.toFixed(2)})`;
    }
  }
  return null;
}

const cfg = (over: Record<string, unknown> = {}) => cloneTunables({ crowdControl: over as never }).crowdControl;
const NO_WRONG = { wrongTurnChance: [0, 0, 0, 0, 0], wrongAtStartChance: [0, 0, 0, 0, 0] };

/** A sim with one tourist placed by hand, and no arrivals. */
function solo(kind: TouristKind, setup: (t: Tourist) => void, over: Record<string, unknown> = {}): { sim: CrowdSim; t: Tourist } {
  const sim = createCrowd(museum, cfg({ ...NO_WRONG, ...over }), rng());
  sim.queue = [{ kind, followers: 0, wrong: false }];
  sim.nextSpawn = 0;
  stepCrowd(sim, 0.1);
  sim.queue = [];
  sim.waveArrivedAt = -1; // hold the wave open
  const t = sim.tourists[0];
  setup(t);
  return { sim, t };
}
const run = (sim: CrowdSim, seconds: number, world?: CrowdWorld) => {
  for (let i = 0; i < seconds * 10; i++) { stepCrowd(sim, 0.1, world); sim.waveArrivedAt = -1; }
};

describe('visitor circuit and agent navigation', () => {
  const nav = new AgentNav(museum);

  it('every circuit leg is walkable on the ground floor', () => {
    expect(walk(nav, museum.circuit.points)).toBeNull();
  });

  it('every detour to a closed area is walkable both ways', () => {
    for (const d of museum.circuit.detours) {
      const path = [museum.circuit.points[d.from], ...d.path];
      expect(walk(nav, path), d.zone).toBeNull();
      expect(walk(nav, [...path].reverse()), d.zone).toBeNull();
      const z = museum.zones.find((x) => x.id === d.zone)!;
      expect(Math.hypot(d.path.at(-1)![0] - z.center[0], d.path.at(-1)![2] - z.center[2])).toBeLessThan(z.radius);
    }
  });

  it('walls and exhibits block agents; portals let them through', () => {
    expect(nav.canStep(11.8, -14, 12.2, -14, 0.3)).toBe(false); // wall between the Great Hall and Arms and Armor
    expect(nav.canStep(12.2, -20, 11.8, -20, 0.3)).toBe(true); // through the doorway
    expect(nav.standable(25, 0, 0.3)).toBe(false); // inside the information desk
  });

  it('stanchions link into velvet ropes, two per post at most', () => {
    const posts = [0, 1, 2, 3].map((i) => ({ id: `s${i}`, x: i * 2, z: 0 }));
    expect(ropeSegments(posts, 2.6).map((r) => `${r.a}-${r.b}`).sort()).toEqual(['s0-s1', 's1-s2', 's2-s3']);
    expect(ropeSegments([{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 5, z: 0 }], 2.6)).toEqual([]);
  });
});

describe('Crowd Control rules', () => {
  it('waves grow and later waves bring the trickier visitors', () => {
    const c = cfg();
    const size = (w: number) => waveRoster(w, c, rng(w)).reduce((n, u) => n + 1 + u.followers, 0);
    expect(size(1)).toBe(c.waveSizes[0]);
    expect(size(5)).toBe(c.waveSizes[4]);
    const kinds = new Set(waveRoster(1, c, rng()).map((u) => u.kind));
    expect([...kinds].every((k) => k === 'normal' || k === 'kid')).toBe(true);
    const late = new Set(Array.from({ length: 6 }, (_, i) => waveRoster(5, c, rng(i))).flat().map((u) => u.kind));
    for (const k of ['guide', 'influencer', 'lost', 'stubborn', 'leader']) expect(late.has(k as TouristKind), k).toBe(true);
  });

  it('a wave of well-behaved visitors walks the whole circuit and out', () => {
    const sim = createCrowd(museum, cfg({ ...NO_WRONG, waves: 1 }), rng(3));
    for (let i = 0; i < 6000 && !sim.outcome; i++) stepCrowd(sim, 0.1);
    expect(sim.outcome).toBe('cleared');
    expect(sim.routed).toBe(sim.spawned);
    expect(sim.score).toBe(sim.spawned);
    expect(crowdStars(sim)).toBe(3);
  });

  it('touching a wrong-way visitor turns them around; touching a happy one just annoys them', () => {
    const { sim, t } = solo('normal', (t) => { t.x = 30; t.z = -14; t.dir = -1; t.idx = 0; });
    expect(moodOf(sim, t)).toBe('wrong');
    expect(touchTourist(sim, t.id)).toBe('turned');
    expect(t.dir).toBe(1);
    t.touchCooldown = 0;
    expect(touchTourist(sim, t.id)).toBe('huffy');
    expect(t.dir).toBe(1);
  });

  it('a wrong-way visitor nobody stops leaves by the entrance and costs a point', () => {
    const { sim } = solo('normal', (t) => { t.x = 30; t.z = -14; t.dir = -1; t.idx = 0; });
    run(sim, 20);
    expect(sim.wrongExits).toBe(1);
    expect(sim.score).toBe(-1);
  });

  it('stubborn visitors need three touches; some kids ignore the first', () => {
    const { sim, t } = solo('stubborn', (t) => { t.x = 30; t.z = -14; t.dir = -1; t.idx = 0; });
    const touch = () => { t.touchCooldown = 0; return touchTourist(sim, t.id); };
    expect([touch(), touch(), touch()]).toEqual(['again', 'again', 'turned']);
    const k = solo('kid', (t) => { t.x = 30; t.z = -14; t.dir = -1; t.idx = 0; t.ignoreFirst = true; });
    k.t.touchCooldown = 0;
    expect(touchTourist(k.sim, k.t.id)).toBe('ignored');
    k.t.touchCooldown = 0;
    expect(touchTourist(k.sim, k.t.id)).toBe('turned');
  });

  it('turning a group leader turns the whole group', () => {
    const sim = createCrowd(museum, cfg(NO_WRONG), rng(5));
    sim.queue = [{ kind: 'leader', followers: 3, wrong: false }];
    run(sim, 25);
    const leader = sim.tourists.find((t) => t.kind === 'leader')!;
    leader.dir = -1; leader.idx -= 1; // takes a wrong turn
    run(sim, 3);
    const followers = sim.tourists.filter((t) => t.leader === leader.id);
    expect(followers.length).toBe(3);
    expect(followers.every((f) => moodOf(sim, f) === 'wrong')).toBe(true);
    leader.touchCooldown = 0;
    expect(touchTourist(sim, followers[0].id)).toBe('huffy'); // talk to the leader
    expect(touchTourist(sim, leader.id)).toBe('turned');
    run(sim, 2);
    expect(followers.every((f) => moodOf(sim, f) === 'ok')).toBe(true);
    sim.cfg.waves = 1; // no more arrivals
    for (let i = 0; i < 4000 && !sim.outcome; i++) stepCrowd(sim, 0.1);
    expect(sim.routed).toBe(4);
    expect(sim.wrongExits).toBe(0);
  });

  it('lost visitors breach closed areas, filling the breach meter; a touch walks them back', () => {
    const { sim, t } = solo('lost', (t) => { t.x = 30; t.z = -12; t.idx = 1; }, { lostDetourChance: 1 });
    run(sim, 25);
    expect(moodOf(sim, t)).toBe('offRoute');
    expect(sim.breaches).toBe(1);
    expect(sim.score).toBe(-2);
    expect(sim.breach).toBeGreaterThan(0);
    t.touchCooldown = 0;
    expect(touchTourist(sim, t.id)).toBe('turned');
    run(sim, 15);
    expect(t.route).toBe('circuit');
    expect(moodOf(sim, t)).toBe('ok');
  });

  it('a sign turns strays around; a rope stops them', () => {
    const s = solo('normal', (t) => { t.x = 30; t.z = -14; t.dir = -1; t.idx = 0; });
    run(s.sim, 1, { posts: [], ropes: [], signs: [{ x: 31, z: -12.5 }] });
    expect(s.t.dir).toBe(1);
    const r = solo('normal', (t) => { t.x = 30; t.z = -14; t.dir = -1; t.idx = 0; });
    run(r.sim, 6, { posts: [], ropes: [{ ax: 30, az: -10, bx: 34, bz: -14 }], signs: [] });
    expect(r.t.dir).toBe(1);
  });

  it('an influencer filming in a doorway jams it and the congestion meter rises', () => {
    const { sim, t } = solo('influencer', (t) => { t.x = 13.5; t.z = -20.5; t.idx = 3; });
    sim.rng = () => 0; // always films
    for (let i = 0; i < 6; i++) {
      const extra = { ...t, id: 100 + i, kind: 'normal' as const, x: 12 + (i % 3) * 0.6 - 0.6, z: -20 + Math.floor(i / 3) * 0.7, trail: [] as [number, number][] };
      sim.tourists.push(extra);
    }
    run(sim, 1);
    expect(moodOf(sim, t)).toBe('filming');
    expect(sim.congestion).toBeGreaterThan(0);
    t.touchCooldown = 0;
    expect(touchTourist(sim, t.id)).toBe('turned');
    expect(t.filming).toBe(0);
  });

  it('a full meter fails the round with no stars', () => {
    const { sim } = solo('normal', () => {});
    sim.breach = 0.999;
    sim.tourists[0].x = 32; sim.tourists[0].z = -31;
    run(sim, 1);
    expect(sim.outcome).toBe('breach');
    expect(crowdStars(sim)).toBe(0);
  });

  it('never has more than the agent cap in the museum at once', () => {
    const sim = createCrowd(museum, cfg({ waveSizes: [60, 60, 60, 60, 60], spawnIntervalSec: 0.1, waveGapSec: 5 }), rng(9));
    let peak = 0;
    for (let i = 0; i < 1500 && !sim.outcome; i++) { stepCrowd(sim, 0.1); peak = Math.max(peak, alive(sim).length); }
    expect(peak).toBeLessThanOrEqual(40);
    expect(peak).toBeGreaterThan(30);
  });
});
