import {
  AGENT_KINDS, AgentNav, DESTRUCTIBLE_CENTER, DESTRUCTIBLE_NAME, MOODS, canDamage, hitDamage, money, routeOnFloor,
  securityLevel, splitUltraCredit, type Hand, type Spawn,
} from '@museum/shared';
import type { BreakableT, ObjectT, PlayerT } from '../../state/schema.js';
import { feetPos } from '../../systems/index.js';
import type { ModeContext, RoundResult, ServerMode } from '../types.js';

const OFFICE: Spawn = { id: 'securityOffice', pos: [29.5, -6, 3], yaw: Math.PI / 2 };
const GUARD_POST: [number, number] = [25.5, -8];

interface Guard { id: string; x: number; z: number; r: number; yaw: number; target: string; route: [number, number][]; routeAt: number }
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
  let nextGuard = 1;
  let agentAcc = 0;
  const heat = new Map<string, Heat>();
  const earned = new Map<string, number>();
  /** Ultra id → player id → anchors loosened. */
  const steps = new Map<string, Record<string, number>>();
  const tools = new Map<string, ToolState>();
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
    ctx.teleport(p, OFFICE);
    ctx.sendTo(p.id, 'announcement', { text: `Caught! Security is holding you for ${cfg(ctx).securityHoldSec} seconds.`, tone: 'bad' });
    for (const o of ctx.players()) if (o.id !== p.id) ctx.sendTo(o.id, 'announcement', { text: `${p.name} was caught by security!`, tone: 'good' });
    for (const g of guards) if (g.target === p.id) g.target = '';
  }

  function updateSecurity(ctx: ModeContext, dt: number) {
    const c = cfg(ctx), now = ctx.now();
    for (const p of ctx.players()) {
      const h = heatOf(p.id);
      if (now - h.lastDamageAt > c.lieLowSec * 1000) h.heat = Math.max(0, h.heat - c.heatDecayPerSec * dt);
      const level = p.status === 'active' ? securityLevel(c, h.heat) : 0;
      if (level > h.level) {
        const what = ['', 'Security has noticed you.', 'Security level 2: everyone can see where you are.', 'Security level 3: alarms!', 'Security level 4: guards are coming!', 'Security level 5: guards at full speed!'][level];
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

  function updateGuards(ctx: ModeContext, dt: number) {
    if (!nav) return;
    const c = cfg(ctx), now = ctx.now();
    const onFloor = (p: PlayerT) => Math.abs(p.feetY - nav!.floorY) < 1.2 && !!nav!.roomAt(p.head.px, p.head.pz);
    const wanted = ctx.players().filter((p) => p.status === 'active' && p.wanted >= 4).sort((a, b) => b.wanted - a.wanted);
    // One guard per wanted player, up to the cap.
    while (guards.filter((g) => g.target).length < Math.min(c.maxGuards, wanted.length)) {
      const free = wanted.find((p) => !guards.some((g) => g.target === p.id));
      if (!free) break;
      let g = guards.find((x) => !x.target);
      if (!g) { g = { id: `guard${nextGuard++}`, x: GUARD_POST[0], z: GUARD_POST[1], r: 0.3, yaw: 0, target: '', route: [], routeAt: 0 }; guards.push(g); }
      g.target = free.id; g.routeAt = 0;
      ctx.sendTo(free.id, 'announcement', { text: 'A guard is after you! Lie low or run!', tone: 'alert' });
    }
    for (const g of guards) {
      const p = g.target ? ctx.player(g.target) : undefined;
      // A guard on your tail keeps coming until you have really lain low (level 2 or less).
      if (g.target && (!p || p.status !== 'active' || p.wanted < 3)) g.target = '';
      let goal: [number, number] = GUARD_POST;
      if (p && g.target) goal = [p.head.px, p.head.pz];
      if (now >= g.routeAt) { g.route = routeOnFloor(nav, g.x, g.z, goal[0], goal[1]); g.routeAt = now + 1000; }
      const next = g.route[0];
      if (next) {
        const speed = p && p.wanted >= 5 ? c.guardSpeedMax : c.guardSpeed;
        const dx = next[0] - g.x, dz = next[1] - g.z, d = Math.hypot(dx, dz);
        const step = Math.min(d, speed * dt);
        if (d > 1e-3) {
          nav.step(g, g.x + (dx / d) * step, g.z + (dz / d) * step);
          g.yaw = Math.atan2(-dx, -dz);
        }
        if (Math.hypot(next[0] - g.x, next[1] - g.z) < 0.6) g.route.shift();
      }
      if (p && g.target && onFloor(p) && Math.hypot(p.head.px - g.x, p.head.pz - g.z) < c.catchRadius) caught(ctx, p);
    }
    // Guards with nobody to chase go back to their post and stand down.
    guards = guards.filter((g) => g.target || Math.hypot(g.x - GUARD_POST[0], g.z - GUARD_POST[1]) > 1.5);
  }

  function syncGuards(ctx: ModeContext) {
    const guard = AGENT_KINDS.indexOf('guard');
    ctx.systems.agents.sync(guards.map((g) => ({
      id: g.id, kind: guard, mood: MOODS.indexOf(g.target ? 'alert' : 'ok'), x: g.x, y: nav!.floorY, z: g.z, yaw: g.yaw,
    })));
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
      guards = []; nextGuard = 1; agentAcc = 0;
      heat.clear(); earned.clear(); steps.clear(); tools.clear(); restocks.clear(); pending.length = 0;
      nav = new AgentNav(ctx.map);
      const c = cfg(ctx);
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
    onPlayerLeave(ctx, p) { for (const g of guards) if (g.target === p.id) g.target = ''; },

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
      ctx.systems.breakables.damage(hitId, dmg, p);
      if (--t.uses <= 0) { ctx.sendTo(p.id, 'announcement', { text: 'The stone ball cracked in half!', tone: 'bad' }); retireTool(ctx, o.id); }
    },

    tick(ctx, dtMs) {
      if (result) return;
      const dt = dtMs / 1000, now = ctx.now();
      for (const p of ctx.players()) if (p.status === 'held' && now >= p.koUntil) {
        p.status = 'active';
        ctx.sendTo(p.id, 'announcement', { text: 'Released. Find your way back upstairs!', tone: 'info' });
      }
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
      nav = null;
      ctx.systems.agents.clear();
      ctx.systems.breakables.removeKind('destructible');
      ctx.systems.objects.removeKind('tool');
      for (const p of ctx.players()) {
        p.wanted = 0;
        if (p.status === 'held') p.status = 'active';
      }
    },
  };
  return mode;
}
