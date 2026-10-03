import type { MuseumMap, Stair } from './types.js';
import { roomAt } from './graph.js';

function stairHeight(s: Stair, x: number, z: number): number | null {
  if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) return null;
  let t: number;
  switch (s.dir) {
    case '+x': t = (x - s.x0) / (s.x1 - s.x0); break;
    case '-x': t = (s.x1 - x) / (s.x1 - s.x0); break;
    case '+z': t = (z - s.z0) / (s.z1 - s.z0); break;
    case '-z': t = (s.z1 - z) / (s.z1 - s.z0); break;
  }
  return s.y0 + (s.y1 - s.y0) * t;
}

/**
 * Highest walkable surface at (x, z) that is at or below `yHint + 0.5`.
 * Analytic (no meshes), so the server can use it for thrown objects and pose checks.
 */
export function groundHeightAt(map: MuseumMap, x: number, yHint: number, z: number): number {
  const limit = yHint + 0.5;
  let best = -Infinity;
  const consider = (h: number) => { if (h <= limit && h > best) best = h; };

  for (const r of map.rooms) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    const inHole = r.floorHoles?.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
    if (!inHole) consider(r.floorY);
  }
  for (const p of map.platforms) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) consider(p.y);
  for (const s of map.stairs) { const h = stairHeight(s, x, z); if (h !== null) consider(h); }
  for (const b of map.blocks) if (!b.noCollide && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) consider(b.y1);
  return best === -Infinity ? (roomAt(map, x, yHint, z)?.floorY ?? 0) : best;
}

/** True if the plan point is inside some room or the exterior fence. */
export function insideMap(map: MuseumMap, x: number, y: number, z: number): boolean {
  return !!roomAt(map, x, y, z);
}
