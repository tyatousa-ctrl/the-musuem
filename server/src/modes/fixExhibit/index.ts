import { AgentNav, DESTRUCTIBLE_CENTER, type Slot, type Spawn } from '@museum/shared';
import type { ObjectT, PlayerT } from '../../state/schema.js';
import type { ModeContext, RoundResult, ServerMode } from '../types.js';

const ROOM = 'sculptureCourt';

/**
 * Fix the Exhibit: memorise the Sculpture Court for 10 s, eyes close for 3 s,
 * then put your jumbled room back in 2 minutes. Pieces released within a
 * foot of their spot click into place. Everyone plays the same layout at the
 * same time, but each player has their own private set of pieces (only they
 * can see or move them), their own jumble, and cannot see the other players.
 */
export function createFixExhibitMode(): ServerMode {
  let result: RoundResult | null = null;
  let nav: AgentNav | null = null;
  let started = false;

  const cfg = (ctx: ModeContext) => ctx.tunables.fixExhibit;
  const exhibits = (ctx: ModeContext) => ctx.map.slots.filter((s) => s.kind === 'exhibit');
  const pieceId = (playerId: string, slot: Slot) => `${playerId}:${slot.id}`;
  const slotOf = (ctx: ModeContext, o: ObjectT) => exhibits(ctx).find((s) => o.id.endsWith(`:${s.id}`));
  /** Grab point above the floor (pieces use the destructible models). */
  const center = (_ctx: ModeContext, s: Slot) => DESTRUCTIBLE_CENTER[s.variant!] ?? 1;

  function setPhase(ctx: ModeContext, phase: string, sec: number) {
    ctx.state.modePhase = phase;
    ctx.state.modePhaseEndsAt = ctx.now() + sec * 1000;
  }

  function spawnPieces(ctx: ModeContext, p: PlayerT) {
    for (const s of exhibits(ctx)) {
      const o = ctx.systems.objects.spawn(pieceId(p.id, s), 'piece', s.variant!, [s.pos[0], s.pos[1] + center(ctx, s), s.pos[2]], { status: 'home' });
      o.owner = p.id;
      o.yaw = s.yaw ?? 0;
    }
  }

  /** Move one player's pieces to random free spots, each well away from where it belongs. */
  function jumble(ctx: ModeContext, p: PlayerT) {
    const c = cfg(ctx);
    const room = ctx.map.rooms.find((r) => r.id === ROOM)!;
    const spawns = ctx.map.spawns.exhibit;
    const spots: [number, number][] = [];
    for (let x = room.x0 + 1.5; x <= room.x1 - 1.5; x += 1) for (let z = room.z0 + 1.5; z <= room.z1 - 1.5; z += 1) {
      if (!nav!.standable(x, z, 0.75) || nav!.roomAt(x, z)?.id !== ROOM) continue;
      if (spawns.some((sp) => Math.hypot(sp.pos[0] - x, sp.pos[2] - z) < 2.5)) continue;
      spots.push([x, z]);
    }
    const used: [number, number][] = [];
    for (const s of exhibits(ctx)) {
      const o = ctx.state.objects.get(pieceId(p.id, s));
      if (!o) continue;
      const ok = spots.filter(([x, z]) => Math.hypot(x - s.pos[0], z - s.pos[2]) >= c.minJumbleDist && used.every(([ux, uz]) => Math.hypot(ux - x, uz - z) > 1.6));
      const pick = ok[Math.floor(Math.random() * ok.length)] ?? spots[Math.floor(Math.random() * spots.length)];
      used.push(pick);
      ctx.systems.objects.place(o.id, [pick[0], s.pos[1] + center(ctx, s), pick[1]], 'rest');
    }
  }

  function trySnap(ctx: ModeContext, o: ObjectT): boolean {
    const s = slotOf(ctx, o);
    if (!s || o.status === 'home') return false;
    if (Math.hypot(o.x - s.pos[0], o.z - s.pos[2]) > cfg(ctx).snapRadius) return false;
    const at: [number, number, number] = [s.pos[0], s.pos[1] + center(ctx, s), s.pos[2]];
    ctx.systems.objects.place(o.id, at, 'home');
    o.yaw = s.yaw ?? 0;
    ctx.sendTo(o.owner, 'snap', { id: o.id, pos: at });
    return true;
  }

  /** 0..100: placed pieces count fully; the rest by how close they are. */
  function score(ctx: ModeContext, p: PlayerT): number {
    const c = cfg(ctx);
    const list = exhibits(ctx);
    let sum = 0;
    for (const s of list) {
      const o = ctx.state.objects.get(pieceId(p.id, s));
      if (!o) continue;
      if (o.status === 'home') { sum += 1; continue; }
      sum += Math.max(0, 1 - Math.hypot(o.x - s.pos[0], o.z - s.pos[2]) / c.scoreFalloff);
    }
    return Math.round((100 * sum) / Math.max(1, list.length));
  }

  function finish(ctx: ModeContext) {
    const ranked = ctx.players().filter((p) => p.status !== 'spectating').map((p) => ({ p, pct: score(ctx, p) })).sort((a, b) => b.pct - a.pct);
    for (const { p, pct } of ranked) {
      p.score = pct;
      ctx.sendTo(p.id, 'announcement', { text: `You restored ${pct}% of the exhibit.`, tone: pct >= 80 ? 'good' : 'info' });
    }
    const list = ranked.map(({ p, pct }) => `${p.name} ${pct}%`).join(', ');
    const tie = ranked.length > 1 && ranked[0].pct === ranked[1].pct;
    result = ranked.length === 1 ? { summary: `Exhibit restored: ${ranked[0].pct}%.`, winner: ranked[0].p.id }
      : { summary: `${tie ? "It's a tie!" : `${ranked[0].p.name} wins!`} ${list}.`, winner: tie ? undefined : ranked[0].p.id };
    ctx.state.modePhase = 'done';
    ctx.state.modePhaseEndsAt = 0;
  }

  const mode: ServerMode = {
    id: 'fixExhibit',
    minPlayers: 1,
    maxPlayers: 4,
    // Everyone memorises together; a late joiner would see nothing to memorise.
    joinPolicy: 'spectateUntilNextRound',
    timeLimitSec: () => 0, // the mode runs its own clock

    onEnter(ctx) {
      result = null;
      started = false;
      nav = new AgentNav(ctx.map);
      ctx.systems.teams.clear();
      for (const p of ctx.players()) {
        p.score = 0;
        ctx.teleport(p, mode.spawnFor(ctx, p));
        spawnPieces(ctx, p);
      }
      ctx.state.modePhase = 'ready';
      ctx.state.modePhaseEndsAt = 0;
    },

    onPlayerJoin(ctx, p) { ctx.teleport(p, mode.spawnFor(ctx, p)); },

    onPlayerLeave(ctx, p) {
      for (const o of [...ctx.state.objects.values()]) if (o.owner === p.id) ctx.systems.objects.remove(o.id);
    },

    spawnFor(ctx, p: PlayerT): Spawn {
      const list = ctx.map.spawns.exhibit;
      const order = ctx.players().sort((a, b) => a.joinedAt - b.joinedAt).indexOf(p);
      return list[Math.max(0, order) % list.length];
    },

    canGrab(ctx, p, o) {
      if (o.kind !== 'piece') return 'allow';
      return ctx.state.modePhase === 'solve' && o.owner === p.id && o.status !== 'home' ? 'allow' : 'deny';
    },

    onReleased(ctx, _p, o) { if (o.kind === 'piece') trySnap(ctx, o); },

    onLanded(ctx, o) {
      if (o.kind !== 'piece') return;
      // Keep pieces in the room.
      const room = ctx.map.rooms.find((r) => r.id === ROOM)!;
      const x = Math.min(room.x1 - 0.6, Math.max(room.x0 + 0.6, o.x)), z = Math.min(room.z1 - 0.6, Math.max(room.z0 + 0.6, o.z));
      if (x !== o.x || z !== o.z) { o.x = x; o.z = z; }
      trySnap(ctx, o);
    },

    tick(ctx) {
      if (result) return;
      const c = cfg(ctx), now = ctx.now(), phase = ctx.state.modePhase;
      if (!started) { started = true; setPhase(ctx, 'memorize', c.memorizeSec); return; }
      if (now < ctx.state.modePhaseEndsAt) return;
      if (phase === 'memorize') {
        // Eyes close; the room is rearranged while nobody can see.
        setPhase(ctx, 'blind', c.blindSec);
        for (const p of ctx.players()) {
          if (p.status === 'spectating') continue;
          p.status = 'blind';
          ctx.systems.objects.dropAll(p, [p.head.px, p.feetY, p.head.pz]);
          jumble(ctx, p);
        }
      } else if (phase === 'blind') {
        setPhase(ctx, 'solve', c.solveSec);
        for (const p of ctx.players()) if (p.status === 'blind') p.status = 'active';
        ctx.announce('Put everything back where it was!', 'alert');
      } else if (phase === 'solve') {
        for (const p of ctx.players()) ctx.systems.objects.dropAll(p, [p.head.px, p.feetY, p.head.pz]);
        finish(ctx);
      }
    },

    isRoundOver: () => result,

    onExit(ctx) {
      result = null;
      nav = null;
      ctx.systems.objects.removeKind('piece');
      ctx.state.modePhase = '';
      ctx.state.modePhaseEndsAt = 0;
      for (const p of ctx.players()) if (p.status === 'blind') p.status = 'active';
    },
  };
  return mode;
}
