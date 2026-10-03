import type { RoundResult, ServerMode } from '../types.js';

/**
 * Free Tour: the stub mode from milestone M4. A timed wander with no rules,
 * useful for practising movement and for testing the round flow.
 */
export function createTourMode(): ServerMode {
  let over: RoundResult | null = null;
  return {
    id: 'tour',
    minPlayers: 1,
    maxPlayers: 4,
    joinPolicy: 'immediate',
    timeLimitSec: (ctx) => ctx.state.tourTimeMin * 60,
    onEnter(ctx) {
      over = null;
      ctx.systems.teams.clear();
      ctx.players().forEach((p, i) => ctx.teleport(p, ctx.map.spawns.lobby[i % ctx.map.spawns.lobby.length]));
      ctx.announce('Free Tour — explore the museum!', 'info');
    },
    onPlayerJoin(ctx, p) { ctx.teleport(p, this.spawnFor(ctx, p)); },
    onPlayerLeave() {},
    tick() {},
    onTimeUp() { over = { summary: 'The museum is closing. Thanks for visiting!' }; },
    isRoundOver: () => over,
    onExit() { over = null; },
    spawnFor: (ctx, p) => ctx.map.spawns.lobby[Math.abs(hash(p.id)) % ctx.map.spawns.lobby.length],
  };
}

function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
