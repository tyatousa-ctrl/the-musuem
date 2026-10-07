import {
  drainDaze, groundHeightAt, resolveHit, roomAt, type Hand, type MuseumMap, type Team, type Tunables,
} from '@museum/shared';
import { AgentT, BreakableT, ObjectT, type PartyState, type PlayerT, PoseT } from '../state/schema.js';
import type { ModeContext, ServerMode } from '../modes/types.js';

type V3 = [number, number, number];

export function handPose(p: PlayerT, hand: Hand): PoseT { return hand === 'left' ? p.left : p.right; }
export const poseVec = (q: PoseT): V3 => [q.px, q.py, q.pz];
export const feetPos = (p: PlayerT): V3 => [p.head.px, p.feetY, p.head.pz];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The shared systems every mode uses (brief §14, §19, §20). */
export class Systems {
  readonly objects: ObjectSystem;
  readonly breakables: BreakableSystem;
  readonly combat: CombatSystem;
  readonly teams: TeamSystem;
  readonly agents: AgentSystem;

  constructor(state: PartyState, map: MuseumMap, tunables: Tunables, ctx: () => ModeContext, mode: () => ServerMode | null) {
    this.objects = new ObjectSystem(state, map, tunables, ctx, mode);
    this.breakables = new BreakableSystem(state, tunables, ctx, mode);
    this.combat = new CombatSystem(state, tunables, ctx, mode, this.objects);
    this.teams = new TeamSystem(state);
    this.agents = new AgentSystem(state);
  }

  tick(dtMs: number) {
    this.objects.tick(dtMs);
    this.combat.tick(dtMs);
  }
}

// ─── Grabbables ──────────────────────────────────────────────────────────────
/** Height of an object's grab point above the floor when it rests (tall props are held by the top). */
const REST_HEIGHT: Record<string, number> = { stanchion: 0.95, sign: 1.0, tool: 0.45, 'tool:ball': 0.25 };
const restHeight = (kind: string, variant = '') => REST_HEIGHT[`${kind}:${variant}`] ?? REST_HEIGHT[kind] ?? 0.12;

export class ObjectSystem {
  /** Max distance from hand to object centre for a grab claim (lenient for latency). */
  static GRAB_REACH = 0.85;

  constructor(
    private state: PartyState, private map: MuseumMap, private tunables: Tunables,
    private ctx: () => ModeContext, private mode: () => ServerMode | null,
  ) {}

  spawn(id: string, kind: string, variant: string, pos: V3, opts: { team?: string; status?: string } = {}): ObjectT {
    const o = new ObjectT();
    o.id = id; o.kind = kind; o.variant = variant;
    o.team = opts.team ?? ''; o.status = opts.status ?? 'rest';
    [o.x, o.y, o.z] = pos;
    this.state.objects.set(id, o);
    return o;
  }

  remove(id: string) {
    const o = this.state.objects.get(id);
    if (!o) return;
    if (o.holder) this.clearHand(o.holder, o.id);
    this.state.objects.delete(id);
  }

  removeKind(kind: string) {
    for (const o of [...this.state.objects.values()]) if (o.kind === kind) this.remove(o.id);
  }

  place(id: string, pos: V3, status: string) {
    const o = this.state.objects.get(id);
    if (!o) return;
    if (o.holder) this.clearHand(o.holder, o.id);
    o.holder = ''; o.hand = ''; o.status = status;
    [o.x, o.y, o.z] = pos;
    o.vx = o.vy = o.vz = 0;
  }

  private clearHand(playerId: string, objectId: string) {
    const p = this.state.players.get(playerId);
    if (!p) return;
    if (p.heldLeft === objectId) p.heldLeft = '';
    if (p.heldRight === objectId) p.heldRight = '';
  }

  grab(player: PlayerT, objectId: string, hand: Hand): boolean {
    const o = this.state.objects.get(objectId);
    if (!o || player.status !== 'active') return false;
    if ((hand === 'left' ? player.heldLeft : player.heldRight) !== '') return false;
    if (o.holder && o.holder !== player.id) return false;
    if (dist(poseVec(handPose(player, hand)), [o.x, o.y, o.z]) > ObjectSystem.GRAB_REACH) return false;

    const verdict = this.mode()?.canGrab?.(this.ctx(), player, o, hand) ?? 'allow';
    if (verdict !== 'allow') return verdict === 'consumed';

    o.holder = player.id; o.hand = hand; o.status = 'carried';
    o.vx = o.vy = o.vz = 0;
    if (hand === 'left') player.heldLeft = o.id; else player.heldRight = o.id;
    this.mode()?.onGrabbed?.(this.ctx(), player, o);
    return true;
  }

  release(player: PlayerT, hand: Hand, pos: V3, vel: V3) {
    const id = hand === 'left' ? player.heldLeft : player.heldRight;
    const o = id ? this.state.objects.get(id) : undefined;
    if (!o || o.holder !== player.id) return;
    // Trust the claimed release point only near the player's tracked hand.
    const handAt = poseVec(handPose(player, hand));
    const at = dist(handAt, pos) < 1 ? pos : handAt;
    const max = this.tunables.player.maxThrowSpeed;
    const speed = Math.hypot(...vel);
    const k = speed > max ? max / speed : 1;
    this.clearHand(player.id, o.id);
    o.holder = ''; o.hand = '';
    [o.x, o.y, o.z] = at;
    [o.vx, o.vy, o.vz] = [vel[0] * k, vel[1] * k, vel[2] * k];
    o.status = 'flight';
    this.mode()?.onReleased?.(this.ctx(), player, o, speed > 1.5);
  }

  /** Drop everything a player holds at a point (KO, disconnect). */
  dropAll(player: PlayerT, at: V3) {
    for (const hand of ['left', 'right'] as Hand[]) {
      const id = hand === 'left' ? player.heldLeft : player.heldRight;
      const o = id ? this.state.objects.get(id) : undefined;
      if (!o) continue;
      this.clearHand(player.id, o.id);
      o.holder = ''; o.hand = '';
      [o.x, o.y, o.z] = [at[0], at[1] + Math.max(0.15, restHeight(o.kind, o.variant)), at[2]];
      o.vx = o.vy = o.vz = 0;
      o.status = 'dropped';
      this.mode()?.onReleased?.(this.ctx(), player, o, false);
    }
  }

  tick(dtMs: number) {
    const dt = dtMs / 1000;
    for (const o of this.state.objects.values()) {
      if (o.status === 'carried') {
        const p = this.state.players.get(o.holder);
        if (!p) continue;
        const h = handPose(p, o.hand as Hand);
        o.x = h.px; o.y = h.py; o.z = h.pz;
        continue;
      }
      if (o.status !== 'flight') continue;
      const before = roomAt(this.map, o.x, o.y, o.z);
      o.vy -= this.tunables.player.gravity * dt;
      const nx = o.x + o.vx * dt, ny = o.y + o.vy * dt, nz = o.z + o.vz * dt;
      const after = roomAt(this.map, nx, ny, nz);
      // Crude wall test: crossing into a room with no portal between stops horizontal motion.
      if (!after || (before && after.id !== before.id && !this.map.portals.some((p) =>
        (p.a === before.id && p.b === after.id) || (p.b === before.id && p.a === after.id)))) {
        o.vx = -o.vx * 0.2; o.vz = -o.vz * 0.2;
      } else { o.x = nx; o.z = nz; }
      const ground = groundHeightAt(this.map, o.x, o.y, o.z);
      const rest = restHeight(o.kind, o.variant);
      if (ny <= ground + rest) {
        o.y = ground + rest;
        o.vx = o.vy = o.vz = 0;
        o.status = o.kind === 'relic' ? 'dropped' : 'rest';
        this.mode()?.onLanded?.(this.ctx(), o);
      } else o.y = ny;
    }
  }
}

// ─── Breakables ──────────────────────────────────────────────────────────────
export interface BreakableOpts {
  hp?: number; variant?: string; value?: number; tool?: string; radius?: number; yaw?: number; parent?: string; locked?: boolean;
}

/**
 * One registry for everything that breaks (brief §20): CTR's glass cases and
 * Insurance Fraud's destructibles are the same system with different data.
 * Modes decide how much a hit does (breakableDamage) and what it is worth.
 */
export class BreakableSystem {
  private lastHit = new Map<string, number>();

  constructor(private state: PartyState, private tunables: Tunables, private ctx: () => ModeContext, private mode: () => ServerMode | null) {}

  add(id: string, kind: string, pos: V3, team: Team = '', o: BreakableOpts = {}) {
    const b = new BreakableT();
    b.id = id; b.kind = kind; b.team = team;
    b.hp = b.maxHp = o.hp ?? this.tunables.combat.glassHitsToShatter;
    b.variant = o.variant ?? ''; b.value = o.value ?? 0; b.tool = o.tool ?? '';
    b.radius = o.radius ?? 0; b.yaw = o.yaw ?? 0; b.parent = o.parent ?? ''; b.locked = !!o.locked;
    [b.x, b.y, b.z] = pos;
    this.state.breakables.set(id, b);
    return b;
  }

  reset(id: string) {
    const b = this.state.breakables.get(id);
    if (b) { b.stage = 0; b.hits = 0; b.hp = b.maxHp; }
  }

  removeAll() { this.state.breakables.clear(); }

  removeKind(kind: string) {
    for (const [id, b] of [...this.state.breakables.entries()]) if (b.kind === kind) this.state.breakables.delete(id);
  }

  /** A hit claim from a client. Validated against position, speed, cooldown and mode. */
  hit(player: PlayerT, id: string, hand: Hand, speed: number): boolean {
    const b = this.state.breakables.get(id);
    if (!b || b.stage >= 2 || player.status !== 'active') return false;
    const now = Date.now();
    if (now - (this.lastHit.get(player.id) ?? 0) < 300) return false;
    const holding = (hand === 'left' ? player.heldLeft : player.heldRight) !== '';
    if (dist(poseVec(handPose(player, hand)), [b.x, b.y, b.z]) > b.radius + 1.1 + (holding ? 0.6 : 0)) return false;
    if (speed < (holding ? this.tunables.combat.punchGlassSpeed * 0.7 : this.tunables.combat.punchGlassSpeed)) return false;
    const ctx = this.ctx();
    const mode = this.mode();
    let damage = 1;
    if (mode?.breakableDamage) damage = mode.breakableDamage(ctx, player, b, hand);
    else if (mode?.onBreakableHit && !mode.onBreakableHit(ctx, player, id)) damage = 0;
    if (damage <= 0) return false;
    this.lastHit.set(player.id, now);
    this.damage(id, damage, player);
    return true;
  }

  /** Apply damage (from a validated hit, or a server-side impact such as a thrown ball). */
  damage(id: string, amount: number, by: PlayerT) {
    const b = this.state.breakables.get(id);
    if (!b || b.stage >= 2) return;
    const before = b.hp;
    b.hits = Math.min(255, b.hits + 1);
    b.hp = Math.max(0, b.hp - amount);
    b.stage = b.hp <= 0 ? 2 : 1;
    const ctx = this.ctx();
    const pos: V3 = [b.x, b.y, b.z];
    if (b.kind === 'case') {
      if (b.stage === 1) ctx.broadcast('glassCracked', { id, pos });
      else {
        ctx.broadcast('glassShattered', { id, pos });
        ctx.broadcast('alarm', { id, pos, team: b.team as Team });
      }
    } else ctx.broadcast('smash', { id, pos, stage: b.stage, variant: b.variant });
    this.mode()?.onBreakableDamaged?.(ctx, by, b, before - b.hp);
    this.mode()?.onBreakableStage?.(ctx, by, id, b.stage);
  }
}

// ─── Combat and KO ───────────────────────────────────────────────────────────
export class CombatSystem {
  private lastHitAt = new Map<string, number>();

  constructor(
    private state: PartyState, private tunables: Tunables, private ctx: () => ModeContext,
    private mode: () => ServerMode | null, private objects: ObjectSystem,
  ) {}

  hit(attacker: PlayerT, target: PlayerT, kind: 'shove' | 'bonk', speed: number, dir: V3): boolean {
    if (attacker.id === target.id || target.status !== 'active') return false;
    if (attacker.team && attacker.team === target.team) return false; // no friendly fire
    const now = Date.now();
    const holding = attacker.heldLeft !== '' || attacker.heldRight !== '';
    const actualKind = kind === 'bonk' && holding ? 'bonk' : 'shove';
    const r = resolveHit(this.tunables.combat, now,
      { daze: attacker.daze, ko: attacker.status === 'ko', protectedUntil: 0, lastHitAt: this.lastHitAt.get(attacker.id) ?? 0 },
      { daze: target.daze, ko: false, protectedUntil: target.protectedUntil, lastHitAt: 0 },
      actualKind, speed, dist(poseVec(attacker.head), poseVec(target.head)));
    if (!r.ok) return false;
    this.lastHitAt.set(attacker.id, now);
    target.daze = r.daze;
    const ctx = this.ctx();
    const len = Math.hypot(dir[0], dir[2]) || 1;
    ctx.sendTo(target.id, 'knockback', { vel: [dir[0] / len * r.knockbackSpeed, 1.2, dir[2] / len * r.knockbackSpeed] });
    ctx.broadcast('hit', { attackerId: attacker.id, targetId: target.id, kind: actualKind, pos: poseVec(target.head) });
    if (r.ko) this.ko(target);
    return true;
  }

  ko(p: PlayerT) {
    if (p.status !== 'active') return;
    const ctx = this.ctx();
    const at = feetPos(p);
    const delay = this.mode()?.respawnDelaySec?.(ctx, p) ?? this.tunables.combat.respawnDelaySec;
    p.status = 'ko';
    p.daze = 1;
    p.koUntil = Date.now() + delay * 1000;
    this.objects.dropAll(p, at);
    this.mode()?.onKo?.(ctx, p, at);
    ctx.broadcast('ko', { playerId: p.id, pos: at });
  }

  tick(dtMs: number) {
    const now = Date.now();
    for (const p of this.state.players.values()) {
      if (p.status === 'active' && p.daze > 0) p.daze = drainDaze(this.tunables.combat, p.daze, dtMs / 1000);
      if (p.status === 'ko' && now >= p.koUntil) this.respawn(p);
    }
  }

  respawn(p: PlayerT) {
    const ctx = this.ctx();
    p.status = 'active';
    p.daze = 0;
    p.protectedUntil = Date.now() + this.tunables.combat.spawnProtectionSec * 1000;
    const mode = this.mode();
    ctx.teleport(p, mode ? mode.spawnFor(ctx, p) : ctx.map.spawns.lobby[0]);
  }
}

// ─── NPC agents ──────────────────────────────────────────────────────────────
/**
 * Synced NPCs (brief §17). Modes simulate their agents with the shared rules
 * (shared/rules/agents.ts) and publish positions here at the agent tick rate;
 * clients interpolate and draw them instanced.
 */
export class AgentSystem {
  constructor(private state: PartyState) {}

  /** Replace the synced set with `list` (adds, updates and removes). */
  sync(list: { id: string; kind: number; mood: number; x: number; y: number; z: number; yaw: number }[]) {
    const seen = new Set<string>();
    for (const a of list) {
      seen.add(a.id);
      let s = this.state.agents.get(a.id);
      if (!s) { s = new AgentT(); s.id = a.id; s.kind = a.kind; this.state.agents.set(a.id, s); }
      s.mood = a.mood;
      s.x = a.x; s.y = a.y; s.z = a.z; s.yaw = a.yaw;
    }
    for (const id of [...this.state.agents.keys()]) if (!seen.has(id)) this.state.agents.delete(id);
  }

  clear() { this.state.agents.clear(); }
}

// ─── Teams ───────────────────────────────────────────────────────────────────
export class TeamSystem {
  constructor(private state: PartyState) {}

  count(team: Team) {
    let n = 0;
    for (const p of this.state.players.values()) if (p.team === team && p.status !== 'spectating') n++;
    return n;
  }

  /** Shuffle everyone into A/B as evenly as possible. */
  assignBalanced(rand = Math.random) {
    const ps = [...this.state.players.values()].sort(() => rand() - 0.5);
    ps.forEach((p, i) => (p.team = i % 2 === 0 ? 'A' : 'B'));
  }

  /** Team with fewer players; random when even (brief §12.3). */
  smaller(rand = Math.random): Team {
    const a = this.count('A'), b = this.count('B');
    if (a === b) return rand() < 0.5 ? 'A' : 'B';
    return a < b ? 'A' : 'B';
  }

  clear() { for (const p of this.state.players.values()) p.team = ''; }
}

export { PoseT };
