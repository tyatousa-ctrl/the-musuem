import * as THREE from 'three';
import type { MuseumMap, Portal, Rect, Room } from '@museum/shared';
import type { MatKey, Sink } from '../sink';
import { archInfill, archivolt, moulding, PROFILES, railing, stairSteps } from '../kit/kit';

export const WALL_T = 0.5;

/** One side of a room, in a wall-local frame: u along the wall, v up, w into the room. */
export interface WallSide {
  key: 'north' | 'south' | 'west' | 'east';
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  normal: THREE.Vector3;
  length: number;
  basis: THREE.Matrix4;
}

export function wallSides(r: Room): WallSide[] {
  const y = r.floorY;
  const mk = (key: WallSide['key'], ox: number, oz: number, dir: THREE.Vector3, normal: THREE.Vector3, length: number): WallSide => {
    // w = 0 is the inner face; the wall body (w ∈ [-WALL_T, 0]) sits inside the room bounds.
    const origin = new THREE.Vector3(ox, y, oz).addScaledVector(normal, WALL_T);
    const basis = new THREE.Matrix4().makeBasis(dir, new THREE.Vector3(0, 1, 0), normal).setPosition(origin);
    return { key, origin, dir, normal, length, basis };
  };
  return [
    mk('north', r.x0, r.z0, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), r.x1 - r.x0),
    mk('south', r.x1, r.z1, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), r.x1 - r.x0),
    mk('west', r.x0, r.z1, new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), r.z1 - r.z0),
    mk('east', r.x1, r.z0, new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), r.z1 - r.z0),
  ];
}

export interface Opening { u0: number; u1: number; v0: number; v1: number; portal: Portal }

/** Portals that cut this wall, in wall-local coordinates. */
export function openingsFor(map: MuseumMap, r: Room, side: WallSide): Opening[] {
  const out: Opening[] = [];
  for (const p of map.portals) {
    if (p.a !== r.id && p.b !== r.id) continue;
    const onLine = side.key === 'north' ? p.axis === 'x' && p.z === r.z0
      : side.key === 'south' ? p.axis === 'x' && p.z === r.z1
      : side.key === 'west' ? p.axis === 'z' && p.x === r.x0
      : p.axis === 'z' && p.x === r.x1;
    if (!onLine) continue;
    if (p.y < r.floorY - 0.01 || p.y >= r.ceilY) continue;
    const rel = new THREE.Vector3(p.x, 0, p.z).sub(new THREE.Vector3(side.origin.x, 0, side.origin.z));
    const u = rel.dot(side.dir);
    const v0 = p.y - r.floorY;
    out.push({ u0: u - p.width / 2, u1: u + p.width / 2, v0, v1: v0 + p.height, portal: p });
  }
  return out.sort((a, b) => a.u0 - b.u0);
}

/** World AABB of a wall-local box. */
function localBox(side: WallSide, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): [number, number, number, number, number, number] {
  const a = new THREE.Vector3(u0, v0, w0).applyMatrix4(side.basis);
  const b = new THREE.Vector3(u1, v1, w1).applyMatrix4(side.basis);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)];
}

export function sideBox(sink: Sink, side: WallSide, mat: MatKey, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number, opts: { tint?: THREE.ColorRepresentation; collide?: boolean } = {}) {
  if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
  const [x0, y0, z0, x1, y1, z1] = localBox(side, u0, u1, v0, v1, w0, w1);
  sink.box(mat, x0, y0, z0, x1, y1, z1, opts);
}

export interface WallStyle {
  mat: MatKey;
  tint?: THREE.ColorRepresentation;
  /** Lower wall finish (e.g. gallery fabric) up to `lowerTop`. */
  lowerMat?: MatKey;
  lowerTint?: THREE.ColorRepresentation;
  lowerTop?: number;
  skirting?: boolean;
  cornice?: number | null; // height of cornice base, or null
  corniceScale?: number;
  stringCourses?: number[];
  trimMat?: MatKey;
  trimTint?: THREE.ColorRepresentation;
  /** Door surrounds on rectangular openings. */
  surrounds?: boolean;
  skip?: WallSide['key'][];
}

/** Build a room's four walls with portal openings, arches, mouldings and collision. */
export function buildWalls(sink: Sink, map: MuseumMap, r: Room, st: WallStyle): Map<WallSide['key'], { side: WallSide; openings: Opening[] }> {
  const H = r.ceilY - r.floorY;
  const result = new Map<WallSide['key'], { side: WallSide; openings: Opening[] }>();
  const trim = st.trimMat ?? st.mat;
  for (const side of wallSides(r)) {
    const openings = openingsFor(map, r, side);
    result.set(side.key, { side, openings });
    if (st.skip?.includes(side.key)) continue;

    // Solid runs between openings; spandrel/lintel over each opening.
    const put = (u0: number, u1: number, v0: number, v1: number) => {
      if (st.lowerMat && st.lowerTop && v0 < st.lowerTop) {
        const split = Math.min(v1, st.lowerTop);
        sideBox(sink, side, st.lowerMat, u0, u1, v0, split, -WALL_T, 0, { tint: st.lowerTint, collide: true });
        if (v1 > split) sideBox(sink, side, st.mat, u0, u1, split, v1, -WALL_T, 0, { tint: st.tint, collide: true });
      } else sideBox(sink, side, st.mat, u0, u1, v0, v1, -WALL_T, 0, { tint: st.tint, collide: true });
    };
    let u = 0;
    for (const o of openings) {
      put(u, o.u0, 0, H);
      if (o.v0 > 0.01) put(o.u0, o.u1, 0, o.v0);
      const w = o.u1 - o.u0;
      const arched = (o.portal.kind === 'arch' || o.portal.kind === 'grand') && o.v1 - w / 2 > 2.2;
      if (arched) {
        const spring = o.v1 - w / 2;
        const top = Math.min(H, o.v1 + 0.01);
        const g = archInfill(w, spring, top, WALL_T);
        sink.add(st.mat, g, side.basis.clone().multiply(new THREE.Matrix4().makeTranslation((o.u0 + o.u1) / 2, 0, 0)), { tint: st.tint });
        // Keystone ring (archivolt) on the room face.
        const av = archivolt(w / 2, spring, Math.min(0.6, w * 0.08), 0.12);
        sink.add(trim, av, side.basis.clone().multiply(new THREE.Matrix4().makeTranslation((o.u0 + o.u1) / 2, 0, 0)), { tint: st.trimTint ?? st.tint });
        // Imposts at the spring line.
        for (const uu of [o.u0, o.u1]) sideBox(sink, side, trim, uu - 0.35, uu + 0.35, spring - 0.35, spring, 0, 0.18, { tint: st.trimTint ?? st.tint });
        if (top < H) put(o.u0, o.u1, top, H);
      } else {
        if (o.v1 < H) put(o.u0, o.u1, o.v1, H);
        if (st.surrounds !== false && o.portal.kind !== 'opening' && o.portal.kind !== 'crawl') {
          const band = Math.min(0.35, 0.08 * w + 0.12);
          sideBox(sink, side, trim, o.u0 - band, o.u0, o.v0, o.v1 + band, 0, 0.1, { tint: st.trimTint ?? st.tint });
          sideBox(sink, side, trim, o.u1, o.u1 + band, o.v0, o.v1 + band, 0, 0.1, { tint: st.trimTint ?? st.tint });
          sideBox(sink, side, trim, o.u0 - band, o.u1 + band, o.v1, o.v1 + band, 0, 0.14, { tint: st.trimTint ?? st.tint });
          // Cornice-like hood over the door.
          sideBox(sink, side, trim, o.u0 - band - 0.12, o.u1 + band + 0.12, o.v1 + band, o.v1 + band + 0.14, 0, 0.24, { tint: st.trimTint ?? st.tint });
        }
      }
      // Reveal (wall thickness) lining inside the opening, so the jambs read as deep stone.
      u = o.u1;
    }
    put(u, side.length, 0, H);

    // Mouldings along solid runs.
    const runs: [number, number][] = [];
    let s = 0;
    for (const o of openings) { if (o.v0 < 0.3) { runs.push([s, o.u0]); s = o.u1; } }
    runs.push([s, side.length]);
    for (const [a, b] of runs) {
      if (b - a < 0.2) continue;
      const at = (v: number) => side.basis.clone().multiply(new THREE.Matrix4().makeTranslation(a, v, 0));
      if (st.skirting !== false) sink.add(trim, moulding(PROFILES.skirting, b - a), at(0), { tint: 0x8f8170 });
    }
    const fullRun = (v: number, profile: [number, number][], scale: number) => {
      // Run over the whole wall, broken only by openings that reach this height.
      let s2 = 0;
      for (const o of openings) {
        if (o.v1 > v && o.v0 < v + 0.8 * scale) { if (o.u0 - s2 > 0.2) sink.add(trim, moulding(profile, o.u0 - s2, scale), side.basis.clone().multiply(new THREE.Matrix4().makeTranslation(s2, v, 0)), { tint: st.trimTint ?? st.tint }); s2 = o.u1; }
      }
      if (side.length - s2 > 0.2) sink.add(trim, moulding(profile, side.length - s2, scale), side.basis.clone().multiply(new THREE.Matrix4().makeTranslation(s2, v, 0)), { tint: st.trimTint ?? st.tint });
    };
    if (st.cornice != null && st.cornice < H) fullRun(st.cornice, PROFILES.cornice, st.corniceScale ?? 1);
    for (const v of st.stringCourses ?? []) if (v < H) fullRun(v, PROFILES.stringCourse, 1);
    if (st.lowerMat && st.lowerTop) fullRun(st.lowerTop, PROFILES.dado, 1.2);
  }
  return result;
}

/** Subtract axis-aligned holes from a rectangle (simple guillotine split). */
export function subtractHoles(r: Rect, holes: Rect[]): Rect[] {
  let rects = [r];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const a of rects) {
      if (h.x1 <= a.x0 || h.x0 >= a.x1 || h.z1 <= a.z0 || h.z0 >= a.z1) { next.push(a); continue; }
      if (h.x0 > a.x0) next.push({ x0: a.x0, x1: h.x0, z0: a.z0, z1: a.z1 });
      if (h.x1 < a.x1) next.push({ x0: h.x1, x1: a.x1, z0: a.z0, z1: a.z1 });
      const mx0 = Math.max(a.x0, h.x0), mx1 = Math.min(a.x1, h.x1);
      if (h.z0 > a.z0) next.push({ x0: mx0, x1: mx1, z0: a.z0, z1: h.z0 });
      if (h.z1 < a.z1) next.push({ x0: mx0, x1: mx1, z0: h.z1, z1: a.z1 });
    }
    rects = next;
  }
  return rects;
}

/** Floor slab with holes; collides. */
export function buildFloor(sink: Sink, r: Room, mat: MatKey, tint?: THREE.ColorRepresentation) {
  for (const f of subtractHoles(r, r.floorHoles ?? [])) {
    sink.box(mat, f.x0, r.floorY - 0.3, f.z0, f.x1, r.floorY, f.z1, { tint, collide: true });
  }
}

/** Flat ceiling (visual only). */
export function buildFlatCeiling(sink: Sink, r: Room, mat: MatKey, tint?: THREE.ColorRepresentation, y = r.ceilY) {
  sink.box(mat, r.x0, y, r.z0, r.x1, y + 0.3, r.z1, { tint });
}

/** Platforms (balconies, catwalks, podiums) as slabs; collide. */
export function buildPlatforms(sink: Sink, map: MuseumMap, roomId: string, mat: MatKey, tint: THREE.ColorRepresentation, edgeMat: MatKey, edgeTint: THREE.ColorRepresentation) {
  for (const p of map.platforms.filter((x) => x.room === roomId)) {
    const thick = p.solid ? p.y - (map.rooms.find((r) => r.id === roomId)!.floorY) : p.style === 'catwalk' ? 0.25 : 0.45;
    const m = p.style === 'catwalk' ? 'plain' : mat;
    sink.box(m, p.x0, p.y - thick, p.z0, p.x1, p.y, p.z1, { tint: p.style === 'catwalk' ? 0x6a6e74 : tint, collide: true });
    if (!p.solid && p.style !== 'catwalk') {
      // Fascia band on the slab edge so balconies read as architecture.
      sink.box(edgeMat, p.x0, p.y - thick - 0.25, p.z0, p.x1, p.y - thick, p.z1, { tint: edgeTint });
    }
  }
}

/** Stair flights: stepped visual, smooth ramp collision. */
export function buildStairs(sink: Sink, map: MuseumMap, roomId: string, mat: MatKey, tint: THREE.ColorRepresentation) {
  for (const s of map.stairs.filter((x) => x.room === roomId)) {
    const m = s.style === 'metal' ? 'plain' : s.style === 'concrete' ? 'concrete' : mat;
    const t = s.style === 'metal' ? 0x4a4d52 : tint;
    sink.add(m, stairSteps(s.x0, s.x1, s.z0, s.z1, s.y0, s.y1, s.dir, 0.17, s.style === 'metal'), undefined, { tint: t });
    // Ramp collider: a thin slab rotated to the stair pitch.
    const alongX = s.dir === '+x' || s.dir === '-x';
    const run = alongX ? s.x1 - s.x0 : s.z1 - s.z0;
    const rise = s.y1 - s.y0;
    const len = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run);
    const slab = new THREE.BoxGeometry(alongX ? len : s.x1 - s.x0, 0.2, alongX ? s.z1 - s.z0 : len);
    slab.translate(0, -0.1, 0);
    const m4 = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    if (alongX) rot.makeRotationZ(s.dir === '+x' ? ang : -ang);
    else rot.makeRotationX(s.dir === '+z' ? -ang : ang);
    m4.makeTranslation((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2).multiply(rot);
    sink.collideGeometry(slab, m4);
  }
}

/** Railings: visual + collision wall 1.1 m tall. */
export function buildRails(sink: Sink, map: MuseumMap, inRoom: (x: number, z: number, y: number) => boolean, stoneMat: MatKey, stoneTint: THREE.ColorRepresentation) {
  for (const r of map.rails) {
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    if (!inRoom(mx, mz, (r.ya + r.yb) / 2)) continue;
    const g = railing(r.x0, r.z0, r.ya, r.x1, r.z1, r.yb, r.style);
    const mat = r.style === 'balustrade' ? stoneMat : 'plain';
    const tint = r.style === 'balustrade' ? stoneTint : r.style === 'glass' ? 0x9aa2a8 : 0x2d3036;
    sink.add(mat, g.solid, undefined, { tint });
    if (g.glass) sink.add('glass', g.glass, undefined, { tint: 0xcfe6ee });
    // Collision: a thin sloped wall.
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const slope = Math.atan2(r.yb - r.ya, len);
    const wall = new THREE.BoxGeometry(Math.hypot(len, r.yb - r.ya), 1.1, 0.12);
    wall.translate(0, 0.55, 0);
    const m = new THREE.Matrix4().makeTranslation(mx, (r.ya + r.yb) / 2, mz)
      .multiply(new THREE.Matrix4().makeRotationY(-Math.atan2(r.z1 - r.z0, r.x1 - r.x0)))
      .multiply(new THREE.Matrix4().makeRotationZ(slope));
    sink.collideGeometry(wall, m);
  }
}
