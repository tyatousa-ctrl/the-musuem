import type { MuseumMap, Portal, Rect, Room } from '../map/types.js';

/**
 * Shared NPC agent navigation (brief §17): one floor of the museum as rooms,
 * the portals between them, and the solid exhibits in them. Crowd Control's
 * tourists use it now; Insurance Fraud's guards will use it too.
 *
 * Agents are circles on a plane. A step is legal when it stays inside a room
 * (or passes through a portal's mouth) and does not end inside an exhibit.
 */
export interface Circle { x: number; z: number; r: number }
export interface Segment { ax: number; az: number; bx: number; bz: number }

export interface StepResult {
  moved: boolean;
  /** The step was refused because it would cross a rope. */
  rope: boolean;
}

export class AgentNav {
  readonly rooms: Room[];
  private solids: Rect[];
  private portals: Portal[];

  constructor(map: MuseumMap, readonly floorY = 0) {
    this.rooms = map.rooms.filter((r) => !r.open && r.floorY === floorY);
    const ids = new Set(this.rooms.map((r) => r.id));
    this.portals = map.portals.filter((p) => p.y === floorY && ids.has(p.a) && ids.has(p.b) && (p.kind === 'door' || p.kind === 'arch' || p.kind === 'grand'));
    this.solids = [
      ...map.blocks.filter((b) => !b.noCollide && ids.has(b.room) && b.y0 < floorY + 1.6 && b.y1 > floorY + 0.05),
      // Agents stay on the floor: stairs, raised podiums and stair holes are off limits.
      ...map.stairs.filter((s) => ids.has(s.room) && Math.min(s.y0, s.y1) <= floorY + 0.1 && Math.max(s.y0, s.y1) > floorY + 0.1),
      ...map.platforms.filter((p) => p.solid && ids.has(p.room) && p.y > floorY + 0.1),
      ...this.rooms.flatMap((r) => r.floorHoles ?? []),
    ].map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }));
  }

  roomAt(x: number, z: number): Room | undefined {
    for (const r of this.rooms) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
    return undefined;
  }

  /** Inside an exhibit (grown by the agent radius). */
  blocked(x: number, z: number, r: number): boolean {
    for (const b of this.solids) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    return false;
  }

  /** Within the mouth of one of the room's portals (where wall clearance does not apply). */
  private inMouth(p: Portal, x: number, z: number, r: number, depth: number): boolean {
    const half = p.width / 2 - r * 0.8;
    return p.axis === 'x' ? Math.abs(x - p.x) < half && Math.abs(z - p.z) < depth : Math.abs(z - p.z) < half && Math.abs(x - p.x) < depth;
  }

  /** Can an agent of radius r stand at (x, z)? */
  standable(x: number, z: number, r: number): boolean {
    if (this.blocked(x, z, r)) return false;
    const room = this.roomAt(x, z);
    if (!room) return false;
    if (x >= room.x0 + r && x <= room.x1 - r && z >= room.z0 + r && z <= room.z1 - r) return true;
    return this.portals.some((p) => (p.a === room.id || p.b === room.id) && this.inMouth(p, x, z, r, r + 0.05));
  }

  /** Can an agent step from a to b? Crossing between rooms needs a portal there. */
  canStep(ax: number, az: number, bx: number, bz: number, r: number): boolean {
    if (!this.standable(bx, bz, r)) return false;
    const ra = this.roomAt(ax, az), rb = this.roomAt(bx, bz);
    if (!ra || !rb || ra === rb) return true;
    return this.portals.some((p) => ((p.a === ra.id && p.b === rb.id) || (p.a === rb.id && p.b === ra.id)) && this.inMouth(p, bx, bz, r, 0.8));
  }

  /**
   * Move toward (bx, bz), sliding along walls and exhibits when the direct step
   * is refused. Posts (circles) and ropes (segments) block too.
   */
  step(a: { x: number; z: number; r: number }, bx: number, bz: number, posts: Circle[] = [], ropes: Segment[] = []): StepResult {
    let rope = false;
    const ok = (x: number, z: number) => {
      if (!this.canStep(a.x, a.z, x, z, a.r)) return false;
      for (const c of posts) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.r + a.r && d < Math.hypot(a.x - c.x, a.z - c.z)) return false;
      }
      for (const s of ropes) {
        const crosses = segmentsCross(a.x, a.z, x, z, s);
        const d = distToSegment(x, z, s);
        if (crosses || (d < a.r && d < distToSegment(a.x, a.z, s))) { rope = true; return false; }
      }
      return true;
    };
    for (const [x, z] of [[bx, bz], [bx, a.z], [a.x, bz]]) {
      if ((x !== a.x || z !== a.z) && ok(x, z)) { a.x = x; a.z = z; return { moved: true, rope: false }; }
    }
    return { moved: false, rope };
  }
}

export function distToSegment(x: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}

function segmentsCross(ax: number, az: number, bx: number, bz: number, s: Segment): boolean {
  const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return o(ax, az, bx, bz, s.ax, s.az) !== o(ax, az, bx, bz, s.bx, s.bz) && o(s.ax, s.az, s.bx, s.bz, ax, az) !== o(s.ax, s.az, s.bx, s.bz, bx, bz);
}

/**
 * Velvet ropes between stanchions: each post links to its nearest neighbours
 * within `maxLen` (at most two ropes per post, no duplicates).
 */
export function ropeSegments(posts: { id: string; x: number; z: number }[], maxLen: number): (Segment & { a: string; b: string })[] {
  const out: (Segment & { a: string; b: string })[] = [];
  const degree = new Map<string, number>();
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) {
    const d = Math.hypot(posts[i].x - posts[j].x, posts[i].z - posts[j].z);
    if (d <= maxLen && d > 0.3) pairs.push({ i, j, d });
  }
  pairs.sort((p, q) => p.d - q.d);
  for (const { i, j } of pairs) {
    const a = posts[i], b = posts[j];
    if ((degree.get(a.id) ?? 0) >= 2 || (degree.get(b.id) ?? 0) >= 2) continue;
    degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
    degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
    out.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, a: a.id, b: b.id });
  }
  return out;
}
