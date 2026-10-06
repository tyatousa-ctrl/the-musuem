import {
  MOODS, TOURIST_KINDS, alive, createCrowd, crowdStars, moodOf, ropeSegments, stepCrowd, touchTourist,
  type CrowdSim, type CrowdWorld, type Spawn,
} from '@museum/shared';
import type { PlayerT } from '../../state/schema.js';
import type { ModeContext, RoundResult, ServerMode } from '../types.js';

/** Where the tools wait at the start of a round: by the Grand Staircase in the Great Hall. */
const STANCHIONS: [number, number][] = [[18, -5], [18, -3], [18, -1], [18, 1], [18, 3], [18, 5]];
const SIGNS: [number, number][] = [[15.5, -3], [15.5, 0], [15.5, 3]];
const POST_RADIUS = 0.22;

/**
 * Crowd Control (brief §17): co-op museum security. The rules and the agent
 * simulation live in shared/rules/crowd.ts; this glues them to players
 * (touches), the shared grabbables (stanchions, ropes, signs) and sync.
 */
export function createCrowdMode(): ServerMode {
  let sim: CrowdSim | null = null;
  let acc = 0;
  let result: RoundResult | null = null;

  /** Stanchions and signs standing on the ground floor. */
  function world(ctx: ModeContext): CrowdWorld {
    const posts: { id: string; x: number; z: number }[] = [];
    const signs: { x: number; z: number }[] = [];
    for (const o of ctx.state.objects.values()) {
      if (o.status === 'carried' || o.status === 'flight' || o.y > 2) continue;
      if (o.kind === 'stanchion') posts.push({ id: o.id, x: o.x, z: o.z });
      if (o.kind === 'sign') signs.push({ x: o.x, z: o.z });
    }
    return {
      posts: posts.map((p) => ({ x: p.x, z: p.z, r: POST_RADIUS })),
      ropes: ropeSegments(posts, ctx.tunables.crowdControl.ropeMaxLen),
      signs,
    };
  }

  /** Hands inside a tourist's body, or a player walking into one. */
  function touches(ctx: ModeContext, s: CrowdSim) {
    const cfg = ctx.tunables.crowdControl;
    for (const p of ctx.players()) {
      if (p.status !== 'active' || Math.abs(p.feetY - s.nav.floorY) > 1) continue;
      for (const t of alive(s)) {
        const height = t.kind === 'kid' ? 1.2 : 1.75;
        const hand = [p.left, p.right].some((h) => Math.hypot(h.px - t.x, h.pz - t.z) < cfg.touchRadius && h.py > s.nav.floorY + 0.1 && h.py < s.nav.floorY + height + 0.15);
        const bump = Math.hypot(p.head.px - t.x, p.head.pz - t.z) < cfg.bumpRadius;
        if (hand || bump) touchTourist(s, t.id);
      }
    }
  }

  function finish(ctx: ModeContext, s: CrowdSim) {
    const stars = crowdStars(s);
    const tally = `${s.routed} of ${s.spawned} visitors routed, score ${s.score}`;
    const summary = s.outcome === 'cleared' ? `All ${s.wave} waves done! ${tally}. ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`
      : s.outcome === 'congestion' ? `Gridlock in wave ${s.wave}: the museum had to close. ${tally}.`
      : `Too many visitors got into closed areas in wave ${s.wave}. ${tally}.`;
    result = { summary };
  }

  function drainEvents(ctx: ModeContext, s: CrowdSim) {
    for (const e of s.events) {
      if (e.type === 'wave') ctx.announce(`Wave ${e.wave} of ${ctx.tunables.crowdControl.waves}. ${e.text}`, 'info');
      else if (e.type === 'touched') ctx.broadcast('crowd', { type: 'touched', effect: e.effect, pos: [e.x, s.nav.floorY + 1.6, e.z] });
      else if (e.type === 'wrongExit') ctx.broadcast('crowd', { type: 'wrongExit', pos: [e.x, s.nav.floorY + 1.6, e.z] });
      else if (e.type === 'filming') ctx.broadcast('crowd', { type: 'filming', pos: [e.x, s.nav.floorY + 1.6, e.z] });
      else if (e.type === 'breach') {
        ctx.announce(`A visitor wandered into ${e.label}!`, 'alert');
        ctx.broadcast('crowd', { type: 'breach', pos: [e.x, s.nav.floorY + 1.6, e.z] });
      } else if (e.type === 'cleared' || e.type === 'failed') finish(ctx, s);
    }
    s.events.length = 0;
  }

  function sync(ctx: ModeContext, s: CrowdSim) {
    ctx.systems.agents.sync(alive(s).map((t) => ({
      id: `t${t.id}`, kind: TOURIST_KINDS.indexOf(t.kind), mood: MOODS.indexOf(moodOf(s, t)),
      x: t.x, y: s.nav.floorY, z: t.z, yaw: t.yaw,
    })));
    const st = ctx.state;
    st.ccWave = s.wave;
    st.ccCongestion = s.congestion;
    st.ccBreach = s.breach;
    st.ccScore = s.score;
    st.ccRouted = s.routed;
    st.ccSpawned = s.spawned;
  }

  const mode: ServerMode = {
    id: 'crowdControl',
    minPlayers: 1,
    maxPlayers: 4,
    joinPolicy: 'immediate',
    timeLimitSec: () => 0, // five waves, however long they take

    onEnter(ctx) {
      result = null;
      acc = 0;
      sim = createCrowd(ctx.map, ctx.tunables.crowdControl);
      ctx.systems.teams.clear();
      for (const p of ctx.players()) p.score = 0;
      STANCHIONS.forEach(([x, z], i) => ctx.systems.objects.spawn(`stanchion${i}`, 'stanchion', 'brass', [x, 0.95, z]));
      SIGNS.forEach(([x, z], i) => ctx.systems.objects.spawn(`sign${i}`, 'sign', 'thisWay', [x, 1.0, z]));
      for (const p of ctx.players()) ctx.teleport(p, mode.spawnFor(ctx, p));
      sync(ctx, sim);
    },

    // Join immediately as another security guard; the current wave carries on.
    onPlayerJoin(ctx, p) { ctx.teleport(p, mode.spawnFor(ctx, p)); },
    onPlayerLeave() {},

    spawnFor(ctx, p: PlayerT): Spawn {
      const list = ctx.map.spawns.lobby;
      const order = ctx.players().sort((a, b) => a.joinedAt - b.joinedAt).indexOf(p);
      return list[Math.max(0, order) % list.length];
    },

    tick(ctx, dtMs) {
      if (!sim || result) return;
      acc += dtMs / 1000;
      const step = 1 / ctx.tunables.net.agentTickHz;
      if (acc < step) return;
      acc = Math.min(acc - step, step); // never spiral after a stall
      touches(ctx, sim);
      stepCrowd(sim, step, world(ctx));
      drainEvents(ctx, sim);
      sync(ctx, sim);
    },

    onRequest(ctx, p, type, payload) {
      if (type !== 'touchAgent' || !sim || p.status !== 'active') return;
      const id = Number(String((payload as { id: string }).id).slice(1));
      const t = alive(sim).find((x) => x.id === id);
      // Desktop reach: the tourist must be right in front of the player.
      if (t && Math.hypot(p.head.px - t.x, p.head.pz - t.z) < 2 && Math.abs(p.feetY - sim.nav.floorY) < 1) touchTourist(sim, t.id);
    },

    isRoundOver: () => result,

    onExit(ctx) {
      sim = null;
      result = null;
      ctx.systems.agents.clear();
      ctx.systems.objects.removeKind('stanchion');
      ctx.systems.objects.removeKind('sign');
      const st = ctx.state;
      st.ccWave = 0; st.ccCongestion = 0; st.ccBreach = 0; st.ccScore = 0; st.ccRouted = 0; st.ccSpawned = 0;
    },
  };
  return mode;
}
