import type { RoundResult, ServerMode } from '../types.js';

/**
 * Free Roam: no timer and no rules. Walk every gallery at your own pace; the
 * HUD tracks the rooms you've visited and the map (M / left X) shows where you
 * are. The host ends it from the menu. (Mode id 'tour' kept from M4.)
 */
export function createTourMode(): ServerMode {
  let over: RoundResult | null = null;
  return {
    id: 'tour',
    minPlayers: 1,
    maxPlayers: 4,
    joinPolicy: 'immediate',
    timeLimitSec: () => 0, // untimed: the host ends it from the menu
    onEnter(ctx) {
      over = null;
      ctx.systems.teams.clear();
      ctx.players().forEach((p, i) => ctx.teleport(p, ctx.map.spawns.lobby[i % ctx.map.spawns.lobby.length]));
      ctx.announce('Free Roam: wander anywhere you like. Open the map to see where you are.', 'info');
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
