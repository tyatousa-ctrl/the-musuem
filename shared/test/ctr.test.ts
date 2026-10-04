import { describe, expect, it } from 'vitest';
import { applyCtr, createCtrState, type CtrEvent, type CtrState, type V3 } from '../src/rules/ctr.js';

const HOME_A: V3 = [-17, 1, -52];
const HOME_B: V3 = [-17, 1, 52];

function fresh(scoreLimit = 3): CtrState {
  return createCtrState({ homes: { A: HOME_A, B: HOME_B }, captureRadius: 3, returnTouchRadius: 1.2, scoreLimit, hitsToShatter: 2 });
}

function run(s: CtrState, ...events: CtrEvent[]) {
  const outs = [];
  for (const e of events) {
    const r = applyCtr(s, e);
    s = r.state;
    outs.push(...r.out);
  }
  return { s, outs };
}

/** Player a1 (team A) smashes B's case and takes B's relic. */
const steal = (s: CtrState) => run(s,
  { type: 'caseHit', team: 'B' }, { type: 'caseHit', team: 'B' },
  { type: 'grab', playerId: 'a1', playerTeam: 'A', relic: 'B' });

describe('Capture the Relic rules (brief §15)', () => {
  it('first valid hit cracks the glass, second shatters it', () => {
    const { s, outs } = run(fresh(), { type: 'caseHit', team: 'B' });
    expect(s.relics.B.caseStage).toBe(1);
    expect(outs).toContainEqual({ type: 'cracked', team: 'B' });
    const r2 = run(s, { type: 'caseHit', team: 'B' });
    expect(r2.s.relics.B.caseStage).toBe(2);
    expect(r2.outs).toContainEqual({ type: 'shattered', team: 'B' });
  });

  it('cannot take a relic from an intact or merely cracked case', () => {
    let { s, outs } = run(fresh(), { type: 'grab', playerId: 'a1', playerTeam: 'A', relic: 'B' });
    expect(s.relics.B.status).toBe('home');
    expect(outs[0]).toMatchObject({ type: 'rejected' });
    ({ s, outs } = run(s, { type: 'caseHit', team: 'B' }, { type: 'grab', playerId: 'a1', playerTeam: 'A', relic: 'B' }));
    expect(s.relics.B.status).toBe('home');
  });

  it('stealing from a shattered case makes the thief the carrier', () => {
    const { s, outs } = steal(fresh());
    expect(s.relics.B).toMatchObject({ status: 'carried', carrier: 'a1' });
    expect(outs).toContainEqual({ type: 'stolen', relic: 'B', by: 'a1' });
  });

  it('carrier can drop the relic deliberately', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'drop', playerId: 'a1', pos: [0, 0, 0] }));
    expect(s.relics.B).toMatchObject({ status: 'dropped', carrier: null, pos: [0, 0, 0] });
  });

  it('carrier can throw the relic and a teammate can catch it', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'throw', playerId: 'a1', pos: [1, 1.5, 1] }));
    expect(s.relics.B.status).toBe('flight');
    ({ s } = run(s, { type: 'grab', playerId: 'a2', playerTeam: 'A', relic: 'B' }));
    expect(s.relics.B).toMatchObject({ status: 'carried', carrier: 'a2' });
  });

  it('teammate can pick up a dropped relic', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'drop', playerId: 'a1', pos: [0, 0, 0] }, { type: 'grab', playerId: 'a2', playerTeam: 'A', relic: 'B' }));
    expect(s.relics.B.carrier).toBe('a2');
  });

  it('KO drops relic at exact position', () => {
    let { s } = steal(fresh());
    const where: V3 = [-12.25, 7, 3.5];
    ({ s } = run(s, { type: 'ko', playerId: 'a1', pos: where }));
    expect(s.relics.B.status).toBe('dropped');
    expect(s.relics.B.pos).toEqual(where);
  });

  it('defender touch returns relic and reseals the case', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'drop', playerId: 'a1', pos: [0, 0, 0] }));
    const { s: s2, outs } = run(s, { type: 'touch', playerId: 'b1', playerTeam: 'B', relic: 'B', handPos: [0.5, 0.5, 0] });
    expect(s2.relics.B).toMatchObject({ status: 'home', caseStage: 0, caseHits: 0 });
    expect(s2.relics.B.pos).toEqual(HOME_B);
    expect(outs).toContainEqual({ type: 'returned', relic: 'B', by: 'b1' });
  });

  it('defender touch out of reach does nothing', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'drop', playerId: 'a1', pos: [0, 0, 0] }));
    ({ s } = run(s, { type: 'touch', playerId: 'b1', playerTeam: 'B', relic: 'B', handPos: [3, 0, 0] }));
    expect(s.relics.B.status).toBe('dropped');
  });

  it('defenders cannot carry their own relic', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'drop', playerId: 'a1', pos: [0, 0, 0] }));
    // Grabbing own dropped relic returns it rather than carrying it.
    ({ s } = run(s, { type: 'grab', playerId: 'b1', playerTeam: 'B', relic: 'B' }));
    expect(s.relics.B.status).toBe('home');
  });

  it('no auto-return over time', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'drop', playerId: 'a1', pos: [0, 0, 0] }));
    // Many unrelated events (ticks) later the relic is still where it fell.
    for (let i = 0; i < 1000; i++) ({ s } = run(s, { type: 'carrierMoved', playerId: 'x', playerTeam: 'A', pos: [0, 0, 0] }));
    expect(s.relics.B.status).toBe('dropped');
    expect(s.relics.B.pos).toEqual([0, 0, 0]);
  });

  it('scores by carrying the enemy relic into your capture zone', () => {
    const { s } = steal(fresh());
    const { s: s2, outs } = run(s, { type: 'carrierMoved', playerId: 'a1', playerTeam: 'A', pos: [-16, 0, -51] });
    expect(s2.scores.A).toBe(1);
    expect(outs).toContainEqual({ type: 'captured', team: 'A', by: 'a1' });
    expect(s2.relics.B).toMatchObject({ status: 'home', caseStage: 0 });
  });

  it('cannot score while own relic is away', () => {
    let { s } = steal(fresh());
    // Team B steals A's relic too.
    ({ s } = run(s,
      { type: 'caseHit', team: 'A' }, { type: 'caseHit', team: 'A' },
      { type: 'grab', playerId: 'b1', playerTeam: 'B', relic: 'A' }));
    ({ s } = run(s, { type: 'carrierMoved', playerId: 'a1', playerTeam: 'A', pos: HOME_A }));
    expect(s.scores.A).toBe(0);
    expect(s.relics.B.status).toBe('carried');
  });

  it('announces when both relics are out', () => {
    const { s } = steal(fresh());
    const { outs } = run(s,
      { type: 'caseHit', team: 'A' }, { type: 'caseHit', team: 'A' },
      { type: 'grab', playerId: 'b1', playerTeam: 'B', relic: 'A' });
    expect(outs).toContainEqual({ type: 'bothOut' });
  });

  it('carrier leaving drops the relic', () => {
    let { s } = steal(fresh());
    ({ s } = run(s, { type: 'leave', playerId: 'a1', pos: [5, 0, 5] }));
    expect(s.relics.B).toMatchObject({ status: 'dropped', pos: [5, 0, 5] });
  });

  it('first to the score limit wins', () => {
    let s = fresh(2);
    for (let i = 0; i < 2; i++) {
      ({ s } = steal(s));
      ({ s } = run(s, { type: 'carrierMoved', playerId: 'a1', playerTeam: 'A', pos: HOME_A }));
    }
    expect(s.winner).toBe('A');
  });

  it('time up: higher score wins, tie goes to sudden death', () => {
    let { s, outs } = run(fresh(), { type: 'timeUp' });
    expect(s.winner).toBeNull();
    expect(outs).toContainEqual({ type: 'suddenDeath' });
    ({ s } = steal(s));
    ({ s, outs } = run(s, { type: 'carrierMoved', playerId: 'a1', playerTeam: 'A', pos: HOME_A }));
    expect(s.winner).toBe('A');
    const led = run(steal(fresh()).s, { type: 'carrierMoved', playerId: 'a1', playerTeam: 'A', pos: HOME_A }, { type: 'timeUp' });
    expect(led.s.winner).toBe('A');
  });
});
