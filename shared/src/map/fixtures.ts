import type { Block, MuseumMap, Room } from './types.js';

/**
 * The museum's built-in fixtures that Insurance Fraud lets you break: every
 * painting hung on a gallery wall, and the exhibits (statues, knights, cases,
 * skeletons…). Computed from map data here so the client (which draws them)
 * and the server (which owns their hit points) agree on ids and positions.
 */

/** Wall thickness: walls sit inside room bounds (matches the client's builder). */
export const WALL_THICKNESS = 0.5;

export interface WallPaintingSpot {
  id: string;
  room: string;
  /** Centre of the canvas, just off the wall face. */
  x: number; y: number; z: number;
  /** Facing into the room (yaw 0 faces +z). */
  yaw: number;
  /** The space the painting is fitted into. */
  w: number; h: number;
  /** Wall-local frame for the builder: along-wall coordinate and side. */
  side: 'north' | 'south' | 'west' | 'east';
  u: number;
}

interface PlainSide { key: WallPaintingSpot['side']; ox: number; oz: number; dx: number; dz: number; nx: number; nz: number; length: number }

export function plainWallSides(r: Room): PlainSide[] {
  const T = WALL_THICKNESS;
  return [
    { key: 'north', ox: r.x0, oz: r.z0 + T, dx: 1, dz: 0, nx: 0, nz: 1, length: r.x1 - r.x0 },
    { key: 'south', ox: r.x1, oz: r.z1 - T, dx: -1, dz: 0, nx: 0, nz: -1, length: r.x1 - r.x0 },
    { key: 'west', ox: r.x0 + T, oz: r.z1, dx: 0, dz: -1, nx: 1, nz: 0, length: r.z1 - r.z0 },
    { key: 'east', ox: r.x1 - T, oz: r.z0, dx: 0, dz: 1, nx: -1, nz: 0, length: r.z1 - r.z0 },
  ];
}

/** Openings (portals) along a wall, in along-wall coordinates. */
function openingsAlong(map: MuseumMap, r: Room, s: PlainSide): [number, number][] {
  const out: [number, number][] = [];
  for (const p of map.portals) {
    if (p.a !== r.id && p.b !== r.id) continue;
    const onLine = s.key === 'north' ? p.axis === 'x' && p.z === r.z0
      : s.key === 'south' ? p.axis === 'x' && p.z === r.z1
      : s.key === 'west' ? p.axis === 'z' && p.x === r.x0
      : p.axis === 'z' && p.x === r.x1;
    if (!onLine || p.y < r.floorY - 0.01 || p.y >= r.ceilY) continue;
    const u = (p.x - s.ox) * s.dx + (p.z - s.oz) * s.dz;
    out.push([u - p.width / 2, u + p.width / 2]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Which walls of which rooms are hung, and how (mirrors the room styles). */
function hangingFor(r: Room): { sides: PlainSide['key'][]; maxW: number; maxH: number; centreY: number; gap: number } | null {
  if (r.style === 'gallery' || r.style === 'sculpture') return { sides: ['west', 'east', 'north', 'south'], maxW: 2.2, maxH: r.style === 'sculpture' ? 2 : 2.6, centreY: r.style === 'sculpture' ? 2.3 : 2.35, gap: 0.9 };
  if (r.style === 'egypt') return { sides: ['north', 'south'], maxW: 2.4, maxH: 1.6, centreY: 2.0, gap: 1.6 };
  if (r.style === 'american' || r.style === 'modern') return { sides: ['west', 'east', 'north', 'south'], maxW: 2.6, maxH: 2.2, centreY: 2.4, gap: 1.6 };
  return null;
}

let spotsCache: WallPaintingSpot[] | null = null;

/** Every painting spot on every hung wall: fixed-size spaces, evenly spread between doorways. */
export function wallPaintingSpots(map: MuseumMap): WallPaintingSpot[] {
  if (spotsCache) return spotsCache;
  const out: WallPaintingSpot[] = [];
  for (const r of map.rooms) {
    const how = hangingFor(r);
    if (!how) continue;
    for (const s of plainWallSides(r)) {
      if (!how.sides.includes(s.key)) continue;
      const long = s.key === 'west' || s.key === 'east';
      const w = how.maxW * (long && how.maxW < 2.5 ? 1.25 : 1), h = how.maxH;
      // Free runs between doorways, with a margin at the corners and beside each opening.
      const runs: [number, number][] = [];
      let a = 1.2;
      for (const [u0, u1] of openingsAlong(map, r, s)) { if (u0 - 0.6 - a > 1.5) runs.push([a, u0 - 0.6]); a = u1 + 0.6; }
      if (s.length - 1.2 - a > 1.5) runs.push([a, s.length - 1.2]);
      let i = 0;
      for (const [ra, rb] of runs) {
        const n = Math.floor((rb - ra + how.gap) / (w + how.gap));
        if (n < 1) continue;
        const total = n * w + (n - 1) * how.gap;
        let u = ra + (rb - ra - total) / 2 + w / 2;
        for (let k = 0; k < n; k++, i++, u += w + how.gap) {
          out.push({
            id: `wp:${r.id}:${s.key}:${i}`, room: r.id,
            x: s.ox + s.dx * u + s.nx * 0.06, y: r.floorY + how.centreY, z: s.oz + s.dz * u + s.nz * 0.06,
            yaw: Math.atan2(s.nx, s.nz), w, h, side: s.key, u,
          });
        }
      }
    }
  }
  spotsCache = out;
  return out;
}

/** Exhibit kinds you can break (architecture, pools and the lobby totem can't be). */
const BREAKABLE_KINDS: Partial<Record<Block['kind'], string>> = {
  sculpture: 'exSculpture', statue: 'exStatue', knight: 'exKnight', case: 'exCase', obelisk: 'exObelisk',
  sarcophagus: 'exSarcophagus', diorama: 'exDiorama', mastaba: 'exMastaba', temple: 'exTemple', colonnade: 'exColonnade',
  bench: 'exBench', planter: 'exPlanter', crate: 'exCrate', barrier: 'exCart', desk: 'exDesk',
};

export interface ExhibitFixture {
  id: string; block: string; variant: string; room: string;
  x: number; y: number; z: number;
  /** Floor level under it and its height (for hits and the rubble). */
  floorY: number; height: number;
  /** Half-extents in plan. */
  hx: number; hz: number;
}

let exhibitCache: ExhibitFixture[] | null = null;

export function exhibitFixtures(map: MuseumMap): ExhibitFixture[] {
  if (exhibitCache) return exhibitCache;
  const out: ExhibitFixture[] = [];
  for (const b of map.blocks) {
    if (b.room === 'exterior' && b.kind !== 'barrier') continue;
    let variant = BREAKABLE_KINDS[b.kind];
    // Skeleton plinths are the Dinosaur Hall's prize pieces; relic pedestals and plain plinths stay.
    if (b.kind === 'plinth' && (b.variant === 'rex' || b.variant === 'sauropod' || b.variant === 'trike')) variant = 'exSkeleton';
    if (!variant) continue;
    const skeleton = variant === 'exSkeleton';
    const height = skeleton ? (b.variant === 'sauropod' ? 7 : 4.5) : b.y1 - b.y0;
    out.push({
      id: `bk:${b.id}`, block: b.id, variant, room: b.room,
      x: (b.x0 + b.x1) / 2, y: b.y0 + Math.min(height / 2, 1.3), z: (b.z0 + b.z1) / 2,
      floorY: b.y0, height, hx: (b.x1 - b.x0) / 2, hz: (b.z1 - b.z0) / 2,
    });
  }
  exhibitCache = out;
  return out;
}

/** What each fixture is called and how it reads on the price tag. */
export const FIXTURE_NAME: Record<string, string> = {
  wallPainting: 'painting', exSculpture: 'sculpture', exStatue: 'Egyptian statue', exKnight: 'suit of armour on horseback',
  exCase: 'display case', exObelisk: 'carved pole', exSarcophagus: 'sarcophagus', exDiorama: 'diorama', exMastaba: 'mastaba chapel',
  exTemple: 'temple', exColonnade: 'bank facade', exBench: 'bench', exPlanter: 'planter', exCrate: 'crate', exCart: 'hot-dog cart',
  exDesk: 'information desk', exSkeleton: 'dinosaur skeleton',
};
