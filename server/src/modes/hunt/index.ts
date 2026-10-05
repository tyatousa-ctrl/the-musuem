import {
  allSecured, createHuntState, deliver, huntWinner, pickPlacements,
  type HuntSlot, type HuntState, type Spawn,
} from '@museum/shared';
import type { PlayerT } from '../../state/schema.js';
import { feetPos } from '../../systems/index.js';
import type { ModeContext, RoundResult, ServerMode } from '../types.js';

const TEAM_NAME: Record<string, string> = { A: 'Falcons', B: 'Masks' };
const RARITY_LABEL = { common: 'a common', rare: 'a RARE', legendary: 'a LEGENDARY' } as const;

/**
 * Artifact Hunt (brief §16). Artifacts are placed in random candidate slots
 * each round; carry them to the Registrar's Desk in the Grand Lobby to score.
 * Rules live in shared/rules/hunt.ts; this is the glue.
 */
export function createHuntMode(): ServerMode {
  let s: HuntState | null = null;
  let result: RoundResult | null = null;

  const desk = (ctx: ModeContext) => ctx.map.zones.find((z) => z.kind === 'desk')!;

  function syncScores(ctx: ModeContext) {
    if (!s) return;
    if (s.teams) {
      ctx.state.scoreA = s.scores.A ?? 0;
      ctx.state.scoreB = s.scores.B ?? 0;
    }
    if (!s.teams) for (const p of ctx.players()) p.score = s.scores[p.id] ?? 0;
  }

  function finish(ctx: ModeContext, why: string) {
    if (!s || result) return;
    const w = huntWinner(s);
    const name = (key: string) => (s!.teams ? TEAM_NAME[key] ?? key : ctx.player(key)?.name ?? 'Someone');
    const summary = w === null ? `${why} Nobody secured anything!`
      : w === 'tie' ? `${why} It's a tie!`
      : `${why} ${name(w)} win${s.teams ? '' : 's'} with ${s.scores[w]} points!`;
    result = { summary, winner: w ?? undefined };
  }

  const mode: ServerMode = {
    id: 'artifactHunt',
    minPlayers: 1,
    maxPlayers: 4,
    joinPolicy: 'immediate',
    timeLimitSec: (ctx) => ctx.state.huntTimeMin * 60,

    onEnter(ctx) {
      result = null;
      const t = ctx.tunables.artifactHunt;
      const slots: HuntSlot[] = ctx.map.slots.filter((x) => x.kind === 'artifact').map((x) => ({ id: x.id, pos: x.pos, tier: x.tier! }));
      const placements = pickPlacements(slots, t.artifacts);
      s = createHuntState(placements, { common: t.valueCommon, rare: t.valueRare, legendary: t.valueLegendary }, ctx.state.huntTeams);
      ctx.state.scoreA = ctx.state.scoreB = 0;
      for (const p of ctx.players()) p.score = 0;
      if (s.teams) ctx.systems.teams.assignBalanced(); else ctx.systems.teams.clear();
      for (const a of Object.values(s.artifacts)) {
        const slot = placements.find((x) => x.id === a.slot)!;
        ctx.systems.objects.spawn(a.id, 'artifact', a.rarity, slot.pos, { status: 'rest' });
      }
      for (const p of ctx.players()) ctx.teleport(p, mode.spawnFor(ctx, p));
    },

    onPlayerJoin(ctx, p, midRound) {
      // Join immediately with the current world state; no retroactive credit.
      if (midRound && s?.teams) p.team = ctx.systems.teams.smaller();
      p.score = 0;
      ctx.teleport(p, mode.spawnFor(ctx, p));
    },

    onPlayerLeave() {},

    spawnFor(ctx, p: PlayerT): Spawn {
      const list = ctx.map.spawns.lobby;
      const order = ctx.players().sort((a, b) => a.joinedAt - b.joinedAt).indexOf(p);
      return list[Math.max(0, order) % list.length];
    },

    tick(ctx) {
      if (!s || result) return;
      const d = desk(ctx);
      const r2 = ctx.tunables.artifactHunt.deliverRadius ** 2;
      for (const p of ctx.players()) {
        if (p.status !== 'active') continue;
        const [x, y, z] = feetPos(p);
        if ((x - d.center[0]) ** 2 + (z - d.center[2]) ** 2 > r2 || Math.abs(y - d.center[1]) > 1.5) continue;
        for (const id of [p.heldLeft, p.heldRight]) {
          const art = id ? s.artifacts[id] : undefined;
          if (!art || art.secured) continue;
          const r = deliver(s, id, p.id, p.team);
          s = r.state;
          if (s.teams) p.score += r.points; // personal tally inside a team
          ctx.systems.objects.remove(id);
          ctx.announce(`${p.name} secured ${RARITY_LABEL[art.rarity]} artifact! +${r.points}`, 'good');
          ctx.broadcast('scored', { team: (s.teams ? p.team : '') as '' | 'A' | 'B', playerId: p.id, scoreA: s.scores.A ?? 0, scoreB: s.scores.B ?? 0 });
          syncScores(ctx);
        }
      }
      if (allSecured(s)) finish(ctx, 'Every artifact is secured.');
    },

    onTimeUp(ctx) { finish(ctx, 'The museum is closing.'); },

    isRoundOver: () => result,

    onExit(ctx) {
      s = null;
      result = null;
      ctx.systems.objects.removeKind('artifact');
      ctx.systems.teams.clear();
      ctx.state.scoreA = ctx.state.scoreB = 0;
    },
  };
  return mode;
}
