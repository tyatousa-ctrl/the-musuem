import { describe, expect, it } from 'vitest';
import { museum } from '../src/map/museum.js';
import { groundHeightAt } from '../src/map/ground.js';
import { measureRoutes, roomAt } from '../src/map/graph.js';

describe('museum map data', () => {
  it('has unique ids', () => {
    for (const list of [museum.rooms, museum.portals, museum.blocks, museum.platforms, museum.stairs] as { id: string }[][]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every portal sits on the shared boundary of its two rooms', () => {
    const byId = new Map(museum.rooms.map((r) => [r.id, r]));
    for (const p of museum.portals) {
      const a = byId.get(p.a), b = byId.get(p.b);
      expect(a, p.id).toBeDefined();
      expect(b, p.id).toBeDefined();
      if (p.kind === 'opening' && (a!.floorY !== b!.floorY)) continue; // stair holes
      for (const r of [a!, b!]) {
        if (r.open) continue;
        const onEdge = p.axis === 'x' ? (p.z === r.z0 || p.z === r.z1) : (p.x === r.x0 || p.x === r.x1);
        expect(onEdge, `${p.id} on ${r.id}`).toBe(true);
      }
    }
  });

  it('every spawn is inside a room and on the ground', () => {
    const all = [...museum.spawns.exterior, ...museum.spawns.lobby, ...museum.spawns.teamA, ...museum.spawns.teamB];
    for (const s of all) {
      const [x, y, z] = s.pos;
      expect(roomAt(museum, x, y + 1, z), s.id).toBeDefined();
      expect(groundHeightAt(museum, x, y, z)).toBeCloseTo(y, 1);
    }
  });

  it('the front steps rise toward the facade', () => {
    expect(groundHeightAt(museum, 49.9, 0, 0)).toBeCloseTo(-2.4 + 0.03, 1);
    expect(groundHeightAt(museum, 42.1, 0.5, 0)).toBeCloseTo(-0.03, 1);
  });

  it('meets the route-length rule (brief §6.3)', () => {
    const { failures } = measureRoutes(museum);
    expect(failures).toEqual([]);
  });
});
