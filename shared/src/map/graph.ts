import type { MuseumMap, Room, RoomId, Vec3, WaypointEdge, WaypointNode } from './types.js';

/** Room containing a point. Stacked rooms resolve to the one whose floor is just below the point. */
export function roomAt(map: MuseumMap, x: number, y: number, z: number): Room | undefined {
  let best: Room | undefined;
  for (const r of map.rooms) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    if (y < r.floorY - 0.75 || y > r.ceilY + 0.5) continue;
    if (!best || r.floorY > best.floorY || (r.floorY === best.floorY && !r.open && best.open)) best = r;
  }
  return best;
}

/** Room adjacency via portals. */
export function adjacency(map: MuseumMap): Map<RoomId, Set<RoomId>> {
  const adj = new Map<RoomId, Set<RoomId>>();
  for (const r of map.rooms) adj.set(r.id, new Set());
  for (const p of map.portals) {
    adj.get(p.a)!.add(p.b);
    adj.get(p.b)!.add(p.a);
  }
  return adj;
}

export interface WaypointGraph {
  nodes: Map<string, WaypointNode>;
  edges: WaypointEdge[];
  neighbours: Map<string, { id: string; len: number }[]>;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Waypoint graph: portal centres and landmarks are nodes; every pair of nodes
 * sharing a room is connected. Rooms are kept convex-ish in the map (Egypt is
 * split into corridors for this reason), so straight lines are a fair estimate.
 */
export function buildWaypointGraph(map: MuseumMap): WaypointGraph {
  const nodes = new Map<string, WaypointNode>();
  for (const p of map.portals) nodes.set(`portal:${p.id}`, { id: `portal:${p.id}`, pos: [p.x, p.y, p.z], rooms: [p.a, p.b] });
  for (const l of map.landmarks) nodes.set(`lm:${l.id}`, { id: `lm:${l.id}`, pos: l.pos, rooms: [l.room] });

  const byRoom = new Map<RoomId, string[]>();
  for (const n of nodes.values()) for (const r of n.rooms) {
    if (!byRoom.has(r)) byRoom.set(r, []);
    byRoom.get(r)!.push(n.id);
  }

  const edges: WaypointEdge[] = [];
  const neighbours = new Map<string, { id: string; len: number }[]>();
  for (const id of nodes.keys()) neighbours.set(id, []);
  const seen = new Set<string>();
  for (const ids of byRoom.values()) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const len = dist(nodes.get(ids[i])!.pos, nodes.get(ids[j])!.pos);
      edges.push({ a: ids[i], b: ids[j], len });
      neighbours.get(ids[i])!.push({ id: ids[j], len });
      neighbours.get(ids[j])!.push({ id: ids[i], len });
    }
  }
  return { nodes, edges, neighbours };
}

/**
 * Dijkstra between two nodes, only walking through rooms in `allowed` (if given).
 * An edge is usable when both endpoints share an allowed room.
 */
export function shortestPath(
  g: WaypointGraph, from: string, to: string, allowed?: Set<RoomId>,
): { length: number; path: string[] } | null {
  const usable = (a: string, b: string) => {
    const ra = g.nodes.get(a)!.rooms, rb = g.nodes.get(b)!.rooms;
    return ra.some((r) => rb.includes(r) && (!allowed || allowed.has(r)));
  };
  const d = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  while (true) {
    let cur: string | undefined, best = Infinity;
    for (const [id, v] of d) if (!done.has(id) && v < best) { best = v; cur = id; }
    if (!cur) return null;
    if (cur === to) break;
    done.add(cur);
    for (const n of g.neighbours.get(cur)!) {
      if (done.has(n.id) || !usable(cur, n.id)) continue;
      const nd = best + n.len;
      if (nd < (d.get(n.id) ?? Infinity)) { d.set(n.id, nd); prev.set(n.id, cur); }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return { length: d.get(to)!, path };
}

export type RouteKind = 'fast' | 'tacticalWest' | 'tacticalEast' | 'tacticalUpper' | 'hidden';

/** Rooms each route type may use (brief §6.3). Courts are always allowed. */
export function routeRooms(map: MuseumMap, kind: RouteKind): Set<RoomId> {
  const courts = ['northCourt', 'southCourt'];
  const ids = map.rooms.map((r) => r.id);
  switch (kind) {
    case 'fast': return new Set([...courts, 'dinoHall']);
    case 'tacticalWest': return new Set([...courts, 'american', 'sculptureCourt', 'modern']);
    case 'tacticalEast': return new Set([...courts, 'greatHall', 'greek', ...ids.filter((id) => id.startsWith('egypt'))]);
    case 'tacticalUpper': return new Set([...courts, ...ids.filter((id) => id.startsWith('paint'))]);
    case 'hidden': return new Set([...courts, ...ids.filter((id) => map.rooms.find((r) => r.id === id)!.floorY < 0)]);
  }
}

export interface RouteReport {
  kind: RouteKind;
  aToB: number; bToA: number; ratio: number;
  path: string[];
}

export const ROUTE_TARGETS: Record<RouteKind, [number, number]> = {
  fast: [1, 1],
  tacticalWest: [1.25, 1.5],
  tacticalEast: [1.25, 1.5],
  tacticalUpper: [1.25, 1.5],
  hidden: [1.6, 2.0],
};

export function measureRoutes(map: MuseumMap): { reports: RouteReport[]; failures: string[] } {
  const g = buildWaypointGraph(map);
  const kinds: RouteKind[] = ['fast', 'tacticalWest', 'tacticalEast', 'tacticalUpper', 'hidden'];
  const reports: RouteReport[] = [];
  const failures: string[] = [];
  let fast = 0;
  for (const kind of kinds) {
    const allowed = routeRooms(map, kind);
    const ab = shortestPath(g, 'lm:caseA', 'lm:caseB', allowed);
    const ba = shortestPath(g, 'lm:caseB', 'lm:caseA', allowed);
    if (!ab || !ba) { failures.push(`${kind}: no path`); continue; }
    if (kind === 'fast') fast = ab.length;
    const ratio = ab.length / fast;
    reports.push({ kind, aToB: ab.length, bToA: ba.length, ratio, path: ab.path });
    const [lo, hi] = ROUTE_TARGETS[kind];
    if (kind !== 'fast' && (ratio < lo || ratio > hi)) failures.push(`${kind}: ratio ${ratio.toFixed(2)} outside ${lo}–${hi}`);
    if (Math.abs(ab.length - ba.length) / Math.max(ab.length, ba.length) > 0.1) failures.push(`${kind}: A→B and B→A differ by more than 10%`);
  }
  return { reports, failures };
}
