/**
 * Capture the Relic rules as pure functions (brief §15). The server room feeds
 * events in and syncs the resulting state out; tests drive these directly.
 */
export type CtrTeam = 'A' | 'B';
export type V3 = [number, number, number];

export type RelicStatus = 'home' | 'carried' | 'dropped' | 'flight';

export interface RelicState {
  team: CtrTeam;
  status: RelicStatus;
  carrier: string | null;
  pos: V3;
  /** Case glass: 0 intact, 1 cracked, 2 shattered. */
  caseStage: 0 | 1 | 2;
  caseHits: number;
}

export interface CtrState {
  relics: Record<CtrTeam, RelicState>;
  scores: Record<CtrTeam, number>;
  homes: Record<CtrTeam, V3>;
  captureRadius: number;
  returnTouchRadius: number;
  scoreLimit: number;
  hitsToShatter: number;
  suddenDeath: boolean;
  winner: CtrTeam | null;
}

export type CtrEvent =
  | { type: 'caseHit'; team: CtrTeam }
  | { type: 'grab'; playerId: string; playerTeam: CtrTeam; relic: CtrTeam }
  | { type: 'touch'; playerId: string; playerTeam: CtrTeam; relic: CtrTeam; handPos: V3 }
  | { type: 'drop'; playerId: string; pos: V3 }
  | { type: 'throw'; playerId: string; pos: V3 }
  | { type: 'land'; relic: CtrTeam; pos: V3 }
  | { type: 'ko'; playerId: string; pos: V3 }
  | { type: 'leave'; playerId: string; pos: V3 }
  | { type: 'carrierMoved'; playerId: string; playerTeam: CtrTeam; pos: V3 }
  | { type: 'timeUp' };

export type CtrOutput =
  | { type: 'cracked'; team: CtrTeam }
  | { type: 'shattered'; team: CtrTeam }
  | { type: 'stolen'; relic: CtrTeam; by: string }
  | { type: 'pickedUp'; relic: CtrTeam; by: string }
  | { type: 'dropped'; relic: CtrTeam; pos: V3 }
  | { type: 'returned'; relic: CtrTeam; by: string }
  | { type: 'captured'; team: CtrTeam; by: string }
  | { type: 'bothOut' }
  | { type: 'suddenDeath' }
  | { type: 'win'; team: CtrTeam }
  | { type: 'rejected'; reason: string };

export const other = (t: CtrTeam): CtrTeam => (t === 'A' ? 'B' : 'A');

const d2 = (a: V3, b: V3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const dPlan2 = (a: V3, b: V3) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;

export function createCtrState(opts: {
  homes: Record<CtrTeam, V3>; captureRadius: number; returnTouchRadius: number; scoreLimit: number; hitsToShatter: number;
}): CtrState {
  const relic = (team: CtrTeam): RelicState => ({ team, status: 'home', carrier: null, pos: [...opts.homes[team]] as V3, caseStage: 0, caseHits: 0 });
  return {
    relics: { A: relic('A'), B: relic('B') },
    scores: { A: 0, B: 0 },
    homes: opts.homes,
    captureRadius: opts.captureRadius,
    returnTouchRadius: opts.returnTouchRadius,
    scoreLimit: opts.scoreLimit,
    hitsToShatter: opts.hitsToShatter,
    suddenDeath: false,
    winner: null,
  };
}

function clone(s: CtrState): CtrState {
  return {
    ...s,
    relics: { A: { ...s.relics.A, pos: [...s.relics.A.pos] as V3 }, B: { ...s.relics.B, pos: [...s.relics.B.pos] as V3 } },
    scores: { ...s.scores },
  };
}

function sendHome(r: RelicState, home: V3) {
  r.status = 'home';
  r.carrier = null;
  r.pos = [...home] as V3;
  r.caseStage = 0; // reseal
  r.caseHits = 0;
}

const isOut = (r: RelicState) => r.status !== 'home';

/** Apply one event. Returns the new state and the outputs to broadcast. */
export function applyCtr(prev: CtrState, ev: CtrEvent): { state: CtrState; out: CtrOutput[] } {
  const s = clone(prev);
  const out: CtrOutput[] = [];
  if (s.winner) return { state: s, out: [{ type: 'rejected', reason: 'match over' }] };
  const bothOutBefore = isOut(s.relics.A) && isOut(s.relics.B);

  switch (ev.type) {
    case 'caseHit': {
      const r = s.relics[ev.team];
      if (r.status !== 'home' || r.caseStage === 2) break;
      r.caseHits += 1;
      r.caseStage = r.caseHits >= s.hitsToShatter ? 2 : 1;
      out.push({ type: r.caseStage === 2 ? 'shattered' : 'cracked', team: ev.team });
      break;
    }
    case 'grab': {
      const r = s.relics[ev.relic];
      if (ev.playerTeam === ev.relic) {
        // A defender grabbing their own loose relic counts as the return touch.
        if (r.status === 'dropped' || r.status === 'flight') {
          sendHome(r, s.homes[r.team]);
          out.push({ type: 'returned', relic: r.team, by: ev.playerId });
        } else out.push({ type: 'rejected', reason: 'cannot carry own relic' });
        break;
      }
      if (r.status === 'carried') { out.push({ type: 'rejected', reason: 'already carried' }); break; }
      if (r.status === 'home' && r.caseStage < 2) { out.push({ type: 'rejected', reason: 'case intact' }); break; }
      const wasHome = r.status === 'home';
      r.status = 'carried';
      r.carrier = ev.playerId;
      out.push(wasHome ? { type: 'stolen', relic: r.team, by: ev.playerId } : { type: 'pickedUp', relic: r.team, by: ev.playerId });
      break;
    }
    case 'touch': {
      const r = s.relics[ev.relic];
      if (ev.playerTeam !== ev.relic) break;
      if ((r.status === 'dropped' || r.status === 'flight') && d2(ev.handPos, r.pos) <= s.returnTouchRadius ** 2) {
        sendHome(r, s.homes[r.team]);
        out.push({ type: 'returned', relic: r.team, by: ev.playerId });
      }
      break;
    }
    case 'drop':
    case 'throw':
    case 'ko':
    case 'leave': {
      for (const r of [s.relics.A, s.relics.B]) {
        if (r.status !== 'carried' || r.carrier !== ev.playerId) continue;
        r.carrier = null;
        r.pos = [...ev.pos] as V3;
        r.status = ev.type === 'throw' ? 'flight' : 'dropped';
        out.push({ type: 'dropped', relic: r.team, pos: r.pos });
      }
      break;
    }
    case 'land': {
      const r = s.relics[ev.relic];
      if (r.status === 'flight') { r.status = 'dropped'; r.pos = [...ev.pos] as V3; }
      break;
    }
    case 'carrierMoved': {
      const enemy = s.relics[other(ev.playerTeam)];
      if (enemy.status !== 'carried' || enemy.carrier !== ev.playerId) break;
      enemy.pos = [...ev.pos] as V3;
      const own = s.relics[ev.playerTeam];
      const inZone = dPlan2(ev.pos, s.homes[ev.playerTeam]) <= s.captureRadius ** 2;
      if (inZone && own.status === 'home') {
        s.scores[ev.playerTeam] += 1;
        sendHome(enemy, s.homes[enemy.team]);
        out.push({ type: 'captured', team: ev.playerTeam, by: ev.playerId });
        if (s.suddenDeath || s.scores[ev.playerTeam] >= s.scoreLimit) {
          s.winner = ev.playerTeam;
          out.push({ type: 'win', team: ev.playerTeam });
        }
      }
      break;
    }
    case 'timeUp': {
      if (s.scores.A === s.scores.B) {
        if (!s.suddenDeath) { s.suddenDeath = true; out.push({ type: 'suddenDeath' }); }
      } else {
        s.winner = s.scores.A > s.scores.B ? 'A' : 'B';
        out.push({ type: 'win', team: s.winner });
      }
      break;
    }
  }

  if (!bothOutBefore && isOut(s.relics.A) && isOut(s.relics.B)) out.push({ type: 'bothOut' });
  return { state: s, out };
}
