import { describe, expect, it } from 'vitest';
import {
  allSecured, createHuntState, deliver, hintHeat, huntWinner, pickPlacements, tierMix, type HuntSlot,
} from '../src/rules/hunt.js';
import { museum } from '../src/map/museum.js';
import { roomAt } from '../src/map/graph.js';
import { seededRand } from './util.js';

const VALUES = { common: 1, rare: 3, legendary: 5 };
const slots = (): HuntSlot[] => museum.slots.filter((s) => s.kind === 'artifact').map((s) => ({ id: s.id, pos: s.pos, tier: s.tier! }));

describe('Artifact Hunt rules (brief §16)', () => {
  it('has 40+ candidate slots across all three tiers', () => {
    const all = slots();
    expect(all.length).toBeGreaterThanOrEqual(40);
    for (const t of ['obvious', 'tucked', 'hidden'] as const) expect(all.filter((s) => s.tier === t).length).toBeGreaterThanOrEqual(10);
  });

  it('every slot sits in its room, not inside a solid exhibit', () => {
    for (const s of museum.slots.filter((x) => x.kind === 'artifact')) {
      const [x, y, z] = s.pos;
      expect(roomAt(museum, x, y, z)?.id, s.id).toBe(s.room);
      for (const b of museum.blocks) {
        if (b.noCollide) continue;
        const inside = x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y > b.y0 + 0.05 && y < b.y1 - 0.05;
        expect(inside, `${s.id} inside ${b.id}`).toBe(false);
      }
    }
  });

  it('places 12 artifacts as 5 obvious, 4 tucked, 3 hidden, different every round', () => {
    expect(tierMix(12)).toEqual({ obvious: 5, tucked: 4, hidden: 3 });
    const a = pickPlacements(slots(), 12, seededRand(1));
    const b = pickPlacements(slots(), 12, seededRand(2));
    expect(a).toHaveLength(12);
    expect(new Set(a.map((s) => s.id)).size).toBe(12);
    expect(a.filter((s) => s.tier === 'hidden')).toHaveLength(3);
    expect(a.map((s) => s.id).sort()).not.toEqual(b.map((s) => s.id).sort());
  });

  it('scores by rarity: common 1, rare 3, legendary 5', () => {
    const p = pickPlacements(slots(), 12, seededRand(3));
    let s = createHuntState(p, VALUES, false);
    const byTier = (t: string) => Object.values(s.artifacts).find((a) => a.tier === t)!.id;
    let r = deliver(s, byTier('obvious'), 'p1', ''); s = r.state; expect(r.points).toBe(1);
    r = deliver(s, byTier('tucked'), 'p1', ''); s = r.state; expect(r.points).toBe(3);
    r = deliver(s, byTier('hidden'), 'p2', ''); s = r.state; expect(r.points).toBe(5);
    expect(s.scores).toEqual({ p1: 4, p2: 5 });
    expect(huntWinner(s)).toBe('p2');
  });

  it('cannot secure the same artifact twice', () => {
    let s = createHuntState(pickPlacements(slots(), 3, seededRand(4)), VALUES, false);
    s = deliver(s, 'artifact0', 'p1', '').state;
    const again = deliver(s, 'artifact0', 'p2', '');
    expect(again.points).toBe(0);
    expect(again.state.scores.p2).toBeUndefined();
  });

  it('team mode credits the team', () => {
    let s = createHuntState(pickPlacements(slots(), 3, seededRand(5)), VALUES, true);
    s = deliver(s, 'artifact0', 'p1', 'A').state;
    s = deliver(s, 'artifact1', 'p2', 'A').state;
    expect(Object.keys(s.scores)).toEqual(['A']);
  });

  it('round is complete when every artifact is secured', () => {
    let s = createHuntState(pickPlacements(slots(), 2, seededRand(6)), VALUES, false);
    expect(allSecured(s)).toBe(false);
    s = deliver(s, 'artifact0', 'p1', '').state;
    s = deliver(s, 'artifact1', 'p1', '').state;
    expect(allSecured(s)).toBe(true);
  });

  it('ties and empty scores are reported', () => {
    let s = createHuntState(pickPlacements(slots(), 2, seededRand(7)), { common: 1, rare: 1, legendary: 1 }, false);
    expect(huntWinner(s)).toBeNull();
    s = deliver(s, 'artifact0', 'p1', '').state;
    s = deliver(s, 'artifact1', 'p2', '').state;
    expect(huntWinner(s)).toBe('tie');
  });

  it('warmer/colder is weaker for hidden artifacts', () => {
    const at: [number, number, number] = [0, 0, 0];
    const obvious = hintHeat(at, [{ pos: [10, 0, 0], tier: 'obvious' }]);
    const hidden = hintHeat(at, [{ pos: [10, 0, 0], tier: 'hidden' }]);
    expect(obvious).toBeGreaterThan(hidden);
    expect(hintHeat(at, [{ pos: [30, 0, 0], tier: 'hidden' }])).toBe(0);
    expect(hintHeat(at, [{ pos: [0.5, 0, 0], tier: 'hidden' }])).toBeGreaterThan(0.9);
  });
});
