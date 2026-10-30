import {
  AGENT_KINDS, AgentNav, DESTRUCTIBLE_CENTER, DESTRUCTIBLE_NAME, MOODS, canDamage, hitDamage, inSight, money, routeOnFloor,
  securityLevel, splitUltraCredit, toolClass, type Hand, type Spawn,
} from '@museum/shared';
import type { BreakableT, ObjectT, PlayerT } from '../../state/schema.js';
import { feetPos } from '../../systems/index.js';
import type { ModeContext, RoundResult, ServerMode } from '../types.js';

const OFFICE: Spawn = { id: 'securityOffice', pos: [29.5, -6, 3], yaw: Math.PI / 2 };
/** Where guards start their rounds: ground floor, then the upstairs galleries. */
const GROUND_POSTS: [number, number][] = [[25.5, -8], [-12, -18], [-40, 3], [5, 30], [-40, -30]];
const UPPER_POSTS: [number, number][] = [[-31.5, 0], [-50.5, -20]];

type GuardState = 'patrol' | 'investigate' | 'chase' | 'search';
interface Guard {
  id: string; nav: AgentNav; x: number; z: number; r: number;
  /** Where the guard is looking (the vision cone), and the way it walks. */
  yaw: number; walkYaw: number;
  state: GuardState; target: string;
  goal: [number, number]; route: [number, number][]; routeAt: number;
  /** Standing and looking round until this time. */
  lookUntil: number;
  lastSeenAt: number;
  /** Strikes seen or heard, per player, with when they last happened. */
  suspicion: Map<string, { n: number; at: number }>;
  side?: number;
}
interface Heat { heat: number; lastDamageAt: number; nextAlarmAt: number; level: number; lastSwing: number; nagAt: number }
interface ToolState { uses: number; slot: string; thrower: string }

/**
 * Insurance Fraud (brief §18): competitive timed destruction. Every
 * destructible has an insured value, hit points and a tool requirement;
 * tools break; damage raises your Security Level until guards come for you.
 * Rules and numbers live in shared/rules/fraud.ts and tunables.ts.
 */
export function createFraudMode(): ServerMode {
  let result: RoundResult | null = null;
  let nav: AgentNav | null = null;
  let guards: Guard[] = [];
  let navUpper: AgentNav | null = null;
  let agentAcc = 0;
  const heat = new Map<string, Heat>();
  const earned = new Map<string, number>();
  /** Ultra id → player id → anchors loosened. */
  const steps = new Map<string, Record<string, number>>();
  const tools = new Map<string, ToolState>();
  /** The tool behind a player's latest strike (a thrown ball isn't in the hand any more). */
  const lastTool = new Map<string, string>();
  const restocks = new Map<string, number>();
  const pending: { slot: string; at: number }[] = [];

  const cfg = (ctx: ModeContext) => ctx.tunables.insuranceFraud;
  const heatOf = (id: string) => {
    let h = heat.get(id);
    if (!h) { h = { heat: 0, lastDamageAt: 0, nextAlarmAt: 0, level: 0, lastSwing: 0, nagAt: 0 }; heat.set(id, h); }
    return h;
  };
  const nag = (ctx: ModeContext, p: PlayerT, text: string) => {
    const h = heatOf(p.id);
    if (ctx.now() < h.nagAt) return;
    h.nagAt = ctx.now() + 2500;
    ctx.sendTo(p.id, 'announcement', { text, tone: 'info' });
  };

  function spawnTool(ctx: ModeContext, slotId: string) {
    const slot = ctx.map.slots.find((s) => s.id === slotId)!;
    const n = (restocks.get(slotId) ?? 0);
    const id = n ? `${slotId}#${n + 1}` : slotId;
    const y = slot.pos[1] + (slot.variant === 'ball' ? 0.25 : 0.45);
    ctx.systems.objects.spawn(id, 'tool', slot.variant!, [slot.pos[0], y, slot.pos[2]]);
    tools.set(id, { uses: cfg(ctx).tools[slot.variant!].durability, slot: slotId, thrower: '' });
  }

  /** A tool broke or was lost for good: maybe restock its rack later. */
  function retireTool(ctx: ModeContext, id: string) {
    const t = tools.get(id);
    ctx.systems.objects.remove(id);
    tools.delete(id);
    if (!t) return;
    const used = restocks.get(t.slot) ?? 0;
    if (used < cfg(ctx).toolRestocks) {
      restocks.set(t.slot, used + 1);
      pending.push({ slot: t.slot, at: ctx.now() + cfg(ctx).toolRespawnSec * 1000 });
    }
  }

  function heldTool(ctx: ModeContext, p: PlayerT, hand: Hand): ObjectT | undefined {
    const id = hand === 'left' ? p.heldLeft : p.heldRight;
    const o = id ? ctx.state.objects.get(id) : undefined;
    return o?.kind === 'tool' ? o : undefined;
  }

  function credit(ctx: ModeContext, playerId: string, amount: number, at: [number, number, number]) {
    if (amount <= 0) return;
    const total = (earned.get(playerId) ?? 0) + amount;
    earned.set(playerId, total);
    const p = ctx.player(playerId);
    if (p) p.score = Math.round(total);
    const h = heatOf(playerId);
    h.heat += amount;
    ctx.broadcast('payout', { playerId, amount, pos: at });
  }

  function caught(ctx: ModeContext, p: PlayerT) {
    ctx.systems.objects.dropAll(p, feetPos(p));
    const h = heatOf(p.id);
    h.heat = 0; h.level = 0; p.wanted = 0;
    p.status = 'held';
    p.koUntil = ctx.now() + cfg(ctx).securityHoldSec * 1000;
    // Thrown in the cells downstairs (the security office), doors locked until your time is up.
    ctx.teleport(p, OFFICE);
    setCells(ctx, false);
    ctx.sendTo(p.id, 'announcement', { text: `Caught! You're locked in the cells for ${cfg(ctx).securityHoldSec} seconds.`, tone: 'bad' });
    for (const o of ctx.players()) if (o.id !== p.id) ctx.sendTo(o.id, 'announcement', { text: `${p.name} was caught by security!`, tone: 'good' });
    for (const g of guards) if (g.target === p.id) { g.target = ''; g.state = 'patrol'; g.suspicion.delete(p.id); }
  }

  /** The cell doors: locked while anyone is held. */
  function setCells(ctx: ModeContext, open: boolean) {
    for (const d of ctx.map.doors) if (d.style === 'jail') { const st = ctx.state.doors.get(d.id); if (st) st.open = open; }
  }

  const floorOf = (g: Guard) => g.nav.floorY;
  const onFloor = (g: Guard, p: PlayerT) => p.status === 'active' && Math.abs(p.feetY - floorOf(g)) < 1.2 && !!g.nav.roomAt(p.head.px, p.head.pz);
  const sees = (ctx: ModeContext, g: Guard, p: PlayerT) => {
    const c = cfg(ctx).guards;
    return onFloor(g, p) && inSight(g.nav, g, p.head.px, p.head.pz, c.sightRange, c.sightHalfAngleDeg);
  };

  /** A random walkable spot in a random room on the guard's floor. */
  function patrolGoal(g: Guard): [number, number] {
    const rooms = g.nav.rooms;
    for (let i = 0; i < 20; i++) {
      const r = rooms[Math.floor(Math.random() * rooms.length)];
      const x = r.x0 + 1 + Math.random() * (r.x1 - r.x0 - 2), z = r.z0 + 1 + Math.random() * (r.z1 - r.z0 - 2);
      if (g.nav.openAt(x, z)) return [x, z];
    }
    return [g.x, g.z];
  }

  /** A strike someone made: guards who see it or hear it close by get suspicious; enough and they give chase. */
  function noticeStrike(ctx: ModeContext, p: PlayerT, tool: string | null) {
    const c = cfg(ctx).guards, now = ctx.now();
    const cls = toolClass(cfg(ctx), tool);
    const hear = cls === 'heavy' ? c.hearHeavy : cls === 'tool' ? c.hearTool : c.hearHands;
    for (const g of guards) {
      if (!onFloor(g, p)) continue;
      const seen = sees(ctx, g, p);
      const heard = Math.hypot(p.head.px - g.x, p.head.pz - g.z) <= hear;
      if (!seen && !heard) continue;
      const prev = g.suspicion.get(p.id);
      const n = (prev && now - prev.at < c.memorySec * 1000 ? prev.n : 0) + 1;
      g.suspicion.set(p.id, { n, at: now });
      if (g.state === 'chase') continue;
      if (n >= c.strikesToChase) {
        g.state = 'chase'; g.target = p.id; g.lastSeenAt = now; g.routeAt = 0;
        ctx.sendTo(p.id, 'announcement', { text: 'A guard is chasing you! Sprint, or break their line of sight.', tone: 'alert' });
      } else {
        // First strike: they come to look (and turn to face the noise).
        g.state = 'investigate'; g.goal = [p.head.px, p.head.pz]; g.routeAt = 0; g.lookUntil = 0;
        ctx.sendTo(p.id, 'announcement', { text: seen ? 'A guard saw that! One more and they come for you.' : 'A guard heard that and is coming to look…', tone: 'bad' });
      }
    }
  }

  function updateSecurity(ctx: ModeContext, dt: number) {
    const c = cfg(ctx), now = ctx.now();
    for (const p of ctx.players()) {
      const h = heatOf(p.id);
      if (now - h.lastDamageAt > c.lieLowSec * 1000) h.heat = Math.max(0, h.heat - c.heatDecayPerSec * dt);
      const level = p.status === 'active' ? securityLevel(c, h.heat) : 0;
      if (level > h.level) {
        const what = ['', 'Security has noticed you.', 'Security level 2: everyone can see where you are.', 'Security level 3: alarms!', 'Security level 4: alarms all over the museum!', 'Security level 5: the most wanted visitor tonight!'][level];
        ctx.sendTo(p.id, 'announcement', { text: what, tone: level >= 4 ? 'alert' : 'bad' });
        if (level === 2) for (const o of ctx.players()) if (o.id !== p.id) ctx.sendTo(o.id, 'announcement', { text: `${p.name} is wanted!`, tone: 'info' });
      }
      h.level = level;
      p.wanted = level;
      if (level >= 3 && now >= h.nextAlarmAt) {
        h.nextAlarmAt = now + c.alarmEverySec * 1000;
        ctx.broadcast('alarm', { id: p.id, pos: feetPos(p), team: '' });
      }
    }
  }

  /** Patrol, investigate noises, chase what they saw, search where they lost you. */
  function updateGuards(ctx: ModeContext, dt: number) {
    const c = cfg(ctx), gc = c.guards, now = ctx.now();
    for (const p of ctx.players()) p.seen = false;
    for (const g of guards) {
      for (const p of ctx.players()) if (sees(ctx, g, p)) p.seen = true;
      const target = g.target ? ctx.player(g.target) : undefined;
      // Chasing: keep after them while they're in sight; lose them and go and search where they were.
      if (g.state === 'chase') {
        if (!target || target.status !== 'active' || !onFloor(g, target)) { g.state = 'search'; g.routeAt = 0; g.lookUntil = 0; }
        else if (sees(ctx, g, target)) { g.lastSeenAt = now; g.goal = [target.head.px, target.head.pz]; }
        else if (now - g.lastSeenAt > gc.loseSightSec * 1000) {
          g.state = 'search'; g.routeAt = 0; g.lookUntil = 0;
          ctx.sendTo(target.id, 'announcement', { text: 'You lost the guard. They are searching where they last saw you.', tone: 'good' });
        } else g.goal = [target.head.px, target.head.pz]; // they keep heading your way for a moment
        if (target && g.state === 'chase' && Math.hypot(target.head.px - g.x, target.head.pz - g.z) < c.catchRadius) { caught(ctx, target); continue; }
      }
      if (g.state === 'patrol' && g.route.length === 0 && now >= g.lookUntil) { g.goal = patrolGoal(g); g.routeAt = 0; }
      // Walk.
      if (now >= g.routeAt) { g.route = routeOnFloor(g.nav, g.x, g.z, g.goal[0], g.goal[1]); g.routeAt = now + (g.state === 'chase' ? 700 : 4000); }
      const speed = g.state === 'chase' ? gc.chaseSpeed : g.state === 'patrol' ? gc.patrolSpeed : gc.investigateSpeed;
      const next = g.route[0];
      if (next && now >= g.lookUntil) {
        const dx = next[0] - g.x, dz = next[1] - g.z, d = Math.hypot(dx, dz);
        if (d > 1e-3) { g.nav.step(g, g.x + (dx / d) * Math.min(d, speed * dt), g.z + (dz / d) * Math.min(d, speed * dt)); g.walkYaw = Math.atan2(-dx, -dz); }
        if (Math.hypot(next[0] - g.x, next[1] - g.z) < 0.6) g.route.shift();
        if (!g.route.length && g.state !== 'chase') {
          // Arrived: look round a while. Investigations and searches end back on patrol.
          g.lookUntil = now + (g.state === 'patrol' ? 2500 : gc.searchSec * 1000);
          if (g.state === 'investigate' || g.state === 'search') {
            if (g.state === 'search' && g.target) g.suspicion.delete(g.target);
            g.state = 'patrol'; g.target = '';
          }
        }
      }
      // Where they look: ahead while walking (with a gentle scan), sweeping wide while standing; straight at you when chasing.
      const standing = now < g.lookUntil || !g.route.length;
      let look = g.walkYaw + Math.sin(now / 900 + g.x) * (standing ? 1.1 : 0.35);
      if (g.state === 'chase' && target && sees(ctx, g, target)) look = Math.atan2(-(target.head.px - g.x), -(target.head.pz - g.z));
      let dy = look - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.yaw += dy * Math.min(1, dt * 4);
    }
  }

  function syncGuards(ctx: ModeContext) {
    const guard = AGENT_KINDS.indexOf('guard');
    const mood = (g: Guard) => MOODS.indexOf(g.state === 'chase' ? 'alert' : g.state === 'patrol' ? 'ok' : 'waiting');
    ctx.systems.agents.sync(guards.map((g) => ({ id: g.id, kind: guard, mood: mood(g), x: g.x, y: floorOf(g), z: g.z, yaw: g.yaw })));
  }

  function finish(ctx: ModeContext) {
    if (result) return;
    const ranked = ctx.players().filter((p) => p.status !== 'spectating').sort((a, b) => (earned.get(b.id) ?? 0) - (earned.get(a.id) ?? 0));
    const top = ranked[0];
    const best = top ? earned.get(top.id) ?? 0 : 0;
    const tie = ranked.length > 1 && Math.round(earned.get(ranked[1].id) ?? 0) === Math.round(best);
    const summary = !top || best <= 0 ? 'The museum is closing. Nothing was damaged. Suspicious.'
      : tie ? `The museum is closing. It's a tie at ${money(best)} of insured damage!`
      : `The museum is closing. ${top.name} wins with ${money(best)} of insured damage!`;
    result = { summary, winner: tie || !top ? undefined : top.id };
  }

  const mode: ServerMode = {
    id: 'insuranceFraud',
    minPlayers: 1,
    maxPlayers: 4,
    // A timed score contest is unfair to join halfway (brief §12.3).
    joinPolicy: 'spectateUntilNextRound',
    timeLimitSec: (ctx) => cfg(ctx).timeLimitSec,

    onEnter(ctx) {
      result = null;
      guards = []; agentAcc = 0;
      heat.clear(); earned.clear(); steps.clear(); tools.clear(); restocks.clear(); pending.length = 0;
      nav = new AgentNav(ctx.map);
      navUpper = new AgentNav(ctx.map, 8);
      const c = cfg(ctx);
      // Guards on patrol from the start: the ground floor and the upstairs galleries.
      const add = (n: AgentNav, posts: [number, number][], count: number) => {
        for (let i = 0; i < count; i++) {
          const [x, z] = posts[i % posts.length];
          const g: Guard = { id: `guard${guards.length + 1}`, nav: n, x, z, r: 0.3, yaw: 0, walkYaw: 0, state: 'patrol', target: '', goal: [x, z], route: [], routeAt: 0, lookUntil: 0, lastSeenAt: 0, suspicion: new Map() };
          g.goal = patrolGoal(g);
          guards.push(g);
        }
      };
      add(nav, GROUND_POSTS, c.guards.ground);
      add(navUpper, UPPER_POSTS, c.guards.upper);
      setCells(ctx, true);
      const slots = ctx.map.slots;
      for (const s of slots.filter((x) => x.kind === 'destructible')) {
        const cat = c.catalogue[s.variant!];
        const hasAnchors = slots.some((a) => a.parent === s.id);
        ctx.systems.breakables.add(s.id, 'destructible', [s.pos[0], s.pos[1] + (DESTRUCTIBLE_CENTER[s.variant!] ?? 1), s.pos[2]], '', {
          hp: cat.hp, variant: s.variant, value: cat.value, tool: cat.tool, radius: cat.radius, yaw: s.yaw ?? 0, parent: s.parent, locked: hasAnchors,
        });
        if (hasAnchors) steps.set(s.id, {});
      }
      for (const s of slots.filter((x) => x.kind === 'tool')) spawnTool(ctx, s.id);
      ctx.systems.teams.clear();
      for (const p of ctx.players()) { p.score = 0; p.wanted = 0; ctx.teleport(p, mode.spawnFor(ctx, p)); }
    },

    onPlayerJoin(ctx, p) { ctx.teleport(p, mode.spawnFor(ctx, p)); },
    onPlayerLeave(_ctx, p) { for (const g of guards) if (g.target === p.id) { g.target = ''; g.state = 'patrol'; } },

    spawnFor(ctx, p: PlayerT): Spawn {
      const list = ctx.map.spawns.lobby;
      const order = ctx.players().sort((a, b) => a.joinedAt - b.joinedAt).indexOf(p);
      return list[Math.max(0, order) % list.length];
    },

    breakableDamage(ctx, p, b, hand) {
      if (b.kind !== 'destructible') return 1;
      const c = cfg(ctx);
      if (b.locked) { nag(ctx, p, `The ${DESTRUCTIBLE_NAME[b.variant]} is anchored down. Loosen its three anchors first.`); return 0; }
      const tool = heldTool(ctx, p, hand);
      const variant = tool?.variant ?? null;
      lastTool.set(p.id, variant ?? '');
      if (!canDamage(c, variant, b.variant)) {
        nag(ctx, p, b.tool === 'heavy' ? 'Too sturdy! You need a heavy tool: an axe, the sledgehammer or the stone ball.' : 'Too sturdy for bare hands. Find a tool.');
        return 0;
      }
      // Each tool swings only so fast (the sledgehammer is slow).
      const h = heatOf(p.id), now = ctx.now();
      const swing = (variant ? c.tools[variant].swingSec : c.handSwingSec) * 1000;
      if (now - h.lastSwing < swing * 0.8) return 0;
      h.lastSwing = now;
      if (tool) {
        const t = tools.get(tool.id);
        if (t && --t.uses <= 0) {
          ctx.sendTo(p.id, 'announcement', { text: `Your ${variant} broke!`, tone: 'bad' });
          retireTool(ctx, tool.id);
        }
      }
      return hitDamage(c, variant, b.variant);
    },

    onBreakableDamaged(ctx, p, b: BreakableT, damage) {
      if (b.kind !== 'destructible') return;
      const c = cfg(ctx), now = ctx.now();
      const h = heatOf(p.id);
      h.lastDamageAt = now;
      noticeStrike(ctx, p, lastTool.get(p.id) || null);
      const at: [number, number, number] = [b.x, b.y, b.z];
      if (b.variant === 'anchor') {
        if (b.stage < 2) return;
        const s = steps.get(b.parent)!;
        s[p.id] = (s[p.id] ?? 0) + 1;
        h.heat += c.anchorHeat;
        const left = [...ctx.state.breakables.values()].filter((x) => x.parent === b.parent && x.stage < 2).length;
        const ultra = ctx.state.breakables.get(b.parent);
        if (!ultra) return;
        const name = DESTRUCTIBLE_NAME[ultra.variant];
        if (left === 0) {
          ultra.locked = false;
          ctx.announce(`The ${name} is loose! ${money(ultra.value)} for whoever brings it down.`, 'alert');
        } else ctx.sendTo(p.id, 'announcement', { text: `Anchor loosened: ${left} to go on the ${name}.`, tone: 'info' });
        return;
      }
      if (steps.has(b.id)) {
        if (b.stage < 2) return;
        const split = splitUltraCredit(b.value, p.id, steps.get(b.id)!, c.ultraFinalShare);
        for (const [id, amount] of Object.entries(split)) credit(ctx, id, amount, at);
        ctx.announce(`${p.name} brought down the ${DESTRUCTIBLE_NAME[b.variant]}! ${money(b.value)}!`, 'good');
        return;
      }
      credit(ctx, p.id, (b.value * damage) / b.maxHp, at);
    },

    onReleased(ctx, p, o, thrown) {
      const t = tools.get(o.id);
      if (t) t.thrower = thrown ? p.id : '';
    },

    // The stone ball smashes what it lands on.
    onLanded(ctx, o) {
      const t = tools.get(o.id);
      if (!t || o.variant !== 'ball' || !t.thrower) return;
      const p = ctx.player(t.thrower);
      t.thrower = '';
      if (!p || p.status !== 'active') return;
      let hitId = '', best = Infinity;
      for (const b of ctx.state.breakables.values()) {
        if (b.kind !== 'destructible' || b.stage >= 2 || b.locked || Math.abs(b.y - o.y) > 3) continue;
        const d = Math.hypot(b.x - o.x, b.z - o.z) - b.radius;
        if (d < 1.0 && d < best) { best = d; hitId = b.id; }
      }
      if (!hitId) return;
      const dmg = hitDamage(cfg(ctx), 'ball', ctx.state.breakables.get(hitId)!.variant);
      if (dmg <= 0) return;
      lastTool.set(p.id, 'ball');
      ctx.systems.breakables.damage(hitId, dmg, p);
      if (--t.uses <= 0) { ctx.sendTo(p.id, 'announcement', { text: 'The stone ball cracked in half!', tone: 'bad' }); retireTool(ctx, o.id); }
    },

    tick(ctx, dtMs) {
      if (result) return;
      const dt = dtMs / 1000, now = ctx.now();
      for (const p of ctx.players()) if (p.status === 'held' && now >= p.koUntil) {
        p.status = 'active';
        ctx.sendTo(p.id, 'announcement', { text: 'The cell doors open. Find your way back upstairs!', tone: 'info' });
      }
      setCells(ctx, !ctx.players().some((p) => p.status === 'held'));
      for (let i = pending.length - 1; i >= 0; i--) if (now >= pending[i].at) { spawnTool(ctx, pending[i].slot); pending.splice(i, 1); }
      // Tools that fall out of the world go back on their rack.
      for (const [id] of tools) { const o = ctx.state.objects.get(id); if (o && o.y < -20) retireTool(ctx, id); }
      updateSecurity(ctx, dt);
      updateGuards(ctx, dt);
      agentAcc += dt;
      if (agentAcc >= 1 / ctx.tunables.net.agentTickHz) { agentAcc = 0; syncGuards(ctx); }
    },

    onTimeUp(ctx) { finish(ctx); },
    isRoundOver: () => result,

    onExit(ctx) {
      result = null;
      guards = [];
      nav = null; navUpper = null;
      setCells(ctx, true);
      ctx.systems.agents.clear();
      ctx.systems.breakables.removeKind('destructible');
      ctx.systems.objects.removeKind('tool');
      for (const p of ctx.players()) {
        p.wanted = 0; p.seen = false;
        if (p.status === 'held') p.status = 'active';
      }
    },
  };
  return mode;
}
