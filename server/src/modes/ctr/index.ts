import {
  applyCtr, createCtrState, other, type CtrEvent, type CtrState, type CtrTeam, type Spawn,
} from '@museum/shared';
import type { ObjectT, PlayerT } from '../../state/schema.js';
import { feetPos, handPose, poseVec } from '../../systems/index.js';
import type { ModeContext, RoundResult, ServerMode } from '../types.js';

const RELIC_ID: Record<CtrTeam, string> = { A: 'relicA', B: 'relicB' };
const CASE_ID: Record<CtrTeam, string> = { A: 'caseA', B: 'caseB' };
const RELIC_NAME: Record<CtrTeam, string> = { A: 'Golden Falcon', B: 'Jade Mask' };
const TEAM_NAME: Record<CtrTeam, string> = { A: 'Falcons', B: 'Masks' };
/** Relic rests this far above the pedestal top. */
const RELIC_LIFT = 0.28;

const teamOfCase = (id: string): CtrTeam | null => (id === 'caseA' ? 'A' : id === 'caseB' ? 'B' : null);
const teamOfRelic = (id: string): CtrTeam | null => (id === 'relicA' ? 'A' : id === 'relicB' ? 'B' : null);

/** Capture the Relic (brief §15). Rules live in shared/rules/ctr.ts; this is the glue. */
export function createCtrMode(): ServerMode {
  let s: CtrState | null = null;
  let result: RoundResult | null = null;

  const home = (ctx: ModeContext, t: CtrTeam): [number, number, number] => {
    const slot = ctx.map.slots.find((x) => x.id === CASE_ID[t])!;
    return [slot.pos[0], slot.pos[1] + RELIC_LIFT, slot.pos[2]];
  };

  function apply(ctx: ModeContext, ev: CtrEvent) {
    if (!s) return [];
    const r = applyCtr(s, ev);
    s = r.state;
    for (const o of r.out) {
      switch (o.type) {
        case 'shattered':
          ctx.announce(`ALARM! The ${RELIC_NAME[o.team]} case is broken!`, 'alert');
          break;
        case 'stolen': case 'pickedUp': {
          const thief = ctx.player(o.by)?.name ?? 'Someone';
          ctx.announce(o.type === 'stolen' ? 'RELIC STOLEN!' : `${thief} has your relic!`, 'bad', o.relic);
          ctx.announce(`${thief} has the ${RELIC_NAME[o.relic]}! Bring it home!`, 'good', other(o.relic));
          break;
        }
        case 'dropped':
          ctx.announce(`The ${RELIC_NAME[o.relic]} was dropped!`, 'info');
          break;
        case 'returned':
          ctx.announce('YOUR RELIC IS HOME', 'good', o.relic);
          ctx.announce(`The ${RELIC_NAME[o.relic]} was returned.`, 'bad', other(o.relic));
          break;
        case 'captured':
          ctx.broadcast('scored', { team: o.team, playerId: o.by, scoreA: s.scores.A, scoreB: s.scores.B });
          ctx.announce(`${TEAM_NAME[o.team]} SCORE!`, 'good', o.team);
          ctx.announce(`${TEAM_NAME[o.team]} captured your relic.`, 'bad', other(o.team));
          { const p = ctx.player(o.by); if (p) p.score += 1; }
          break;
        case 'bothOut':
          ctx.announce('Both relics are out — it\'s a manhunt!', 'alert');
          break;
        case 'suddenDeath':
          ctx.announce('Sudden death! Next capture wins.', 'alert');
          break;
        case 'win':
          result = { summary: `${TEAM_NAME[o.team]} win ${s.scores[o.team]}–${s.scores[other(o.team)]}!`, winner: o.team };
          break;
      }
    }
    sync(ctx);
    return r.out;
  }

  /** Mirror rules state into the synced world objects and breakables. */
  function sync(ctx: ModeContext) {
    if (!s) return;
    ctx.state.scoreA = s.scores.A;
    ctx.state.scoreB = s.scores.B;
    ctx.state.suddenDeath = s.suddenDeath;
    for (const t of ['A', 'B'] as CtrTeam[]) {
      const r = s.relics[t];
      const obj = ctx.state.objects.get(RELIC_ID[t]);
      if (obj && r.status === 'home' && obj.status !== 'home') ctx.systems.objects.place(obj.id, home(ctx, t), 'home');
      if (r.caseStage === 0) ctx.systems.breakables.reset(CASE_ID[t]);
    }
  }

  const playerTeam = (p: PlayerT): CtrTeam | null => (p.team === 'A' || p.team === 'B' ? p.team : null);

  const mode: ServerMode = {
    id: 'ctr',
    minPlayers: 1, // a lone player can practise
    maxPlayers: 4,
    joinPolicy: 'immediate',
    timeLimitSec: (ctx) => ctx.state.ctrTimeMin * 60,

    onEnter(ctx) {
      result = null;
      s = createCtrState({
        homes: { A: home(ctx, 'A'), B: home(ctx, 'B') },
        captureRadius: ctx.tunables.ctr.captureRadius,
        returnTouchRadius: ctx.tunables.ctr.returnTouchRadius,
        scoreLimit: ctx.state.ctrScoreLimit,
        hitsToShatter: ctx.tunables.combat.glassHitsToShatter,
      });
      ctx.state.scoreA = ctx.state.scoreB = 0;
      ctx.state.suddenDeath = false;
      for (const p of ctx.players()) p.score = 0;
      ctx.systems.teams.assignBalanced();
      for (const t of ['A', 'B'] as CtrTeam[]) {
        ctx.systems.objects.spawn(RELIC_ID[t], 'relic', t === 'A' ? 'falcon' : 'mask', home(ctx, t), { team: t, status: 'home' });
        const slot = ctx.map.slots.find((x) => x.id === CASE_ID[t])!;
        ctx.systems.breakables.add(CASE_ID[t], 'case', [slot.pos[0], slot.pos[1] + 0.45, slot.pos[2]], t);
      }
      for (const p of ctx.players()) ctx.teleport(p, mode.spawnFor(ctx, p));
    },

    onPlayerJoin(ctx, p, midRound) {
      if (midRound) p.team = ctx.systems.teams.smaller();
      ctx.teleport(p, mode.spawnFor(ctx, p));
      if (midRound) ctx.sendTo(p.id, 'announcement', { text: `You joined the ${TEAM_NAME[p.team as CtrTeam]}.`, tone: 'info' });
    },

    onPlayerLeave(ctx, p) {
      apply(ctx, { type: 'leave', playerId: p.id, pos: feetPos(p) });
    },

    spawnFor(ctx, p): Spawn {
      const t = playerTeam(p);
      const list = t === 'A' ? ctx.map.spawns.teamA : t === 'B' ? ctx.map.spawns.teamB : ctx.map.spawns.lobby;
      const mates = ctx.players().filter((q) => q.team === p.team).sort((a, b) => a.joinedAt - b.joinedAt);
      return list[Math.max(0, mates.indexOf(p)) % list.length];
    },

    respawnDelaySec(ctx, p) {
      const t = playerTeam(p);
      if (!t) return ctx.tunables.combat.respawnDelaySec;
      const short = ctx.systems.teams.count(t) < ctx.systems.teams.count(other(t));
      return short ? ctx.tunables.combat.shortHandedRespawnDelaySec : ctx.tunables.combat.respawnDelaySec;
    },

    canGrab(ctx, p, obj: ObjectT) {
      const relic = teamOfRelic(obj.id);
      if (!relic) return 'allow';
      const t = playerTeam(p);
      if (!t) return 'deny';
      const out = apply(ctx, { type: 'grab', playerId: p.id, playerTeam: t, relic });
      if (out.some((o) => o.type === 'returned')) return 'consumed';
      return out.some((o) => o.type === 'stolen' || o.type === 'pickedUp') ? 'allow' : 'deny';
    },

    onReleased(ctx, p, obj, thrown) {
      if (!teamOfRelic(obj.id)) return;
      apply(ctx, { type: thrown ? 'throw' : 'drop', playerId: p.id, pos: [obj.x, obj.y, obj.z] });
    },

    onLanded(ctx, obj) {
      const relic = teamOfRelic(obj.id);
      if (relic) apply(ctx, { type: 'land', relic, pos: [obj.x, obj.y, obj.z] });
    },

    onBreakableHit(ctx, p, id) {
      const caseTeam = teamOfCase(id);
      if (!caseTeam || !s) return true;
      // Only attackers break a case, and only while its relic is inside.
      return p.team !== caseTeam && s.relics[caseTeam].status === 'home';
    },

    onBreakableStage(ctx, _p, id) {
      const caseTeam = teamOfCase(id);
      if (caseTeam) apply(ctx, { type: 'caseHit', team: caseTeam });
    },

    onKo(ctx, p, pos) {
      apply(ctx, { type: 'ko', playerId: p.id, pos });
    },

    tick(ctx) {
      if (!s || result) return;
      for (const p of ctx.players()) {
        const t = playerTeam(p);
        if (!t || p.status !== 'active') continue;
        // Carrier reaching home.
        if (s.relics[other(t)].carrier === p.id) apply(ctx, { type: 'carrierMoved', playerId: p.id, playerTeam: t, pos: feetPos(p) });
        // Defender touching their own loose relic.
        const own = s.relics[t];
        if (own.status === 'dropped' || own.status === 'flight') {
          const obj = ctx.state.objects.get(RELIC_ID[t]);
          if (obj) own.pos = [obj.x, obj.y, obj.z];
          for (const hand of ['left', 'right'] as const) {
            apply(ctx, { type: 'touch', playerId: p.id, playerTeam: t, relic: t, handPos: poseVec(handPose(p, hand)) });
          }
          // Feet count too, so desktop players can return a relic by walking over it.
          apply(ctx, { type: 'touch', playerId: p.id, playerTeam: t, relic: t, handPos: [p.head.px, own.pos[1], p.head.pz] });
        }
      }
    },

    onTimeUp(ctx) { apply(ctx, { type: 'timeUp' }); },

    isRoundOver: () => result,

    onExit(ctx) {
      s = null;
      result = null;
      ctx.systems.objects.removeKind('relic');
      ctx.systems.breakables.removeAll();
      ctx.systems.teams.clear();
      ctx.state.scoreA = ctx.state.scoreB = 0;
      ctx.state.suddenDeath = false;
    },
  };
  return mode;
}
