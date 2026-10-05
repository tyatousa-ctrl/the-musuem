import * as THREE from 'three';
import type { Elevator, MuseumMap, Room } from '@museum/shared';
import { type LightPool, type RoomLight, Sink } from '../sink';
import { buildFlatCeiling, buildFloor, buildPlatforms, buildRails, buildStairs, buildWalls, WALL_T, type WallSide } from './structure';
import { buildBlock } from './exhibits';
import { barrelVault, canvasQuad, cofferedCeiling, column, pictureFrame, saucerDome } from '../kit/kit';
import type { ArtCatalogue, Painting } from '../paintings';
import { MUSEUM_NAME } from './exterior';

const C = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const pool = (x: number, y: number, z: number, radius: number, hex: number, k: number): LightPool => ({ pos: V(x, y, z), radius, color: C(hex, k) });
const M = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/** Things a room contributes besides static geometry. */
export interface RoomExtras {
  /** Light shafts: [top, bottom radius] for additive cards. */
  shafts: { top: THREE.Vector3; bottom: THREE.Vector3; radius: number }[];
  /** Camera bookmark suggestions. */
  ambientHex: number;
}

export interface BuildCtx {
  map: MuseumMap;
  art: ArtCatalogue;
  labelRects: Map<string, [number, number, number, number]>;
  nextPainting: (group: string) => Painting;
}

function lightFor(r: Room): RoomLight {
  const base = { floorY: r.floorY, ceilY: r.ceilY, sunDir: V(-0.35, -1, 0.25).normalize(), pools: [] as LightPool[] };
  switch (r.style) {
    case 'lobby': return { ...base, sky: C(0xfff3df, 0.95), ground: C(0xd8c4a8, 0.55), sun: C(0xffe6c0, 0.18), topLift: 0.35 };
    case 'dino': return { ...base, sky: C(0xf6f1e6, 0.88), ground: C(0xc9bba6, 0.5), sun: C(0xfff0d0, 0.15), topLift: 0.45 };
    case 'gallery': case 'sculpture': return { ...base, sky: C(0xfff8ec, 0.95), ground: C(0xd8ccb8, 0.62), sun: C(0xffffff, 0.08), topLift: 0.25 };
    case 'egypt': return { ...base, sky: C(0xc4ab88, 0.55), ground: C(0x6a5440, 0.4), sun: C(0, 0), topLift: 0 };
    case 'cultures': return { ...base, sky: C(0xe6d8c4, 0.78), ground: C(0x7a6450, 0.5), sun: C(0, 0), topLift: 0.1 };
    case 'courtNorth': case 'courtSouth': return { ...base, sky: C(0xffffff, 1.08), ground: C(0xe6dccb, 0.72), sun: C(0xfff2d8, 0.25), sunDir: V(0, -0.7, r.style === 'courtNorth' ? 0.7 : -0.7).normalize(), topLift: 0.2 };
    case 'service': case 'stairwell': return { ...base, sky: C(0xdfe8e4, 0.55), ground: C(0x8a918c, 0.42), sun: C(0, 0), topLift: 0 };
    case 'office': return { ...base, sky: C(0xe6efe9, 0.62), ground: C(0x8a918c, 0.45), sun: C(0, 0), topLift: 0 };
    default: return { ...base, sky: C(0xffffff, 1), ground: C(0xcccccc, 0.6), sun: C(0xffffff, 0.3), topLift: 0 };
  }
}

/** Hang paintings along a wall, avoiding openings. */
function hangPaintings(sink: Sink, ctx: BuildCtx, side: WallSide, openings: { u0: number; u1: number }[], group: string, opts: { maxW: number; maxH: number; centreY: number; gap: number }) {
  const free: [number, number][] = [];
  let s = 1.2;
  for (const o of openings) { if (o.u0 - 0.6 - s > 1.5) free.push([s, o.u0 - 0.6]); s = o.u1 + 0.6; }
  if (side.length - 1.2 - s > 1.5) free.push([s, side.length - 1.2]);
  for (const [a, b] of free) {
    let u = a;
    const items: { p: Painting; w: number; h: number }[] = [];
    while (u < b) {
      const p = ctx.nextPainting(group);
      const k = Math.min(1, opts.maxW / (p.widthCm / 100), opts.maxH / (p.heightCm / 100));
      const w = Math.max(0.4, (p.widthCm / 100) * k), h = Math.max(0.4, (p.heightCm / 100) * k);
      if (u + w + 0.3 > b) break;
      items.push({ p, w, h });
      u += w + opts.gap;
    }
    if (!items.length) continue;
    // Centre the hang within the free run.
    const total = items.reduce((t, i) => t + i.w, 0) + opts.gap * (items.length - 1);
    let x = a + (b - a - total) / 2;
    for (const { p, w, h } of items) {
      const band = Math.min(0.16, 0.05 + w * 0.04);
      const cu = x + w / 2, cy = opts.centreY;
      const m = side.basis.clone().multiply(M(cu, cy, 0.01));
      sink.add('plain', pictureFrame(w + band * 2, h + band * 2, band), m, { tint: 0xc9a24f, gain: 1.35 });
      sink.add(`canvas${p.atlas}`, canvasQuad(w, h, p.rect), side.basis.clone().multiply(M(cu, cy, 0.05)), { gain: 1.05 });
      const lr = ctx.labelRects.get(p.id);
      if (lr) sink.add('labels', canvasQuad(0.26, 0.13, lr), side.basis.clone().multiply(M(x + w + band + 0.3, 1.45, 0.02)), { gain: 1.1 });
      x += w + opts.gap;
    }
  }
}

export function buildRoom(r: Room, ctx: BuildCtx): { group: THREE.Group; colliders: THREE.BufferGeometry[]; extras: RoomExtras } {
  const sink = new Sink();
  const map = ctx.map;
  const extras: RoomExtras = { shafts: [], ambientHex: 0xffffff };
  const light = lightFor(r);
  const inRoom = (x: number, z: number, y: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.floorY - 0.5 && y <= r.ceilY;
  const blocks = map.blocks.filter((b) => b.room === r.id);
  /** Meshes with their own materials (banners), added after the merge. */
  const post: THREE.Object3D[] = [];

  switch (r.style) {
    case 'lobby': {
      // The Great Hall: long axis along the facade, three domed bays, a balcony
      // ring at the second floor, the grand staircase arch behind.
      buildFloor(sink, r, 'marble');
      const walls = buildWalls(sink, map, r, { mat: 'stone', tint: 0xf3ead9, cornice: 15.2, corniceScale: 1.3, stringCourses: [7.2], trimMat: 'plaster', trimTint: 0xf6efe2 });
      buildPlatforms(sink, map, r.id, 'marble', 0xf1e9db, 'stone', 0xe9dfcc);
      buildStairs(sink, map, r.id, 'marble', 0xf1e8d8);
      buildRails(sink, map, inRoom, 'stone', 0xf2e9d8);
      const alongZ = r.z1 - r.z0 >= r.x1 - r.x0;
      const L = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
      const Dp = alongZ ? r.x1 - r.x0 : r.z1 - r.z0;
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const bay = L / 3;
      const domeR = Math.min(bay, Dp) / 2 - 1.4;
      const bayCentre = (i: number) => (alongZ ? V(cx, 0, r.z0 + bay * (i + 0.5)) : V(r.x0 + bay * (i + 0.5), 0, cz));
      // Ceiling at 16 m pierced by three saucer domes with oculi.
      const shape = new THREE.Shape([new THREE.Vector2(r.x0, r.z0), new THREE.Vector2(r.x1, r.z0), new THREE.Vector2(r.x1, r.z1), new THREE.Vector2(r.x0, r.z1)]);
      for (let i = 0; i < 3; i++) { const c = bayCentre(i); const hole = new THREE.Path(); hole.absarc(c.x, c.z, domeR, 0, Math.PI * 2, true); shape.holes.push(hole); }
      const ceil = new THREE.ShapeGeometry(shape, 24);
      ceil.rotateX(Math.PI / 2);
      sink.add('plaster', ceil, M(0, 16, 0), { tint: 0xf4ecdd });
      for (let i = 0; i < 3; i++) {
        const c = bayCentre(i);
        sink.add('plaster', saucerDome(domeR, 4, 1.8), M(c.x, 16, c.z), { tint: 0xf7f0e2 });
        const ring = new THREE.TorusGeometry(domeR, 0.3, 6, 48);
        ring.rotateX(Math.PI / 2);
        sink.add('stone', ring, M(c.x, 16, c.z), { tint: 0xe8dcc5 });
        const oc = new THREE.CircleGeometry(1.82, 20);
        oc.rotateX(Math.PI / 2);
        sink.add('emissive', oc, M(c.x, 19.95, c.z), { tint: 0xfdfbf4 });
        const ocRing = new THREE.TorusGeometry(1.82, 0.12, 6, 24);
        ocRing.rotateX(Math.PI / 2);
        sink.add('stone', ocRing, M(c.x, 19.9, c.z), { tint: 0xd8ccb5 });
        light.pools.push(pool(c.x, 0, c.z, 12, 0xfff4dc, 0.22), pool(c.x, 16, c.z, 10, 0xfffaf0, 0.3));
        extras.shafts.push({ top: V(c.x, 19.8, c.z), bottom: V(c.x - 1, 0, c.z + 1.5), radius: 1.7 });
      }
      // Coffered soffits between the domes.
      for (const t of [1, 2]) {
        const soffit = cofferedCeiling(alongZ ? Dp - 1 : 1.4, alongZ ? 1.4 : Dp - 1, 1.2, 0.18, 0.25);
        const c = alongZ ? V(cx, 15.7, r.z0 + bay * t) : V(r.x0 + bay * t, 15.7, cz);
        sink.add('plaster', soffit, M(c.x, c.y, c.z), { tint: 0xeee4d2 });
      }
      // Piers at the bay lines and an arch with a clerestory window in each bay, on both long walls.
      const longSides = alongZ ? (['west', 'east'] as const) : (['north', 'south'] as const);
      for (const key of longSides) {
        const { side, openings } = walls.get(key)!;
        for (let k = 0; k <= 3; k++) {
          const pier = new THREE.BoxGeometry(2.4, 15.2, 1.0);
          pier.translate(0, 7.6, 0.5);
          sink.add('stone', pier, side.basis.clone().multiply(M(bay * k, 0, 0)), { tint: 0xeee4d2, collide: true });
        }
        for (let b2 = 0; b2 < 3; b2++) {
          const cu = bay * (b2 + 0.5);
          // Leave the bay over the grand staircase arch clear for the welcome banner.
          if (openings.some((o) => o.portal.kind === 'grand' && Math.abs((o.u0 + o.u1) / 2 - cu) < bay / 2)) continue;
          const am = side.basis.clone().multiply(M(cu, 0, 0));
          const arch = new THREE.TorusGeometry(Math.min(6.2, bay / 2 - 1.6), 0.4, 6, 24, Math.PI);
          arch.translate(0, 9.6, 0.25);
          sink.add('plaster', arch, am, { tint: 0xf2e8d5 });
          const ww = Math.min(5.6, bay - 4.4);
          const win = new THREE.PlaneGeometry(ww, 5);
          win.translate(0, 12.2, 0.02);
          sink.add('emissive', win, am, { tint: 0xe9eef0 });
          for (let m = -2; m <= 2; m++) { const mull = new THREE.BoxGeometry(0.12, 5, 0.12); mull.translate((m * ww) / 5, 12.2, 0.06); sink.add('plain', mull, am, { tint: 0x5c5a52 }); }
          const tr = new THREE.BoxGeometry(ww, 0.14, 0.14); tr.translate(0, 12.2, 0.06); sink.add('plain', tr, am, { tint: 0x5c5a52 });
        }
      }
      // Tall windows above the entrance doors.
      const facade = walls.get('east')!;
      for (const o of facade.openings.filter((x) => x.portal.a === 'exterior' || x.portal.b === 'exterior')) {
        const u = (o.u0 + o.u1) / 2;
        const win = new THREE.PlaneGeometry(3.2, 5.6);
        win.translate(u, 11.4, 0.02);
        sink.add('emissive', win, facade.side.basis, { tint: 0xdfe9ef });
        for (let k = -1; k <= 1; k++) { const mull = new THREE.BoxGeometry(0.1, 5.6, 0.1); mull.translate(u + k * 0.8, 11.4, 0.06); sink.add('plain', mull, facade.side.basis, { tint: 0x4a4a44 }); }
        light.pools.push(pool(r.x1 - 3, 1, o.portal.z, 7, 0xdfeaf0, 0.25));
      }
      // Engaged columns flanking the grand staircase arch, and the welcome banner above it.
      const grand = map.portals.find((p) => p.kind === 'grand' && (p.a === r.id || p.b === r.id));
      if (grand) {
        const wallX = grand.x === r.x0 ? r.x0 + WALL_T : r.x1 - WALL_T;
        const inward = grand.x === r.x0 ? 1 : -1;
        // Columns stop under the balcony slab so they never cut through it or the banner.
        for (const dz of [-1, 1]) sink.add('stone', column(7.3, 0.55, 'corinthian'), M(wallX + inward * 0.9, 0, grand.z + dz * (grand.width / 2 + 1)), { tint: 0xf1e7d4, collide: true });
        post.push(welcomeBanner(V(wallX + inward * 1.4, 13.2, grand.z), inward));
      }
      break;
    }

    case 'dino': {
      buildFloor(sink, r, 'terrazzo', 0xf2ece2);
      buildWalls(sink, map, r, { mat: 'stone', tint: 0xeee5d4, cornice: 11.2, stringCourses: [6.2], trimMat: 'plaster', trimTint: 0xf3ebdc });
      // Barrel vault springing at 12 m with a skylight strip along the crown.
      const vault = barrelVault(r.x1 - r.x0 - WALL_T * 2, 6, r.z1 - r.z0, 16);
      sink.add('plaster', vault, M((r.x0 + r.x1) / 2, 12, (r.z0 + r.z1) / 2), { tint: 0xf3ecdf });
      for (let z = r.z0 + 3; z < r.z1; z += 6.2) {
        const rib = barrelVault(r.x1 - r.x0 - WALL_T * 2 - 0.4, 5.85, 0.6, 16);
        sink.add('stone', rib, M((r.x0 + r.x1) / 2, 12, z), { tint: 0xd9ccb6 });
        // Pilasters carrying the ribs.
        for (const x of [r.x0 + WALL_T, r.x1 - WALL_T - 0.5]) {
          const isCat = true; // catwalks run along both walls; pilasters sit behind them
          if (isCat) sink.box('stone', x, 0, z - 0.6, x + 0.5, 12, z + 0.6, { tint: 0xe9dfcc });
        }
      }
      const sky = new THREE.PlaneGeometry(4, r.z1 - r.z0 - 1, 1, 12);
      sky.rotateX(Math.PI / 2);
      sink.add('emissive', sky, M((r.x0 + r.x1) / 2, 17.9, (r.z0 + r.z1) / 2), { tint: 0xf4f7f7 });
      const mid = (r.x0 + r.x1) / 2;
      for (let z = r.z0 + 5; z < r.z1; z += 10) {
        light.pools.push(pool(mid, 0, z, 12, 0xfff5e0, 0.32));
        if (Math.round((z - r.z0 - 5) / 10) % 2 === 0) extras.shafts.push({ top: V(mid, 17.6, z), bottom: V(mid + 1.5, 0, z + 3), radius: 1.8 });
      }
      buildPlatforms(sink, map, r.id, 'stone', 0xe9dfcc, 'stone', 0xe9dfcc);
      buildStairs(sink, map, r.id, 'stone', 0xe0d6c4);
      buildRails(sink, map, inRoom, 'stone', 0xe0d6c4);
      // Catwalk brackets.
      for (const p of map.platforms.filter((x) => x.room === r.id && x.style === 'catwalk')) {
        for (let z = p.z0 + 2; z < p.z1; z += 4) {
          const g = new THREE.BoxGeometry(p.x1 - p.x0, 0.6, 0.12);
          g.translate((p.x0 + p.x1) / 2, p.y - 0.55, z);
          sink.add('plain', g, undefined, { tint: 0x33363b });
        }
      }
      break;
    }

    case 'gallery': case 'sculpture': {
      const sculpture = r.style === 'sculpture';
      buildFloor(sink, r, sculpture ? 'marble' : 'wood', sculpture ? undefined : 0xb88a5c);
      const wallTint = r.wallColor ?? 0x6e1f2a;
      const walls = buildWalls(sink, map, r, sculpture
        ? { mat: 'stone', tint: 0xefe6d6, cornice: r.ceilY - r.floorY - 1.9, trimMat: 'plaster', trimTint: 0xf3ead9 }
        : { mat: 'plaster', tint: 0xf1eadf, lowerMat: 'damask', lowerTint: wallTint, lowerTop: 5.6, cornice: 6.2, trimMat: 'plaster', trimTint: 0xf3ebdf });
      {
        // Coved ceiling with a laylight.
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        const W = r.x1 - r.x0 - WALL_T * 2, D = r.z1 - r.z0 - WALL_T * 2;
        for (const [dx, dz, w, d] of [[0, -D / 2 + 0.9, W, 1.8], [0, D / 2 - 0.9, W, 1.8], [-W / 2 + 0.9, 0, 1.8, D], [W / 2 - 0.9, 0, 1.8, D]] as const) {
          const cove = new THREE.BoxGeometry(w, 0.3, d);
          cove.translate(cx + dx, r.ceilY - 1.3, cz + dz);
          sink.add('plaster', cove, undefined, { tint: 0xf2ebe0 });
        }
        sink.box('plaster', r.x0, r.ceilY - 1.3, r.z0, r.x1, r.ceilY - 1.0, r.z0 + 2.3, { tint: 0xf3ece1 });
        sink.box('plaster', r.x0, r.ceilY - 1.3, r.z1 - 2.3, r.x1, r.ceilY - 1.0, r.z1, { tint: 0xf3ece1 });
        sink.box('plaster', r.x0, r.ceilY - 1.3, r.z0, r.x0 + 2.3, r.ceilY - 1.0, r.z1, { tint: 0xf3ece1 });
        sink.box('plaster', r.x1 - 2.3, r.ceilY - 1.3, r.z0, r.x1, r.ceilY - 1.0, r.z1, { tint: 0xf3ece1 });
        const lay = new THREE.PlaneGeometry(W - 4.6, D - 4.6);
        lay.rotateX(Math.PI / 2);
        sink.add('emissive', lay, M(cx, r.ceilY - 1.05, cz), { tint: 0xf7f6ef });
        for (let x = r.x0 + 2.8; x < r.x1 - 2.3; x += 1.5) sink.box('plain', x, r.ceilY - 1.15, r.z0 + 2.3, x + 0.06, r.ceilY - 1.05, r.z1 - 2.3, { tint: 0x8d8678 });
        light.pools.push(pool(cx, 0, cz, 9, 0xfff6e6, 0.28), pool(cx, 3, cz, 10, 0xfff6e6, 0.2));
      }
      // Paintings on all four walls.
      for (const key of ['west', 'east', 'north', 'south'] as const) {
        const { side, openings } = walls.get(key)!;
        const long = key === 'west' || key === 'east';
        const group = sculpture || /[24]$/.test(r.id) || r.id === 'asianArt' ? 'portrait' : 'european';
        hangPaintings(sink, ctx, side, openings, group, { maxW: long ? 3.2 : 2.2, maxH: sculpture ? 2 : 2.6, centreY: sculpture ? 2.3 : 2.35, gap: 0.9 });
      }
      break;
    }

    case 'egypt': {
      buildFloor(sink, r, 'sandstone', 0x8f7556);
      const walls = buildWalls(sink, map, r, { mat: 'sandstone', tint: 0xc4a47c, cornice: null, trimMat: 'sandstone', trimTint: 0xb08e66, surrounds: true });
      buildFlatCeiling(sink, r, 'plaster', 0x5a4a3a);
      // Ceiling beams.
      for (let x = r.x0 + 2; x < r.x1; x += 3) sink.box('wood', x, r.ceilY - 0.35, r.z0, x + 0.3, r.ceilY, r.z1, { tint: 0x4a3626 });
      // Reliefs on the long walls.
      for (const key of ['north', 'south'] as const) {
        const { side, openings } = walls.get(key)!;
        hangPaintings(sink, ctx, side, openings, 'egypt', { maxW: 2.4, maxH: 1.6, centreY: 2.0, gap: 1.6 });
      }
      // Spot pools on every exhibit; dim between them.
      for (const b of blocks) light.pools.push(pool((b.x0 + b.x1) / 2, Math.min(r.ceilY - 0.5, b.y1 + 1.5), (b.z0 + b.z1) / 2, 6.5, 0xffc983, 0.75));
      for (let x = r.x0 + 4; x < r.x1; x += 8) light.pools.push(pool(x, 2.5, (r.z0 + r.z1) / 2, 4.5, 0xffb870, 0.32));
      break;
    }

    case 'cultures': {
      buildFloor(sink, r, 'wood', 0xe2b88f);
      buildWalls(sink, map, r, { mat: 'plaster', tint: 0x7a4e3c, cornice: 9.5, trimMat: 'plaster', trimTint: 0x5a3a2c });
      buildFlatCeiling(sink, r, 'plaster', 0x3a2c24);
      // Track lights.
      for (let x = r.x0 + 3; x < r.x1; x += 6) sink.box('plain', x, r.ceilY - 0.2, r.z0 + 1, x + 0.1, r.ceilY - 0.1, r.z1 - 1, { tint: 0x111111 });
      for (const b of blocks) light.pools.push(pool((b.x0 + b.x1) / 2, Math.min(r.ceilY - 0.5, b.y1 + 2), (b.z0 + b.z1) / 2, 8, 0xffd9a8, 0.8));
      for (let x = r.x0 + 5; x < r.x1; x += 10) for (let z = r.z0 + 5; z < r.z1; z += 9) light.pools.push(pool(x, 0.5, z, 6, 0xffe2b8, 0.35));
      break;
    }

    case 'courtNorth': case 'courtSouth': {
      const north = r.style === 'courtNorth';
      buildFloor(sink, r, 'stone', 0xf0e9dc);
      const glassSide = north ? 'north' : 'south';
      buildWalls(sink, map, r, { mat: 'stone', tint: 0xf1e8d8, cornice: 16.5, corniceScale: 1.2, stringCourses: [6], trimMat: 'plaster', trimTint: 0xf3ebdc, skip: [glassSide] });
      // Slanted glass wall: mullions leaning outward, with park beyond.
      const zEdge = north ? r.z0 : r.z1, out = north ? -1 : 1;
      for (let x = r.x0; x <= r.x1 + 1e-3; x += 3) {
        const m = new THREE.BoxGeometry(0.18, Math.hypot(r.ceilY, 4), 0.3);
        m.rotateX(out * -Math.atan2(4, r.ceilY));
        m.translate(x, r.ceilY / 2, zEdge + out * 2);
        sink.add('plain', m, undefined, { tint: 0x3d4248 });
      }
      for (let y = 4; y < r.ceilY; y += 4) {
        const t = new THREE.BoxGeometry(r.x1 - r.x0, 0.14, 0.2);
        t.translate((r.x0 + r.x1) / 2, y, zEdge + out * (y / r.ceilY) * 4);
        sink.add('plain', t, undefined, { tint: 0x3d4248 });
      }
      const glass = new THREE.PlaneGeometry(r.x1 - r.x0, Math.hypot(r.ceilY, 4));
      glass.rotateX(out * -Math.atan2(4, r.ceilY));
      glass.translate((r.x0 + r.x1) / 2, r.ceilY / 2, zEdge + out * 2);
      sink.add('glass', glass, undefined, { tint: 0xd5ecf3 });
      sink.collideBox(r.x0, r.floorY, zEdge - (north ? 0.3 : 0), r.x1, r.ceilY, zEdge + (north ? 0 : 0.3));
      // Glazed roof: grid of skylights.
      sink.box('plaster', r.x0, r.ceilY, r.z0, r.x1, r.ceilY + 0.4, r.z1, { tint: 0xe6ddd0 });
      for (let x = r.x0 + 4; x < r.x1 - 4; x += 8) for (let z = r.z0 + 4; z < r.z1 - 3; z += 8) {
        sink.box('emissive', x, r.ceilY - 0.02, z, x + 6, r.ceilY, z + 6, { tint: 0xf8fbfb });
      }
      for (let x = r.x0 + 8; x < r.x1; x += 16) light.pools.push(pool(x, 0, (r.z0 + r.z1) / 2, 16, 0xfff6e8, 0.25));
      const temple = blocks.find((b) => b.kind === 'temple' && !b.variant);
      if (temple) extras.shafts.push({ top: V((temple.x0 + temple.x1) / 2, 19.5, temple.z1 + 4), bottom: V((temple.x0 + temple.x1) / 2, 1.2, temple.z1), radius: 2.2 });
      buildPlatforms(sink, map, r.id, 'stone', 0xe7dccb, 'stone', 0xe7dccb);
      buildStairs(sink, map, r.id, 'stone', 0xe5dac8);
      buildRails(sink, map, inRoom, 'stone', 0xe5dac8);
      // Capture zone ring around the relic pedestal.
      const zone = map.zones.find((z) => z.room === r.id && z.kind === 'capture');
      if (zone) {
        const ring = new THREE.RingGeometry(zone.radius - 0.18, zone.radius, 48);
        ring.rotateX(-Math.PI / 2);
        sink.add('emissive', ring, M(zone.center[0], zone.center[1] + 0.012, zone.center[2]), { tint: north ? 0xe0b84a : 0x3fae86 });
      }
      break;
    }

    case 'stairhall': {
      buildFloor(sink, r, 'marble');
      buildWalls(sink, map, r, { mat: 'stone', tint: 0xf1e8d6, cornice: r.ceilY - 2.2, corniceScale: 1.2, stringCourses: [7.2], trimMat: 'plaster', trimTint: 0xf5eee0 });
      buildPlatforms(sink, map, r.id, 'marble', 0xf1e9db, 'stone', 0xe9dfcc);
      buildStairs(sink, map, r.id, 'marble', 0xf3ebdc);
      buildRails(sink, map, inRoom, 'stone', 0xf2e9d8);
      // Coffered ceiling around a long skylight over the stair.
      sink.add('plaster', cofferedCeiling(r.x1 - r.x0 - 1, r.z1 - r.z0 - 1, 1.6, 0.22, 0.35), M((r.x0 + r.x1) / 2, r.ceilY - 0.35, (r.z0 + r.z1) / 2), { tint: 0xf1e8d8 });
      const sky = new THREE.PlaneGeometry(r.x1 - r.x0 - 4, 5);
      sky.rotateX(Math.PI / 2);
      sink.add('emissive', sky, M((r.x0 + r.x1) / 2, r.ceilY - 0.4, (r.z0 + r.z1) / 2), { tint: 0xf6f8f6 });
      light.pools.push(pool((r.x0 + r.x1) / 2, 4, (r.z0 + r.z1) / 2, 14, 0xfff4e0, 0.3), pool(r.x0 + 2, r.floorY + 9, (r.z0 + r.z1) / 2, 8, 0xfff4e0, 0.25));
      extras.shafts.push({ top: V((r.x0 + r.x1) / 2, r.ceilY - 0.5, (r.z0 + r.z1) / 2), bottom: V((r.x0 + r.x1) / 2 + 1, 2, (r.z0 + r.z1) / 2 + 1), radius: 1.6 });
      break;
    }

    case 'arms': {
      buildFloor(sink, r, 'stone', 0x9d968a);
      const walls = buildWalls(sink, map, r, { mat: 'plaster', tint: 0x3d4250, cornice: r.ceilY - r.floorY - 0.9, trimMat: 'stone', trimTint: 0xb8ad9a });
      buildFlatCeiling(sink, r, 'plaster', 0x262a33);
      for (let x = r.x0 + 3; x < r.x1; x += 5) sink.box('plain', x, r.ceilY - 0.2, r.z0 + 1, x + 0.1, r.ceilY - 0.1, r.z1 - 1, { tint: 0x111111 });
      // Heraldic banners along the long walls.
      for (const key of ['west', 'east'] as const) {
        const { side, openings } = walls.get(key)!;
        for (let u = 4; u < side.length - 3; u += 7) {
          if (openings.some((o) => u > o.u0 - 1.5 && u < o.u1 + 1.5)) continue;
          const colors = [0x8a1f24, 0x1f3a6a, 0xc9a24f, 0x2a5a2a];
          const ban = new THREE.PlaneGeometry(1.2, 3);
          ban.translate(u, 5, 0.03);
          sink.add('plain', ban, side.basis, { tint: colors[Math.floor(u) % 4], gain: 1.1 });
        }
      }
      for (const b of blocks) light.pools.push(pool((b.x0 + b.x1) / 2, Math.min(r.ceilY - 0.5, b.y1 + 2.5), (b.z0 + b.z1) / 2, 6, 0xfff0d0, 0.8));
      for (let z = r.z0 + 4; z < r.z1; z += 8) light.pools.push(pool((r.x0 + r.x1) / 2, 0.5, z, 6, 0xffe8c8, 0.3));
      break;
    }

    case 'american': case 'modern': {
      const modern = r.style === 'modern';
      buildFloor(sink, r, modern ? 'terrazzo' : 'wood', modern ? 0xf2f0ec : 0xc8996a);
      const walls = buildWalls(sink, map, r, modern
        ? { mat: 'plaster', tint: 0xf7f6f2, cornice: null, skirting: false, trimMat: 'plain', trimTint: 0xe9e7e2 }
        : { mat: 'plaster', tint: 0xeee5d2, cornice: r.ceilY - r.floorY - 0.9, trimMat: 'plaster', trimTint: 0xf6efe0 });
      buildFlatCeiling(sink, r, 'plaster', modern ? 0xf4f3ef : 0xf1ebdf);
      // Long light strips (modern) or laylight panels (American Wing).
      for (let x = r.x0 + 4; x < r.x1 - 2; x += 6) {
        if (modern) sink.box('emissive', x, r.ceilY - 0.05, r.z0 + 2, x + 0.25, r.ceilY, r.z1 - 2, { tint: 0xffffff });
        else for (let z = r.z0 + 3; z < r.z1 - 3; z += 6) sink.box('emissive', x, r.ceilY - 0.05, z, x + 3.5, r.ceilY, z + 3.5, { tint: 0xf6f3ea });
      }
      for (const key of ['west', 'east', 'north', 'south'] as const) {
        const { side, openings } = walls.get(key)!;
        hangPaintings(sink, ctx, side, openings, modern ? 'european' : 'portrait', { maxW: 3, maxH: 2.4, centreY: 2.4, gap: 1.6 });
      }
      for (let x = r.x0 + 6; x < r.x1; x += 12) for (let z = r.z0 + 6; z < r.z1; z += 12) light.pools.push(pool(x, 2, z, 10, 0xfff8ee, 0.32));
      break;
    }

    case 'greek': {
      buildFloor(sink, r, 'marble');
      buildWalls(sink, map, r, { mat: 'stone', tint: 0xf2eadb, cornice: 7.2, corniceScale: 1.1, trimMat: 'plaster', trimTint: 0xf6efe2 });
      // Barrel vault running away from the Great Hall, with a skylight along the crown.
      const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
      const span = (alongX ? r.z1 - r.z0 : r.x1 - r.x0) - WALL_T * 2;
      const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
      const vault = barrelVault(span, Math.min(4, r.ceilY - 8.2), len, 16);
      if (alongX) vault.rotateY(Math.PI / 2);
      sink.add('plaster', vault, M((r.x0 + r.x1) / 2, 8.2, (r.z0 + r.z1) / 2), { tint: 0xf4ede0 });
      const sky = new THREE.PlaneGeometry(alongX ? len - 2 : 3, alongX ? 3 : len - 2);
      sky.rotateX(Math.PI / 2);
      sink.add('emissive', sky, M((r.x0 + r.x1) / 2, r.ceilY - 0.2, (r.z0 + r.z1) / 2), { tint: 0xf6f8f6 });
      const cxg = (r.x0 + r.x1) / 2, czg = (r.z0 + r.z1) / 2;
      light.pools.push(pool(cxg, 0, czg, 14, 0xfff6e2, 0.35));
      for (const b of blocks) light.pools.push(pool((b.x0 + b.x1) / 2, b.y1 + 2, (b.z0 + b.z1) / 2, 4, 0xfff4e0, 0.4));
      extras.shafts.push({ top: V(cxg - 5, r.ceilY - 0.5, czg), bottom: V(cxg - 4, 0, czg + 1), radius: 1.6 }, { top: V(cxg + 6, r.ceilY - 0.5, czg), bottom: V(cxg + 7, 0, czg + 1), radius: 1.6 });
      break;
    }

    case 'service': case 'office': case 'stairwell': {
      buildFloor(sink, r, 'concrete', 0x9a9d98);
      buildWalls(sink, map, r, { mat: 'block', tint: r.style === 'office' ? 0xd9d6c8 : 0xcfd3c4, lowerMat: 'block', lowerTint: 0x7d8f7a, lowerTop: 1.1, cornice: null, skirting: false, surrounds: true, trimMat: 'plain', trimTint: 0x5a6a5c });
      if (!r.noCeiling) {
        buildFlatCeiling(sink, r, 'concrete', 0x8e918c);
        const long = r.x1 - r.x0 < r.z1 - r.z0;
        // Pipes and fluorescent tubes.
        const pipe = (off: number, rad: number, tint: number) => {
          const g = new THREE.CylinderGeometry(rad, rad, long ? r.z1 - r.z0 : r.x1 - r.x0, 8);
          if (long) g.rotateX(Math.PI / 2); else g.rotateZ(Math.PI / 2);
          g.translate(long ? r.x0 + off : (r.x0 + r.x1) / 2, r.ceilY - 0.35 - rad, long ? (r.z0 + r.z1) / 2 : r.z0 + off);
          sink.add('plain', g, undefined, { tint });
        };
        pipe(0.8, 0.12, 0x8a4a3a); pipe(1.2, 0.08, 0x6a7a8a); pipe(0.6, 0.05, 0xc9b23c);
        const n = Math.max(1, Math.floor((long ? r.z1 - r.z0 : r.x1 - r.x0) / 5));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const x = long ? (r.x0 + r.x1) / 2 + 0.5 : r.x0 + t * (r.x1 - r.x0);
          const z = long ? r.z0 + t * (r.z1 - r.z0) : (r.z0 + r.z1) / 2 + 0.5;
          sink.box('emissive', x - (long ? 0.08 : 0.6), r.ceilY - 0.12, z - (long ? 0.6 : 0.08), x + (long ? 0.08 : 0.6), r.ceilY - 0.02, z + (long ? 0.6 : 0.08), { tint: 0xf2fff8 });
          light.pools.push(pool(x, r.ceilY - 0.3, z, 5, 0xe6fff2, 0.45));
        }
      }
      buildStairs(sink, map, r.id, 'concrete', 0x8e918c);
      // Fire doors on corridor ends (visual frames).
      break;
    }
  }

  for (const b of blocks) buildBlock(sink, b);
  for (const e of map.elevators) for (const stop of e.stops) if (stop.room === r.id) buildElevatorCab(sink, e, stop.y, light);
  extras.ambientHex = light.sky.getHex();
  const group = sink.build(light, r.id);
  for (const m of post) group.add(m);
  return { group, colliders: sink.colliders, extras };
}

/** Elevator cab: back and side walls, roof, a brass frame, and a shaft above it. Open on `facing`. */
export const CAB = 2.8;
function buildElevatorCab(sink: Sink, e: Elevator, y: number, light: RoomLight) {
  const h = 2.9, t = 0.12, half = CAB / 2;
  const x0 = e.x - half, x1 = e.x + half, z0 = e.z - half, z1 = e.z + half;
  const wall = (ax0: number, ax1: number, az0: number, az1: number) => sink.box('wood', ax0, y, az0, ax1, y + h, az1, { tint: 0x8a6a4a, collide: true });
  if (e.facing !== '-x') wall(x0, x0 + t, z0, z1);
  if (e.facing !== '+x') wall(x1 - t, x1, z0, z1);
  if (e.facing !== '-z') wall(x0, x1, z0, z0 + t);
  if (e.facing !== '+z') wall(x0, x1, z1 - t, z1);
  sink.box('plain', x0, y + h, z0, x1, y + h + 0.15, z1, { tint: 0x6a5434, gain: 1.2 });
  sink.box('emissive', e.x - 0.6, y + h - 0.02, e.z - 0.6, e.x + 0.6, y + h, e.z + 0.6, { tint: 0xfff2d6 });
  // Brass door frame on the open side.
  const fx = e.facing === '+x' ? x1 : e.facing === '-x' ? x0 : null;
  const fz = e.facing === '+z' ? z1 : e.facing === '-z' ? z0 : null;
  if (fx !== null) { sink.box('plain', fx - 0.08, y, z0, fx + 0.08, y + h, z0 + 0.25, { tint: 0xc9a24f, gain: 1.3 }); sink.box('plain', fx - 0.08, y, z1 - 0.25, fx + 0.08, y + h, z1, { tint: 0xc9a24f, gain: 1.3 }); sink.box('plain', fx - 0.08, y + h - 0.3, z0, fx + 0.08, y + h, z1, { tint: 0xc9a24f, gain: 1.3 }); }
  if (fz !== null) { sink.box('plain', x0, y, fz - 0.08, x0 + 0.25, y + h, fz + 0.08, { tint: 0xc9a24f, gain: 1.3 }); sink.box('plain', x1 - 0.25, y, fz - 0.08, x1, y + h, fz + 0.08, { tint: 0xc9a24f, gain: 1.3 }); sink.box('plain', x0, y + h - 0.3, fz - 0.08, x1, y + h, fz + 0.08, { tint: 0xc9a24f, gain: 1.3 }); }
  light.pools.push({ pos: V(e.x, y + h - 0.2, e.z), radius: 2.5, color: C(0xfff0d0, 0.5) });
}

/** The hanging "Welcome to …" banner over the grand staircase arch. */
function welcomeBanner(pos: THREE.Vector3, inward: number): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 640;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a1520'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#d8b25a'; g.lineWidth = 18; g.strokeRect(30, 30, c.width - 60, c.height - 60);
  g.lineWidth = 4; g.strokeRect(60, 60, c.width - 120, c.height - 120);
  g.fillStyle = '#f3e3b8'; g.textAlign = 'center';
  g.font = 'italic 120px Georgia, serif';
  g.fillText('Welcome to', c.width / 2, 250);
  g.fillStyle = '#ffd77a';
  g.font = 'bold 230px Georgia, serif';
  g.fillText(MUSEUM_NAME.replace(/^THE /, 'The ').replace(/MUSEUM/, 'Museum'), c.width / 2, 500);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const group = new THREE.Group();
  group.name = 'welcomeBanner';
  const w = 16, h = 5;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 12, 1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  // A gentle sag so it reads as hanging fabric.
  const pos2 = cloth.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos2.count; i++) pos2.setZ(i, -Math.cos((pos2.getX(i) / w) * Math.PI) * 0.18);
  cloth.geometry.computeVertexNormals();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 0.6, 8), new THREE.MeshLambertMaterial({ color: 0xc9a24f }));
  rod.rotation.z = Math.PI / 2;
  rod.position.y = h / 2 + 0.05;
  for (const end of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), rod.material);
    finial.position.set(end * (w / 2 + 0.35), h / 2 + 0.05, 0);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }));
    cord.position.set(end * (w / 2 - 0.4), h / 2 + 1.15, 0);
    group.add(finial, cord);
  }
  group.add(cloth, rod);
  group.position.copy(pos);
  group.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
  return group;
}
