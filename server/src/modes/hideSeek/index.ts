import type { Spawn } from '@museum/shared';
import type { PlayerT } from '../../state/schema.js';
import { feetPos } from '../../systems/index.js';
import type { ModeContext, RoundResult, ServerMode } from '../types.js';

/** Team letters reused for roles. */
const HIDER = 'A', SEEKER = 'B';

/**
 * Hide and Seek: one seeker counts (blindfolded) while everyone hides
 * anywhere in the museum. Every two minutes each hidden player calls out
 * with a positional sound. Tagged hiders join the seekers. Seekers win by
 * finding everyone; hiders still hidden at the end win.
 */
export function createHideSeekMode(): ServerMode {
  let result: RoundResult | null = null;
  let hideUntil = 0;
  let nextPing = 0;
  let warned = false;
  const tagCooldown = new Map<string, number>();

  const cfg = (ctx: ModeContext) => ctx.tunables.hideSeek;
  const hiders = (ctx: ModeContext) => ctx.players().filter((p) => p.team === HIDER && p.status !== 'spectating');

  function found(ctx: ModeContext, seeker: PlayerT, hider: PlayerT) {
    if (hider.team !== HIDER || result) return;
    hider.team = SEEKER;
    seeker.score += 1;
    const left = hiders(ctx).length;
    ctx.broadcast('hit', { attackerId: seeker.id, targetId: hider.id, kind: 'shove', pos: [hider.head.px, hider.head.py, hider.head.pz] });
    ctx.sendTo(hider.id, 'announcement', { text: `${seeker.name} found you! Now you're a seeker too.`, tone: 'bad' });
    for (const p of ctx.players()) if (p.id !== hider.id) ctx.sendTo(p.id, 'announcement', { text: `${seeker.name} found ${hider.name}! ${left} still hidden.`, tone: p.team === SEEKER ? 'good' : 'alert' });
    if (left === 0) result = { summary: `The seekers found everyone with ${fmt(ctx.state.phaseEndsAt - ctx.now())} to spare!`, winner: SEEKER };
  }

  /** Can this seeker tag this hider right now? */
  const canTag = (ctx: ModeContext, s: PlayerT, h: PlayerT) =>
    !result && s.team === SEEKER && h.team === HIDER && s.status === 'active' && h.status === 'active' && ctx.now() >= hideUntil
    && ctx.now() >= (tagCooldown.get(s.id) ?? 0);

  const mode: ServerMode = {
    id: 'hideSeek',
    minPlayers: 2,
    maxPlayers: 4,
    joinPolicy: 'immediate',
    timeLimitSec: (ctx) => cfg(ctx).timeLimitSec,

    onEnter(ctx) {
      result = null;
      warned = false;
      tagCooldown.clear();
      const c = cfg(ctx), now = ctx.now();
      // The countdown phase also counts toward the round; hiding time starts when play does.
      hideUntil = now + (ctx.tunables.round.countdownSec + c.hideSec) * 1000;
      nextPing = now + (ctx.tunables.round.countdownSec + c.pingEverySec) * 1000;
      const ps = ctx.players();
      const seeker = ps[Math.floor(Math.random() * ps.length)];
      for (const p of ps) {
        p.team = p === seeker ? SEEKER : HIDER;
        p.score = 0;
        ctx.teleport(p, mode.spawnFor(ctx, p));
        if (p === seeker) {
          p.status = 'blind';
          ctx.sendTo(p.id, 'announcement', { text: `You're the seeker! Counting to ${c.hideSec}…`, tone: 'alert' });
        } else ctx.sendTo(p.id, 'announcement', { text: `${seeker.name} is seeking. Go hide! You'll call out every ${c.pingEverySec / 60} minutes.`, tone: 'info' });
      }
      ctx.state.modePhase = 'hide';
      ctx.state.modePhaseEndsAt = hideUntil;
    },

    // Late joiners seek (hiding late, from the lobby, would be unfair to them).
    onPlayerJoin(ctx, p) {
      p.team = SEEKER;
      p.score = 0;
      ctx.teleport(p, mode.spawnFor(ctx, p));
      if (ctx.now() < hideUntil) p.status = 'blind';
      ctx.sendTo(p.id, 'announcement', { text: 'You joined as a seeker. Listen for the calls!', tone: 'info' });
    },

    onPlayerLeave(ctx) {
      if (!result && !ctx.players().some((p) => p.team === SEEKER && p.status !== 'reconnecting')) {
        result = { summary: 'The seeker left. The hiders win!', winner: HIDER };
      }
    },

    spawnFor(ctx, p: PlayerT): Spawn {
      const list = ctx.map.spawns.lobby;
      const order = ctx.players().sort((a, b) => a.joinedAt - b.joinedAt).indexOf(p);
      return list[Math.max(0, order) % list.length];
    },

    // Desktop click (and VR shoves) on a hider: a tag, never a shove.
    onPlayerHit(ctx, a, t) {
      if (!canTag(ctx, a, t)) return false;
      if (Math.hypot(a.head.px - t.head.px, a.head.py - t.head.py, a.head.pz - t.head.pz) > cfg(ctx).desktopTagReach) return false;
      tagCooldown.set(a.id, ctx.now() + 500);
      found(ctx, a, t);
      return true;
    },

    tick(ctx) {
      if (result) return;
      const c = cfg(ctx), now = ctx.now();
      if (ctx.state.modePhase === 'seek' && hiders(ctx).length === 0) { result = { summary: 'Nobody left to find. The seekers win!', winner: SEEKER }; return; }
      if (ctx.state.modePhase === 'hide' && now >= hideUntil) {
        ctx.state.modePhase = 'seek';
        ctx.state.modePhaseEndsAt = nextPing;
        for (const p of ctx.players()) {
          if (p.status === 'blind') p.status = 'active';
          ctx.sendTo(p.id, 'announcement', { text: p.team === SEEKER ? 'Ready or not, here I come!' : 'The seeker is coming!', tone: 'alert' });
        }
      }
      // Warn hiders before they call out, then call out.
      if (!warned && now >= nextPing - c.pingWarnSec * 1000) {
        warned = true;
        for (const p of hiders(ctx)) ctx.sendTo(p.id, 'announcement', { text: `You'll call out in ${c.pingWarnSec} seconds!`, tone: 'alert' });
      }
      if (now >= nextPing) {
        for (const p of hiders(ctx)) ctx.broadcast('hidePing', { playerId: p.id, pos: [p.head.px, p.head.py, p.head.pz] });
        nextPing += c.pingEverySec * 1000;
        warned = false;
        if (ctx.state.modePhase === 'seek') ctx.state.modePhaseEndsAt = nextPing;
      }
      // VR: a seeker's hand on a hider's body tags them.
      for (const s of ctx.players()) {
        if (s.team !== SEEKER) continue;
        for (const h of hiders(ctx)) {
          if (!canTag(ctx, s, h)) continue;
          const [fx, fy, fz] = feetPos(h);
          const touched = [s.left, s.right].some((q) => {
            const torso = Math.hypot(q.px - fx, q.pz - fz) < c.tagReach && q.py > fy + 0.2 && q.py < h.head.py + 0.25;
            return torso || Math.hypot(q.px - h.head.px, q.py - h.head.py, q.pz - h.head.pz) < c.tagReach;
          });
          if (touched) { tagCooldown.set(s.id, now + 500); found(ctx, s, h); }
        }
      }
    },

    onTimeUp(ctx) {
      if (result) return;
      const left = hiders(ctx);
      result = left.length
        ? { summary: `Time's up! ${left.map((p) => p.name).join(' and ')} stayed hidden and win${left.length === 1 ? 's' : ''}!`, winner: HIDER }
        : { summary: 'Time is up.', winner: SEEKER };
      for (const p of left) p.score += 3;
    },

    isRoundOver: () => result,

    onExit(ctx) {
      result = null;
      ctx.systems.teams.clear();
      ctx.state.modePhase = '';
      ctx.state.modePhaseEndsAt = 0;
      for (const p of ctx.players()) if (p.status === 'blind') p.status = 'active';
    },
  };
  return mode;
}

const fmt = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
