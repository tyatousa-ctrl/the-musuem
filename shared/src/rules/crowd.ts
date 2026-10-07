import type { Tunables } from '../config/tunables.js';
import type { MuseumMap, VisitorCircuit, Zone } from '../map/types.js';
import { AgentNav, type Circle, type Segment } from './agents.js';

/**
 * Crowd Control rules (brief §17), pure and deterministic given an rng.
 * Tourists walk the one-way visitor circuit; some walk it backwards or wander
 * toward closed areas. Security (the players) touch them to turn them around.
 * The server feeds in touches and the positions of stanchions, ropes and signs.
 */
export const TOURIST_KINDS = ['normal', 'kid', 'leader', 'follower', 'stubborn', 'lost', 'guide', 'influencer'] as const;
export type TouristKind = (typeof TOURIST_KINDS)[number];
/** Every synced NPC kind, by index (tourists, then Insurance Fraud's guards). */
export const AGENT_KINDS = [...TOURIST_KINDS, 'guard'] as const;
/** Moods by index; 'alert' is a guard in pursuit. */
export const MOODS = ['ok', 'wrong', 'offRoute', 'filming', 'huffy', 'waiting', 'alert'] as const;
export type Mood = (typeof MOODS)[number];

type Cfg = Tunables['crowdControl'];
export type Rng = () => number;

export interface Tourist {
  id: number;
  kind: TouristKind;
  x: number; z: number; r: number; yaw: number;
  /** Unit heading of the last move (for head-on jams). */
  hx: number; hz: number;
  speed: number;
  route: 'circuit' | 'detour' | 'follow';
  dir: 1 | -1;
  /** Circuit point, or detour path point (-1 = back at the circuit; path.length = loitering). */
  idx: number;
  detour: number;
  /** Loiter target inside a closed area. */
  lx: number; lz: number;
  touchesLeft: number;
  ignoreFirst: boolean;
  /** Followers: the leader's id, a cursor into its trail, and a place in the queue. */
  leader: number; cursor: number; slot: number;
  followers: number;
  /** Leaders: breadcrumbs every half metre, so followers walk where the leader walked. */
  trail: [number, number][]; trailBase: number;
  calm: number; huffy: number; filming: number; filmCooldown: number; lastChoke: string;
  signCooldown: number; touchCooldown: number; stuck: number; waiting: number;
  breached: boolean;
  gone: '' | 'routed' | 'wrong' | 'stuck';
}

export type TouchEffect = 'turned' | 'huffy' | 'ignored' | 'again' | 'sign';

export type CrowdEvent =
  | { type: 'wave'; wave: number; text: string }
  | { type: 'touched'; id: number; effect: TouchEffect; x: number; z: number }
  | { type: 'routed'; id: number }
  | { type: 'wrongExit'; id: number; x: number; z: number }
  | { type: 'breach'; id: number; label: string; x: number; z: number }
  | { type: 'filming'; id: number; x: number; z: number }
  | { type: 'failed'; reason: 'congestion' | 'breach' }
  | { type: 'cleared' };

export interface SpawnUnit { kind: TouristKind; followers: number; wrong: boolean }

/** What the players have put in the world. */
export interface CrowdWorld { posts: Circle[]; ropes: Segment[]; signs: { x: number; z: number }[] }

export interface CrowdSim {
  cfg: Cfg;
  nav: AgentNav;
  circuit: VisitorCircuit;
  chokes: Zone[];
  closed: { zone: Zone; label: string }[];
  rng: Rng;
  t: number;
  wave: number;
  queue: SpawnUnit[];
  nextSpawn: number;
  /** When the current wave finished arriving (-1 while still arriving). */
  waveArrivedAt: number;
  tourists: Tourist[];
  nextId: number;
  spawned: number; routed: number; wrongExits: number; breaches: number;
  score: number;
  /** 0..1; the round fails at 1. */
  congestion: number;
  breach: number;
  outcome: '' | 'cleared' | 'congestion' | 'breach';
  events: CrowdEvent[];
}

export const WAVE_TEXT = [
  'The doors are open! Keep visitors on the arrows. Touch anyone going the wrong way.',
  'Families and school groups! Turn the LEADER around and the group follows.',
  'Stubborn and lost visitors! Some need three taps; some head for STAFF ONLY areas.',
  'Tour guides and influencers! Guides gather crowds; influencers stop to film in doorways.',
  'Final wave: the whole city is here!',
];

/** Arrival mix per wave (followers come with leaders and guides). */
const MIX: Partial<Record<TouristKind, number>>[] = [
  { normal: 8, kid: 2 },
  { normal: 6, kid: 2, leader: 2 },
  { normal: 5, kid: 2, leader: 2, stubborn: 2, lost: 2 },
  { normal: 4, kid: 2, leader: 1, stubborn: 2, lost: 2, guide: 1, influencer: 2 },
  { normal: 4, kid: 3, leader: 2, stubborn: 2, lost: 3, guide: 2, influencer: 2 },
];

const perWave = (list: readonly number[] | number[], wave: number) => list[Math.min(list.length - 1, Math.max(0, wave - 1))];

/** Who arrives in a wave, in arrival order. */
export function waveRoster(wave: number, cfg: Cfg, rng: Rng): SpawnUnit[] {
  const size = perWave(cfg.waveSizes, wave);
  const mix = MIX[Math.min(MIX.length - 1, wave - 1)];
  const total = Object.values(mix).reduce((a, b) => a + (b ?? 0), 0);
  const units: SpawnUnit[] = [];
  let count = 0;
  while (count < size) {
    let pick = rng() * total;
    let kind: TouristKind = 'normal';
    for (const [k, w] of Object.entries(mix)) { pick -= w ?? 0; if (pick <= 0) { kind = k as TouristKind; break; } }
    let followers = kind === 'leader' ? 2 + Math.floor(rng() * 2) : kind === 'guide' ? 4 + Math.floor(rng() * 2) : 0;
    followers = Math.max(0, Math.min(followers, size - count - 1));
    const canStartWrong = kind !== 'lost' && kind !== 'influencer';
    units.push({ kind, followers, wrong: canStartWrong && rng() < perWave(cfg.wrongAtStartChance, wave) });
    count += 1 + followers;
  }
  return units;
}

export function createCrowd(map: MuseumMap, cfg: Cfg, rng: Rng = Math.random): CrowdSim {
  const labels = new Map(map.circuit.detours.map((d) => [d.zone, d.label]));
  const sim: CrowdSim = {
    cfg, nav: new AgentNav(map), circuit: map.circuit, rng,
    chokes: map.zones.filter((z) => z.kind === 'choke'),
    closed: map.zones.filter((z) => z.kind === 'restricted' && labels.has(z.id)).map((zone) => ({ zone, label: labels.get(zone.id)! })),
    t: 0, wave: 0, queue: [], nextSpawn: 0, waveArrivedAt: -1,
    tourists: [], nextId: 1,
    spawned: 0, routed: 0, wrongExits: 0, breaches: 0, score: 0,
    congestion: 0, breach: 0, outcome: '', events: [],
  };
  startWave(sim, 1);
  return sim;
}

export function startWave(sim: CrowdSim, wave: number) {
  sim.wave = wave;
  sim.queue = waveRoster(wave, sim.cfg, sim.rng);
  sim.nextSpawn = sim.t + 1;
  sim.waveArrivedAt = -1;
  sim.events.push({ type: 'wave', wave, text: WAVE_TEXT[Math.min(WAVE_TEXT.length - 1, wave - 1)] });
}

export const alive = (sim: CrowdSim) => sim.tourists.filter((t) => !t.gone);
const byId = (sim: CrowdSim, id: number) => sim.tourists.find((t) => t.id === id);

function newTourist(sim: CrowdSim, kind: TouristKind, x: number, z: number): Tourist {
  const cfg = sim.cfg;
  return {
    id: sim.nextId++, kind, x, z, r: kind === 'kid' ? 0.22 : 0.3, yaw: Math.PI / 2, hx: -1, hz: 0,
    speed: (kind === 'kid' ? cfg.kidSpeed : cfg.walkSpeed) * (0.92 + sim.rng() * 0.16),
    route: 'circuit', dir: 1, idx: 1, detour: -1, lx: 0, lz: 0,
    touchesLeft: kind === 'stubborn' ? cfg.stubbornTouches : 1,
    ignoreFirst: kind === 'kid' && sim.rng() < 0.5,
    leader: -1, cursor: 0, slot: 0, followers: 0, trail: [[x, z]], trailBase: 0,
    calm: 0, huffy: 0, filming: 0, filmCooldown: 0, lastChoke: '',
    signCooldown: 0, touchCooldown: 0, stuck: 0, waiting: 0, breached: false, gone: '',
  };
}

function spawnUnit(sim: CrowdSim, u: SpawnUnit) {
  const [ex, , ez] = sim.circuit.points[0];
  const z0 = ez + (sim.rng() - 0.5) * 2.4;
  const lead = newTourist(sim, u.kind, ex, z0);
  if (u.wrong) { lead.dir = -1; lead.idx = sim.circuit.points.length - 1; }
  sim.tourists.push(lead);
  for (let k = 0; k < u.followers; k++) {
    const side = k % 2 ? 1 : -1;
    const f = newTourist(sim, 'follower', ex - 0.3 * (k + 1), z0 + side * 0.65 * Math.ceil((k + 1) / 2));
    if (!sim.nav.standable(f.x, f.z, f.r)) { f.x = ex; f.z = z0; }
    f.route = 'follow'; f.leader = lead.id; f.slot = k; f.cursor = 0;
    lead.followers++;
    sim.tourists.push(f);
  }
  sim.spawned += 1 + u.followers;
}

/** The mood shown above a tourist's head (and used for scoring). */
export function moodOf(sim: CrowdSim, t: Tourist): Mood {
  if (t.filming > 0) return 'filming';
  if (t.huffy > 0) return 'huffy';
  let s = t;
  if (t.route === 'follow') s = byId(sim, t.leader) ?? t;
  if (s.route === 'detour') return 'offRoute';
  if (s.route === 'circuit' && s.dir < 0) return 'wrong';
  if (t.waiting > 2) return 'waiting';
  return 'ok';
}

function turnAround(sim: CrowdSim, t: Tourist) {
  const last = sim.circuit.points.length - 1;
  if (t.route === 'circuit' && t.dir < 0) {
    t.dir = 1;
    t.idx = Math.min(last, t.idx + 1);
  } else if (t.route === 'detour') {
    const len = sim.circuit.detours[t.detour].path.length;
    t.dir = -1;
    t.idx = Math.min(t.idx, len) - 1;
  }
  t.calm = t.kind === 'kid' ? 5 : sim.cfg.calmSec;
  t.waiting = 0;
}

/** A player touched a tourist. Returns what happened (null if ignored). */
export function touchTourist(sim: CrowdSim, id: number): TouchEffect | null {
  const t = byId(sim, id);
  if (!t || t.gone || t.touchCooldown > 0) return null;
  t.touchCooldown = sim.cfg.touchCooldownSec;
  t.huffy = 1.2;
  let effect: TouchEffect;
  const strayed = (t.route === 'circuit' && t.dir < 0) || t.route === 'detour';
  if (t.filming > 0) { t.filming = 0; t.filmCooldown = 30; effect = 'turned'; }
  else if (t.route === 'follow' || !strayed) effect = 'huffy';
  else if (t.ignoreFirst) { t.ignoreFirst = false; effect = 'ignored'; }
  else if (t.touchesLeft > 1) { t.touchesLeft--; effect = 'again'; }
  else {
    turnAround(sim, t);
    t.touchesLeft = t.kind === 'stubborn' ? sim.cfg.stubbornTouches : 1;
    effect = 'turned';
  }
  sim.events.push({ type: 'touched', id, effect, x: t.x, z: t.z });
  return effect;
}

function strayWrong(sim: CrowdSim, t: Tourist, at: number) {
  t.dir = -1;
  t.idx = at - 1;
}

/** Arrived at the current target. */
function arrive(sim: CrowdSim, t: Tourist) {
  const pts = sim.circuit.points, last = pts.length - 1;
  const cfg = sim.cfg;
  if (t.route === 'circuit') {
    const i = t.idx;
    if (t.dir > 0) {
      if (i >= last) { t.gone = 'routed'; return; }
      if (t.calm <= 0) {
        const detour = sim.circuit.detours.findIndex((d) => d.from === i);
        const wrongChance = perWave(cfg.wrongTurnChance, sim.wave) * (t.kind === 'kid' ? 3 : t.kind === 'lost' || t.kind === 'influencer' ? 0 : 1);
        if (t.kind === 'lost' && detour >= 0 && sim.rng() < cfg.lostDetourChance) {
          t.route = 'detour'; t.detour = detour; t.idx = 0; t.dir = 1; return;
        }
        if (i > 0 && sim.rng() < wrongChance) { strayWrong(sim, t, i); return; }
      }
      t.idx = i + 1;
    } else {
      if (i <= 0) { t.gone = 'wrong'; return; }
      t.idx = i - 1;
    }
    return;
  }
  if (t.route === 'detour') {
    const d = sim.circuit.detours[t.detour];
    if (t.dir > 0) {
      if (t.idx < d.path.length) t.idx++;
      // Loiter: wander a little inside the closed area.
      const [cx, , cz] = d.path[d.path.length - 1];
      for (let k = 0; k < 6; k++) {
        const a = sim.rng() * Math.PI * 2, r = sim.rng() * 1.3;
        if (sim.nav.standable(cx + Math.cos(a) * r, cz + Math.sin(a) * r, t.r)) { t.lx = cx + Math.cos(a) * r; t.lz = cz + Math.sin(a) * r; break; }
        t.lx = cx; t.lz = cz;
      }
    } else if (t.idx >= 0) t.idx--;
    else { t.route = 'circuit'; t.idx = d.from + 1; t.dir = 1; t.detour = -1; }
  }
}

/** Back onto the circuit at the nearest point ahead. */
function rejoinCircuit(sim: CrowdSim, t: Tourist) {
  let best = 1, bd = Infinity;
  sim.circuit.points.forEach((p, i) => { const d = Math.hypot(p[0] - t.x, p[2] - t.z); if (i > 0 && d < bd) { bd = d; best = i; } });
  t.route = 'circuit'; t.dir = 1; t.idx = best; t.leader = -1;
}

function target(sim: CrowdSim, t: Tourist): [number, number] | null {
  if (t.route === 'circuit') { const p = sim.circuit.points[t.idx]; return [p[0], p[2]]; }
  if (t.route === 'detour') {
    const d = sim.circuit.detours[t.detour];
    if (t.idx < 0) { const p = sim.circuit.points[d.from]; return [p[0], p[2]]; }
    if (t.idx >= d.path.length) return [t.lx, t.lz];
    return [d.path[t.idx][0], d.path[t.idx][2]];
  }
  const l = byId(sim, t.leader);
  if (!l || !l.trail.length) return [t.x, t.z];
  const k = Math.max(0, Math.min(l.trail.length - 1, t.cursor - l.trailBase));
  return l.trail[k];
}

function moveTourist(sim: CrowdSim, t: Tourist, dt: number, world: CrowdWorld, others: Tourist[]) {
  const tg = target(sim, t);
  if (!tg) return;
  const dx = tg[0] - t.x, dz = tg[1] - t.z;
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-6 ? dx / d : 0, uz = d > 1e-6 ? dz / d : 0;
  let speed = t.speed;
  let leaderGone = false;
  if (t.route === 'follow') {
    const l = byId(sim, t.leader);
    if (!l) { rejoinCircuit(sim, t); return; }
    leaderGone = !!l.gone;
    const end = l.trailBase + l.trail.length - 1;
    const gap = leaderGone ? 0 : 2 + t.slot * 2;
    if (d < 0.5 && t.cursor < end - gap) t.cursor++;
    const far = Math.hypot(l.x - t.x, l.z - t.z) > 2.5 + t.slot;
    speed = l.speed * (far || leaderGone ? 1.35 : 1);
    if (leaderGone && t.cursor >= end && d < 0.8) { t.gone = l.gone; return; }
    if (d < 0.25) return;
  }

  // Slow down behind people and when walking into the oncoming flow; keep a little personal space.
  let slow = 1, sx = 0, sz = 0;
  for (const o of others) {
    if (o === t) continue;
    const ox = o.x - t.x, oz = o.z - t.z;
    const od = Math.hypot(ox, oz);
    if (od > 1.2 || od < 1e-6) continue;
    if (od < 0.62) { sx -= (ox / od) * (0.62 - od) * 2; sz -= (oz / od) * (0.62 - od) * 2; }
    const ahead = (ox * ux + oz * uz) / od;
    if (ahead > 0.6) {
      if (o.hx * t.hx + o.hz * t.hz < -0.3) slow = Math.min(slow, 0.35);
      else if (od < 0.75) slow = Math.min(slow, 0.55);
    }
  }
  const step = Math.min(speed * slow * dt, d);
  const x0 = t.x, z0 = t.z;
  let res = sim.nav.step(t, t.x + ux * step + sx * dt, t.z + uz * step + sz * dt, world.posts, world.ropes);
  if (!res.moved) res = sim.nav.step(t, t.x + ux * step, t.z + uz * step, world.posts, world.ropes);
  const mx = t.x - x0, mz = t.z - z0, m = Math.hypot(mx, mz);
  if (m > 1e-4) {
    t.hx = mx / m; t.hz = mz / m;
    t.yaw = Math.atan2(-mx, -mz);
  }
  t.stuck = m < speed * dt * 0.1 ? t.stuck + dt : 0;

  // A rope across the way: strays take the hint and turn around; everyone else waits.
  if (res.rope) {
    const mood = moodOf(sim, t);
    if ((mood === 'wrong' || mood === 'offRoute') && t.route !== 'follow') {
      turnAround(sim, t);
      sim.events.push({ type: 'touched', id: t.id, effect: 'sign', x: t.x, z: t.z });
    } else t.waiting += dt;
  } else t.waiting = Math.max(0, t.waiting - dt * 2);

  // Leaders drop breadcrumbs.
  if (t.followers > 0 || t.kind === 'guide' || t.kind === 'leader') {
    const lastPt = t.trail[t.trail.length - 1];
    if (!lastPt || Math.hypot(t.x - lastPt[0], t.z - lastPt[1]) > 0.5) t.trail.push([t.x, t.z]);
    if (t.trail.length > 300) { t.trail.splice(0, 100); t.trailBase += 100; }
  }

  const arriveR = t.route === 'circuit' && t.dir > 0 && t.idx === sim.circuit.points.length - 1 ? 1.2 : 0.9;
  if (t.route !== 'follow' && Math.hypot(tg[0] - t.x, tg[1] - t.z) < arriveR) arrive(sim, t);
}

/** Advance the simulation by dt seconds (the server runs it at 10 Hz). */
export function stepCrowd(sim: CrowdSim, dt: number, world: CrowdWorld = { posts: [], ropes: [], signs: [] }) {
  if (sim.outcome) return;
  const cfg = sim.cfg;
  sim.t += dt;

  // Arrivals.
  const live = alive(sim);
  if (sim.queue.length && sim.t >= sim.nextSpawn && live.length + 1 + sim.queue[0].followers <= cfg.maxAgents) {
    const u = sim.queue.shift()!;
    spawnUnit(sim, u);
    sim.nextSpawn = sim.t + cfg.spawnIntervalSec * (1 - 0.08 * (sim.wave - 1)) * (u.followers ? 1.6 : 1);
  }
  if (!sim.queue.length && sim.waveArrivedAt < 0) sim.waveArrivedAt = sim.t;
  if (sim.waveArrivedAt >= 0) {
    const n = alive(sim).length;
    if (sim.wave < cfg.waves && (n === 0 || sim.t - sim.waveArrivedAt >= cfg.waveGapSec)) startWave(sim, sim.wave + 1);
    else if (sim.wave >= cfg.waves && n === 0) { sim.outcome = 'cleared'; sim.events.push({ type: 'cleared' }); return; }
  }

  const people = alive(sim);
  for (const t of people) {
    t.touchCooldown -= dt; t.signCooldown -= dt; t.calm -= dt; t.huffy -= dt; t.filmCooldown -= dt;
    if (t.filming > 0) { t.filming -= dt; continue; }

    // Signs nudge strays back onto the route (kids don't read signs).
    if (t.signCooldown <= 0 && t.kind !== 'kid' && t.route !== 'follow' && world.signs.length) {
      const mood = moodOf(sim, t);
      if ((mood === 'wrong' || mood === 'offRoute') && world.signs.some((s) => Math.hypot(s.x - t.x, s.z - t.z) < cfg.signRadius)) {
        t.signCooldown = 6;
        if (t.touchesLeft > 1) t.touchesLeft--;
        else { turnAround(sim, t); t.touchesLeft = t.kind === 'stubborn' ? cfg.stubbornTouches : 1; }
        sim.events.push({ type: 'touched', id: t.id, effect: 'sign', x: t.x, z: t.z });
      }
    }

    // Guides gather nearby visitors into their crowd.
    if (t.kind === 'guide' && t.followers < 8) {
      for (const o of people) {
        if (o.kind !== 'normal' || o.route !== 'circuit' || o.dir !== t.dir || Math.hypot(o.x - t.x, o.z - t.z) > 2.5) continue;
        o.route = 'follow'; o.leader = t.id; o.slot = t.followers++;
        o.cursor = Math.max(t.trailBase, t.trailBase + t.trail.length - 1 - (2 + o.slot * 2));
        if (t.followers >= 8) break;
      }
    }

    // Influencers stop to film in doorways.
    if (t.kind === 'influencer' && t.route === 'circuit' && t.filmCooldown <= 0) {
      for (const c of sim.chokes) {
        if (Math.hypot(c.center[0] - t.x, c.center[2] - t.z) > c.radius || t.lastChoke === c.id) continue;
        t.lastChoke = c.id;
        if (sim.rng() < 0.6) { t.filming = cfg.filmSec; sim.events.push({ type: 'filming', id: t.id, x: t.x, z: t.z }); }
      }
    }

    moveTourist(sim, t, dt, world, people);
    if (!t.gone && t.stuck > 40) t.gone = 'stuck'; // never soft-lock a wave
    if (t.gone === 'routed') { sim.routed++; sim.score += cfg.pointsRouted; sim.events.push({ type: 'routed', id: t.id }); }
    if (t.gone === 'wrong') { sim.wrongExits++; sim.score -= cfg.penaltyWrongExit; sim.events.push({ type: 'wrongExit', id: t.id, x: t.x, z: t.z }); }
  }

  // Meters: jammed doorways, people stuck at ropes, visitors in closed areas.
  const still = alive(sim);
  let over = 0;
  for (const c of sim.chokes) {
    let n = 0;
    for (const t of still) if (Math.hypot(c.center[0] - t.x, c.center[2] - t.z) < c.radius) n += t.filming > 0 ? 3 : 1;
    over += Math.max(0, n - cfg.chokeCapacity);
  }
  over += still.filter((t) => t.waiting > 3).length;
  sim.congestion = Math.max(0, Math.min(1, sim.congestion + (over > 0 ? over * cfg.congestionPerAgentSec : -cfg.congestionDrainPerSec) * dt));
  let inside = 0;
  for (const t of still) {
    const c = sim.closed.find((c) => Math.hypot(c.zone.center[0] - t.x, c.zone.center[2] - t.z) < c.zone.radius);
    if (!c) continue;
    inside++;
    if (!t.breached) {
      t.breached = true;
      sim.breaches++;
      sim.score -= cfg.penaltyBreach;
      sim.events.push({ type: 'breach', id: t.id, label: c.label, x: t.x, z: t.z });
    }
  }
  sim.breach = Math.max(0, Math.min(1, sim.breach + (inside > 0 ? inside * cfg.breachPerAgentSec : -cfg.breachDrainPerSec) * dt));
  if (sim.congestion >= 1) { sim.outcome = 'congestion'; sim.events.push({ type: 'failed', reason: 'congestion' }); }
  else if (sim.breach >= 1) { sim.outcome = 'breach'; sim.events.push({ type: 'failed', reason: 'breach' }); }

  // Forget departed tourists once nobody follows them.
  sim.tourists = sim.tourists.filter((t) => !t.gone || sim.tourists.some((f) => !f.gone && f.leader === t.id && f.route === 'follow'));
}

/** 0–3 stars from score per visitor; a failed round earns none. */
export function crowdStars(sim: CrowdSim): number {
  if (sim.outcome === 'congestion' || sim.outcome === 'breach') return 0;
  const ratio = sim.score / Math.max(1, sim.spawned);
  return sim.cfg.starThresholds.filter((x) => ratio >= x).length;
}
