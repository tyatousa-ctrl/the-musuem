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

  private grid?: { x0: number; z0: number; nx: number; nz: number; open: Uint8Array; moves: Uint8Array };
  static readonly CELL = 0.5;
  static readonly GRID_R = 0.32;

  /** Walkable cells and the legal moves between neighbours, built once on first use. */
  private navGrid() {
    if (this.grid) return this.grid;
    const C = AgentNav.CELL, r = AgentNav.GRID_R;
    const x0 = Math.min(...this.rooms.map((q) => q.x0)), x1 = Math.max(...this.rooms.map((q) => q.x1));
    const z0 = Math.min(...this.rooms.map((q) => q.z0)), z1 = Math.max(...this.rooms.map((q) => q.z1));
    const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C);
    const open = new Uint8Array(nx * nz), moves = new Uint8Array(nx * nz);
    const cx = (i: number) => x0 + (i + 0.5) * C, cz = (k: number) => z0 + (k + 0.5) * C;
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) open[k * nx + i] = this.standable(cx(i), cz(k), r) ? 1 : 0;
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      if (!open[k * nx + i]) continue;
      let m = 0;
      DIRS.forEach(([di, dk], d) => {
        const j = i + di, l = k + dk;
        if (j < 0 || l < 0 || j >= nx || l >= nz || !open[l * nx + j]) return;
        if (di && dk && (!open[k * nx + j] || !open[l * nx + i])) return; // no corner cutting
        if (this.canStep(cx(i), cz(k), cx(j), cz(l), r)) m |= 1 << d;
      });
      moves[k * nx + i] = m;
    }
    this.grid = { x0, z0, nx, nz, open, moves };
    return this.grid;
  }

  /** Grid A* from a to b, smoothed into straight legs. */
  findPath(ax: number, az: number, bx: number, bz: number): [number, number][] {
    const g = this.navGrid(), C = AgentNav.CELL;
    const cell = (x: number, z: number) => {
      const i = Math.floor((x - g.x0) / C), k = Math.floor((z - g.z0) / C);
      if (i < 0 || k < 0 || i >= g.nx || k >= g.nz) return -1;
      if (g.open[k * g.nx + i]) return k * g.nx + i;
      // Nearest open cell within a metre (agents can stand slightly off-grid).
      let best = -1, bd = Infinity;
      for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) {
        const j = i + di, l = k + dk;
        if (j < 0 || l < 0 || j >= g.nx || l >= g.nz || !g.open[l * g.nx + j]) continue;
        if (di * di + dk * dk < bd) { bd = di * di + dk * dk; best = l * g.nx + j; }
      }
      return best;
    };
    const start = cell(ax, az), goal = cell(bx, bz);
    if (start < 0 || goal < 0) return [];
    const gx = goal % g.nx, gz = Math.floor(goal / g.nx);
    const h = (c: number) => Math.hypot((c % g.nx) - gx, Math.floor(c / g.nx) - gz);
    const N = g.nx * g.nz;
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    // Binary heap of (f, cell) in typed arrays.
    let hf = new Float64Array(1024), hc = new Int32Array(1024), size = 0;
    const push = (f: number, c: number) => {
      if (size === hf.length) { const nf = new Float64Array(size * 2), nc = new Int32Array(size * 2); nf.set(hf); nc.set(hc); hf = nf; hc = nc; }
      let i = size++;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hc[i] = hc[p]; i = p; }
      hf[i] = f; hc[i] = c;
    };
    const pop = () => {
      const top = hc[0];
      const f = hf[--size], c = hc[size];
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        if (l >= size) break;
        const m = l + 1 < size && hf[l + 1] < hf[l] ? l + 1 : l;
        if (hf[m] >= f) break;
        hf[i] = hf[m]; hc[i] = hc[m]; i = m;
      }
      hf[i] = f; hc[i] = c;
      return top;
    };
    cost[start] = 0;
    push(h(start), start);
    let found = false;
    while (size) {
      const c = pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === goal) { found = true; break; }
      const i = c % g.nx, k = (c - i) / g.nx, m = g.moves[c];
      for (let d = 0; d < 8; d++) {
        if (!(m & (1 << d))) continue;
        const [di, dk] = DIRS[d];
        const n = (k + dk) * g.nx + (i + di);
        if (closed[n]) continue;
        const nc = cost[c] + (di && dk ? Math.SQRT2 : 1);
        if (nc < cost[n]) { cost[n] = nc; prev[n] = c; push(nc + h(n), n); }
      }
    }
    if (!found) return [];
    const pts: [number, number][] = [];
    for (let c = goal; c !== -1; c = prev[c]) pts.unshift([g.x0 + ((c % g.nx) + 0.5) * C, g.z0 + (Math.floor(c / g.nx) + 0.5) * C]);
    pts[pts.length - 1] = [bx, bz];
    // Shortcut: keep going straight while the line from the last corner stays clear.
    const out: [number, number][] = [];
    let from: [number, number] = [ax, az], i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      while (j + 1 < pts.length && this.clearLine(from[0], from[1], pts[j + 1][0], pts[j + 1][1])) j++;
      out.push(pts[j]); from = pts[j]; i = j;
    }
    if (!out.length) out.push([bx, bz]);
    return out;
  }

  /** Every short step along the line is legal for a grid-sized agent. */
  clearLine(ax: number, az: number, bx: number, bz: number): boolean {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
      const x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
      if (!this.canStep(x0, z0, x1, z1, AgentNav.GRID_R)) return false;
    }
    return true;
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
  step(a: { x: number; z: number; r: number; side?: number }, bx: number, bz: number, posts: Circle[] = [], ropes: Segment[] = []): StepResult {
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
    const dx = bx - a.x, dz = bz - a.z;
    const len = Math.hypot(dx, dz);
    // Straight on, else slide along a wall (only if the slide still makes real progress).
    for (const [x, z] of [[bx, bz], [bx, a.z], [a.x, bz]]) {
      if (Math.hypot(x - a.x, z - a.z) >= len * 0.3 && ok(x, z)) { a.x = x; a.z = z; return { moved: true, rope: false }; }
    }
    // Blocked head-on by a corner: try turning progressively further to either side.
    if (!rope && dx * dx + dz * dz > 1e-8) {
      // Keep turning the same way as last time, so agents follow an exhibit's edge instead of dithering.
      const side = a.side ?? 1;
      for (const deg of [35, 70, 100, -35, -70, -100]) {
        const r = (deg * side * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
        const x = a.x + dx * c - dz * sn, z = a.z + dx * sn + dz * c;
        if (ok(x, z)) { a.x = x; a.z = z; a.side = Math.sign(deg) * side; return { moved: true, rope: false }; }
      }
    }
    return { moved: false, rope };
  }
}

/**
 * A walking route on this floor from a to b, as a few straight legs around
 * walls and exhibits (A* on the nav grid, then shortcut where the line is
 * clear). Returns [] when b cannot be reached on this floor.
 */
export function routeOnFloor(nav: AgentNav, ax: number, az: number, bx: number, bz: number): [number, number][] {
  return nav.findPath(ax, az, bx, bz);
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

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
