import type {
  Block, Door, Elevator, MuseumMap, Platform, Portal, Rail, Room, Slot, Spawn, Stair, Zone,
} from './types.js';
import { groundHeightAt } from './ground.js';

/*
 * The museum, as data. +x east (Fifth Avenue), +z south, north is −z.
 * Ground floor y = 0, second floor y = 8, service level y = −6.
 *
 * The plan follows the Met's: the Great Hall runs along the facade with
 * Egyptian Art to the north and Greek & Roman to the south; behind it the
 * grand staircase, flanked by Arms & Armor and the Arts of Africa, Oceania and
 * the Americas; the Dinosaur Hall is the long central spine; the American Wing,
 * a sculpture court and Modern Art line the park side; European Paintings fill
 * the second floor. The Temple Court (north) and Glass Court (south) are the bases.
 *
 *   x: −60 … −22 west band | −22 … −2 Dinosaur Hall | −2 … 12 connector | 12 … 39 front band | 39+ avenue
 *   z: −76 … −50 North Court | −50 … 50 main block | 50 … 76 South Court
 */

const PI = Math.PI;
const F2 = 8; // second-floor level

// ─── Rooms ────────────────────────────────────────────────────────────────────
const paintColors = [0x6e1f2a, 0x1f4a3a, 0x24365e, 0x7a3b1e, 0x5a2a4e, 0x2f5552, 0x6a4a1e, 0x3a2a5e, 0x6e1f2a, 0x1f4a3a];
const ROWS = [-50, -30, -10, 10, 30, 50];

const rooms: Room[] = [
  { id: 'exterior', name: 'Fifth Avenue', style: 'exterior', x0: 39, x1: 130, z0: -80, z1: 80, floorY: -2.4, ceilY: 40, open: true, acoustic: 'outdoor' },
  // Front band.
  { id: 'greatHall', name: 'The Great Hall', style: 'lobby', x0: 12, x1: 39, z0: -28, z1: 28, floorY: 0, ceilY: 22, acoustic: 'hall' },
  { id: 'egyptS', name: 'Egyptian Art — Offering Hall', style: 'egypt', x0: 12, x1: 39, z0: -34, z1: -28, floorY: 0, ceilY: 4.5, acoustic: 'tomb' },
  { id: 'egyptM', name: 'Egyptian Art — Mastaba Hall', style: 'egypt', x0: 12, x1: 39, z0: -43, z1: -34, floorY: 0, ceilY: 6, acoustic: 'tomb' },
  { id: 'egyptN', name: 'Egyptian Art — Statue Corridor', style: 'egypt', x0: 12, x1: 39, z0: -50, z1: -43, floorY: 0, ceilY: 4.5, acoustic: 'tomb' },
  { id: 'greek', name: 'Greek and Roman Art', style: 'greek', x0: 12, x1: 39, z0: 28, z1: 50, floorY: 0, ceilY: 12, acoustic: 'gallery' },
  // Connector band behind the Great Hall.
  { id: 'armsArmor', name: 'Arms and Armor', style: 'arms', x0: -2, x1: 12, z0: -50, z1: -12, floorY: 0, ceilY: 7.5, acoustic: 'gallery' },
  { id: 'grandStair', name: 'Grand Staircase', style: 'stairhall', x0: -2, x1: 12, z0: -12, z1: 12, floorY: 0, ceilY: 18, acoustic: 'hall' },
  { id: 'cultures', name: 'Arts of Africa, Oceania, and the Americas', style: 'cultures', x0: -2, x1: 12, z0: 12, z1: 50, floorY: 0, ceilY: 7.5, acoustic: 'gallery' },
  // The spine.
  { id: 'dinoHall', name: 'Dinosaur Hall', style: 'dino', x0: -22, x1: -2, z0: -50, z1: 50, floorY: 0, ceilY: 18, acoustic: 'hall' },
  // Park-side band.
  { id: 'american', name: 'The American Wing', style: 'american', x0: -60, x1: -22, z0: -50, z1: -12, floorY: 0, ceilY: 7.5, acoustic: 'gallery' },
  { id: 'sculptureCourt', name: 'European Sculpture Court', style: 'sculpture', x0: -60, x1: -22, z0: -12, z1: 12, floorY: 0, ceilY: 7.5, acoustic: 'gallery' },
  { id: 'modern', name: 'Modern and Contemporary Art', style: 'modern', x0: -60, x1: -22, z0: 12, z1: 50, floorY: 0, ceilY: 7.5, acoustic: 'gallery' },
  // Second floor.
  { id: 'asianArt', name: 'Asian Art', style: 'gallery', x0: -2, x1: 12, z0: -50, z1: -12, floorY: F2, ceilY: 15, wallColor: 0x2f5552, acoustic: 'gallery' },
  { id: 'instruments', name: 'Musical Instruments', style: 'gallery', x0: -2, x1: 12, z0: 12, z1: 50, floorY: F2, ceilY: 15, wallColor: 0x5a2a4e, acoustic: 'gallery' },
  ...[0, 1, 2, 3, 4].flatMap((i): Room[] => (['W', 'E'] as const).map((col) => ({
    id: `paint${col}${i + 1}`,
    name: `European Paintings ${i * 2 + (col === 'W' ? 1 : 2)}`,
    style: 'gallery',
    x0: col === 'W' ? -60 : -41, x1: col === 'W' ? -41 : -22,
    z0: ROWS[i], z1: ROWS[i + 1],
    floorY: F2, ceilY: 15,
    wallColor: paintColors[i * 2 + (col === 'W' ? 0 : 1)],
    acoustic: 'gallery',
  }))),
  // Bases.
  { id: 'northCourt', name: 'Temple Court', style: 'courtNorth', x0: -60, x1: 39, z0: -76, z1: -50, floorY: 0, ceilY: 20, acoustic: 'court', floorHoles: [{ x0: 22, x1: 26, z0: -73, z1: -61 }] },
  { id: 'southCourt', name: 'Glass Court', style: 'courtSouth', x0: -60, x1: 39, z0: 50, z1: 76, floorY: 0, ceilY: 20, acoustic: 'court', floorHoles: [{ x0: 22, x1: 26, z0: 61, z1: 73 }] },
  // Service level.
  { id: 'stairN', name: 'North Service Stair', style: 'stairwell', x0: 22, x1: 26, z0: -73, z1: -61, floorY: -6, ceilY: 0, noCeiling: true, acoustic: 'service' },
  { id: 'stairS', name: 'South Service Stair', style: 'stairwell', x0: 22, x1: 26, z0: 61, z1: 73, floorY: -6, ceilY: 0, noCeiling: true, acoustic: 'service' },
  { id: 'service', name: 'Service Corridor', style: 'service', x0: 22, x1: 26, z0: -61, z1: 61, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'svcCrossN', name: 'Freight Corridor North', style: 'service', x0: 26, x1: 34, z0: -42, z1: -38, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'svcCrossS', name: 'Freight Corridor South', style: 'service', x0: 26, x1: 34, z0: 38, z1: 42, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'svcEast', name: 'Loading Corridor', style: 'service', x0: 34, x1: 38, z0: -42, z1: 42, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'security', name: 'Security Office', style: 'office', x0: 26, x1: 31, z0: -5, z1: 5, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'lab', name: 'Conservation Lab', style: 'office', x0: 31, x1: 34, z0: -5, z1: 5, floorY: -6, ceilY: -2.6, acoustic: 'service' },
];

// ─── Portals ──────────────────────────────────────────────────────────────────
const P = (
  id: string, a: string, b: string, kind: Portal['kind'], axis: Portal['axis'],
  x: number, y: number, z: number, width: number, height: number,
): Portal => ({ id, a, b, kind, axis, x, y, z, width, height });

/** Openings that share a wall must not overlap along it (they may differ in height only if they don't). */
const portals: Portal[] = [
  // Facade: three arched bays onto the steps.
  P('facadeN', 'exterior', 'greatHall', 'arch', 'z', 39, 0, -8, 4, 6.5),
  P('facadeC', 'exterior', 'greatHall', 'arch', 'z', 39, 0, 0, 4, 6.5),
  P('facadeS', 'exterior', 'greatHall', 'arch', 'z', 39, 0, 8, 4, 6.5),
  // Great Hall: wings to either side, the grand staircase behind, galleries and balconies.
  P('gh-egyptW', 'greatHall', 'egyptS', 'door', 'x', 18, 0, -28, 4, 4),
  P('gh-egyptE', 'greatHall', 'egyptS', 'door', 'x', 33, 0, -28, 4, 4),
  P('gh-greekW', 'greatHall', 'greek', 'arch', 'x', 18, 0, 28, 4, 6),
  P('gh-greekE', 'greatHall', 'greek', 'arch', 'x', 33, 0, 28, 4, 6),
  P('gh-stair', 'greatHall', 'grandStair', 'grand', 'z', 12, 0, 0, 8, 11),
  P('gh-stairN', 'greatHall', 'grandStair', 'door', 'z', 12, 0, -7, 3, 4.5),
  P('gh-stairS', 'greatHall', 'grandStair', 'door', 'z', 12, 0, 7, 3, 4.5),
  P('gh-stairNUp', 'greatHall', 'grandStair', 'door', 'z', 12, F2, -10.5, 2.5, 3.5),
  P('gh-stairSUp', 'greatHall', 'grandStair', 'door', 'z', 12, F2, 10.5, 2.5, 3.5),
  P('gh-arms', 'greatHall', 'armsArmor', 'door', 'z', 12, 0, -20, 4, 5),
  P('gh-cultures', 'greatHall', 'cultures', 'door', 'z', 12, 0, 20, 4, 5),
  P('gh-asian', 'greatHall', 'asianArt', 'door', 'z', 12, F2, -24, 3, 3.5),
  P('gh-instruments', 'greatHall', 'instruments', 'door', 'z', 12, F2, 24, 3, 3.5),
  // Grand staircase: side passages to the spine at ground level, the landing above.
  P('stair-dinoN', 'grandStair', 'dinoHall', 'door', 'z', -2, 0, -8, 4, 5),
  P('stair-dinoS', 'grandStair', 'dinoHall', 'door', 'z', -2, 0, 8, 4, 5),
  P('stair-dinoUp', 'grandStair', 'dinoHall', 'door', 'z', -2, F2, 0, 4, 4),
  P('stair-arms', 'grandStair', 'armsArmor', 'door', 'x', 8, 0, -12, 4, 5),
  P('stair-cultures', 'grandStair', 'cultures', 'door', 'x', 8, 0, 12, 4, 5),
  P('stair-asian', 'grandStair', 'asianArt', 'door', 'x', 3, F2, -12, 3, 3.5),
  P('stair-instruments', 'grandStair', 'instruments', 'door', 'x', 3, F2, 12, 3, 3.5),
  // Dinosaur Hall: the fast lane between the courts, with doors on both sides at both levels.
  P('dino-north', 'dinoHall', 'northCourt', 'grand', 'x', -12, 0, -50, 10, 12),
  P('dino-south', 'dinoHall', 'southCourt', 'grand', 'x', -12, 0, 50, 10, 12),
  P('dino-arms', 'dinoHall', 'armsArmor', 'door', 'z', -2, 0, -30, 4, 5),
  P('dino-cultures', 'dinoHall', 'cultures', 'door', 'z', -2, 0, 30, 4, 5),
  P('dino-asian', 'dinoHall', 'asianArt', 'door', 'z', -2, F2, -40, 3, 3.5),
  P('dino-instruments', 'dinoHall', 'instruments', 'door', 'z', -2, F2, 40, 3, 3.5),
  P('dino-american', 'dinoHall', 'american', 'door', 'z', -22, 0, -30, 4, 5),
  P('dino-sculpture', 'dinoHall', 'sculptureCourt', 'arch', 'z', -22, 0, 0, 8, 6.5),
  P('dino-modern', 'dinoHall', 'modern', 'door', 'z', -22, 0, 30, 4, 5),
  P('dino-paintE1', 'dinoHall', 'paintE1', 'door', 'z', -22, F2, -40, 3, 3.5),
  P('dino-paintE3', 'dinoHall', 'paintE3', 'door', 'z', -22, F2, 7, 3, 3.5),
  P('dino-paintE5', 'dinoHall', 'paintE5', 'door', 'z', -22, F2, 40, 3, 3.5),
  // Park side, ground floor.
  P('american-north', 'american', 'northCourt', 'door', 'x', -41, 0, -50, 4, 5),
  P('american-sculpture', 'american', 'sculptureCourt', 'door', 'x', -41, 0, -12, 6, 5),
  P('sculpture-modern', 'sculptureCourt', 'modern', 'door', 'x', -41, 0, 12, 6, 5),
  P('modern-south', 'modern', 'southCourt', 'door', 'x', -41, 0, 50, 4, 5),
  // Egyptian Art.
  P('egyptS-M-w', 'egyptS', 'egyptM', 'door', 'x', 15, 0, -34, 3, 3.5),
  P('egyptS-M-e', 'egyptS', 'egyptM', 'door', 'x', 31, 0, -34, 3, 3.5),
  P('egyptS-M-crawl', 'egyptS', 'egyptM', 'crawl', 'x', 37, 0, -34, 1.2, 1.2),
  P('egyptM-N-w', 'egyptM', 'egyptN', 'door', 'x', 14.5, 0, -43, 3, 3.5),
  P('egyptM-N-secret', 'egyptM', 'egyptN', 'secret', 'x', 29, 0, -43, 1.6, 2.6),
  P('egyptM-N-e', 'egyptM', 'egyptN', 'door', 'x', 36, 0, -43, 3, 3.5),
  P('egypt-northW', 'egyptN', 'northCourt', 'door', 'x', 18, 0, -50, 3.5, 4),
  P('egypt-northE', 'egyptN', 'northCourt', 'door', 'x', 33, 0, -50, 3.5, 4),
  // Greek and Roman.
  P('greek-southW', 'greek', 'southCourt', 'door', 'x', 18, 0, 50, 4, 5),
  P('greek-southE', 'greek', 'southCourt', 'door', 'x', 33, 0, 50, 4, 5),
  // European Paintings: a 2 × 5 grid with doors between every neighbour.
  ...[0, 1, 2, 3].flatMap((i) => [
    P(`paintW${i + 1}-${i + 2}`, `paintW${i + 1}`, `paintW${i + 2}`, 'door', 'x', -50, F2, ROWS[i + 1], 3, 3.5),
    P(`paintE${i + 1}-${i + 2}`, `paintE${i + 1}`, `paintE${i + 2}`, 'door', 'x', -31, F2, ROWS[i + 1], 3, 3.5),
  ]),
  ...[0, 1, 2, 3, 4].map((i) => P(`paintWE${i + 1}`, `paintW${i + 1}`, `paintE${i + 1}`, 'door', 'z', -41, F2, ROWS[i] + 10, 3, 3.5)),
  P('north-paint', 'northCourt', 'paintW1', 'door', 'x', -50, F2, -50, 3, 3.5),
  P('south-paint', 'southCourt', 'paintW5', 'door', 'x', -50, F2, 50, 3, 3.5),
  // Service level.
  P('north-stair', 'northCourt', 'stairN', 'opening', 'x', 24, 0, -73, 4, 3),
  P('stairN-service', 'stairN', 'service', 'door', 'x', 24, -6, -61, 4, 3),
  P('south-stair', 'southCourt', 'stairS', 'opening', 'x', 24, 0, 73, 4, 3),
  P('stairS-service', 'stairS', 'service', 'door', 'x', 24, -6, 61, 4, 3),
  P('svc-crossN', 'service', 'svcCrossN', 'door', 'z', 26, -6, -40, 4, 3),
  P('crossN-east', 'svcCrossN', 'svcEast', 'door', 'z', 34, -6, -40, 4, 3),
  P('svc-crossS', 'service', 'svcCrossS', 'door', 'z', 26, -6, 40, 4, 3),
  P('crossS-east', 'svcCrossS', 'svcEast', 'door', 'z', 34, -6, 40, 4, 3),
  P('svc-security', 'service', 'security', 'door', 'z', 26, -6, 0, 2, 2.6),
  P('security-lab', 'security', 'lab', 'door', 'z', 31, -6, 0, 2, 2.6),
  P('lab-east', 'lab', 'svcEast', 'door', 'z', 34, -6, 0, 2, 2.6),
];

// ─── Platforms, stairs, rails ─────────────────────────────────────────────────
const platforms: Platform[] = [
  // Great Hall balcony ring.
  { id: 'balconyN', room: 'greatHall', x0: 12, x1: 39, z0: -28, z1: -25, y: F2, style: 'balcony' },
  { id: 'balconyS', room: 'greatHall', x0: 12, x1: 39, z0: 25, z1: 28, y: F2, style: 'balcony' },
  { id: 'balconyW', room: 'greatHall', x0: 12, x1: 15, z0: -25, z1: 25, y: F2, style: 'balcony' },
  { id: 'balconyE', room: 'greatHall', x0: 36, x1: 39, z0: -25, z1: 25, y: F2, style: 'balcony' },
  // Grand staircase landing and side galleries.
  { id: 'stairLanding', room: 'grandStair', x0: -2, x1: 0, z0: -12, z1: 12, y: F2, style: 'landing' },
  { id: 'stairGalleryN', room: 'grandStair', x0: 0, x1: 12, z0: -12, z1: -8, y: F2, style: 'balcony' },
  { id: 'stairGalleryS', room: 'grandStair', x0: 0, x1: 12, z0: 8, z1: 12, y: F2, style: 'balcony' },
  // Dinosaur Hall catwalks and bridges.
  { id: 'catwalkE', room: 'dinoHall', x0: -5, x1: -2, z0: -50, z1: 50, y: F2, style: 'catwalk' },
  { id: 'catwalkW', room: 'dinoHall', x0: -22, x1: -19, z0: -50, z1: 50, y: F2, style: 'catwalk' },
  { id: 'bridgeN', room: 'dinoHall', x0: -19, x1: -5, z0: -26, z1: -23, y: F2, style: 'catwalk' },
  { id: 'bridgeS', room: 'dinoHall', x0: -19, x1: -5, z0: 23, z1: 26, y: F2, style: 'catwalk' },
  { id: 'catLandE', room: 'dinoHall', x0: -8, x1: -5, z0: -50, z1: -46, y: F2, style: 'catwalk' },
  { id: 'catLandW', room: 'dinoHall', x0: -19, x1: -16, z0: 46, z1: 50, y: F2, style: 'catwalk' },
  // Courts: temple podium, mezzanines leading to the paintings upstairs.
  { id: 'templePodium', room: 'northCourt', x0: 27, x1: 38.5, z0: -75.5, z1: -64, y: 1.2, solid: true, style: 'podium' },
  { id: 'mezzN', room: 'northCourt', x0: -60, x1: -30, z0: -54, z1: -50, y: F2, style: 'mezzanine' },
  { id: 'mezzS', room: 'southCourt', x0: -60, x1: -30, z0: 50, z1: 54, y: F2, style: 'mezzanine' },
  // Exterior terrace in front of the doors.
  { id: 'terrace', room: 'exterior', x0: 39, x1: 42, z0: -18, z1: 18, y: 0, solid: true, style: 'podium' },
];

const stairs: Stair[] = [
  { id: 'grandStairs', room: 'grandStair', x0: 0, x1: 12, z0: -4, z1: 4, y0: 0, y1: F2, dir: '-x', style: 'grand' },
  { id: 'catE', room: 'dinoHall', x0: -8, x1: -5, z0: -46, z1: -32, y0: 0, y1: F2, dir: '-z', style: 'metal' },
  { id: 'catW', room: 'dinoHall', x0: -19, x1: -16, z0: 32, z1: 46, y0: 0, y1: F2, dir: '+z', style: 'metal' },
  { id: 'courtStairN', room: 'northCourt', x0: -30, x1: -16, z0: -54, z1: -50.5, y0: 0, y1: F2, dir: '-x', style: 'stone' },
  { id: 'courtStairS', room: 'southCourt', x0: -30, x1: -16, z0: 50.5, z1: 54, y0: 0, y1: F2, dir: '-x', style: 'stone' },
  { id: 'templeSteps', room: 'northCourt', x0: 30, x1: 35, z0: -64, z1: -61.6, y0: 0, y1: 1.2, dir: '-z', style: 'stone' },
  { id: 'svcStairN', room: 'stairN', x0: 22, x1: 26, z0: -73, z1: -61, y0: -6, y1: 0, dir: '-z', style: 'concrete' },
  { id: 'svcStairS', room: 'stairS', x0: 22, x1: 26, z0: 61, z1: 73, y0: -6, y1: 0, dir: '+z', style: 'concrete' },
  { id: 'frontSteps', room: 'exterior', x0: 42, x1: 50, z0: -16, z1: 16, y0: -2.4, y1: 0, dir: '-x', style: 'stone' },
];

const R = (x0: number, z0: number, x1: number, z1: number, ya: number, yb = ya, style: Rail['style'] = 'balustrade'): Rail =>
  ({ x0, z0, x1, z1, ya, yb, style });

/** Sloped rail along one long side of a stair. `side` is the fixed coordinate. */
function stairRail(s: Stair, side: 'x0' | 'x1' | 'z0' | 'z1', style: Rail['style']): Rail {
  const alongX = s.dir === '+x' || s.dir === '-x';
  if (alongX) {
    const z = side === 'z0' ? s.z0 : s.z1;
    const yAtX0 = s.dir === '+x' ? s.y0 : s.y1;
    const yAtX1 = s.dir === '+x' ? s.y1 : s.y0;
    return R(s.x0, z, s.x1, z, yAtX0, yAtX1, style);
  }
  const x = side === 'x0' ? s.x0 : s.x1;
  const yAtZ0 = s.dir === '+z' ? s.y0 : s.y1;
  const yAtZ1 = s.dir === '+z' ? s.y1 : s.y0;
  return R(x, s.z0, x, s.z1, yAtZ0, yAtZ1, style);
}
const st = (id: string) => stairs.find((s) => s.id === id)!;

const rails: Rail[] = [
  // Great Hall balcony (the elevator cabs sit in the north-west and south-west corners).
  R(15, -25, 36, -25, F2), R(15, 25, 36, 25, F2), R(15, -24.5, 15, 24.5, F2), R(36, -25, 36, 25, F2),
  // Grand staircase.
  stairRail(st('grandStairs'), 'z0', 'balustrade'), stairRail(st('grandStairs'), 'z1', 'balustrade'),
  R(0, -8, 12, -8, F2), R(0, 8, 12, 8, F2), R(0, -8, 0, -4, F2), R(0, 4, 0, 8, F2),
  // Dinosaur Hall catwalks: inner edges with gaps where the bridges join.
  R(-5, -46, -5, -26, F2, F2, 'metal'), R(-5, -23, -5, 23, F2, F2, 'metal'), R(-5, 26, -5, 50, F2, F2, 'metal'),
  R(-19, -50, -19, -26, F2, F2, 'metal'), R(-19, -23, -19, 23, F2, F2, 'metal'), R(-19, 26, -19, 46, F2, F2, 'metal'),
  R(-19, -26, -5, -26, F2, F2, 'metal'), R(-19, -23, -5, -23, F2, F2, 'metal'),
  R(-19, 23, -5, 23, F2, F2, 'metal'), R(-19, 26, -5, 26, F2, F2, 'metal'),
  stairRail(st('catE'), 'x0', 'metal'), stairRail(st('catE'), 'x1', 'metal'), R(-8, -50, -8, -46, F2, F2, 'metal'),
  stairRail(st('catW'), 'x0', 'metal'), stairRail(st('catW'), 'x1', 'metal'), R(-16, 46, -16, 50, F2, F2, 'metal'),
  // Court mezzanines and stairs.
  R(-56.5, -54, -30, -54, F2, F2, 'glass'), stairRail(st('courtStairN'), 'z0', 'glass'),
  R(-56.5, 54, -30, 54, F2, F2, 'glass'), stairRail(st('courtStairS'), 'z1', 'glass'),
  // Service stair holes in the courts (entry side left open).
  R(22, -73, 22, -61, 0, 0, 'metal'), R(26, -73, 26, -61, 0, 0, 'metal'), R(22, -61, 26, -61, 0, 0, 'metal'),
  R(22, 61, 22, 73, 0, 0, 'metal'), R(26, 61, 26, 73, 0, 0, 'metal'), R(22, 61, 26, 61, 0, 0, 'metal'),
];

// ─── Blocks (exhibits and obstacles) ──────────────────────────────────────────
const B = (
  id: string, room: string, kind: Block['kind'],
  x0: number, x1: number, z0: number, z1: number, y0: number, y1: number,
  extra: Partial<Block> = {},
): Block => ({ id, room, kind, x0, x1, z0, z1, y0, y1, ...extra });

const blocks: Block[] = [
  // Exterior: stair cheek walls, fountains, the hot-dog cart.
  B('cheekN', 'exterior', 'plinth', 42, 50, -18, -16, -2.4, 0.8),
  B('cheekS', 'exterior', 'plinth', 42, 50, 16, 18, -2.4, 0.8),
  B('fountainN', 'exterior', 'pool', 52, 58, -30, -22, -2.4, -1.75),
  B('fountainS', 'exterior', 'pool', 52, 58, 22, 30, -2.4, -1.75),
  B('hotdog', 'exterior', 'barrier', 57, 59.2, 8, 9.2, -2.4, -1.4, { variant: 'hotdog' }),

  // Great Hall: information desk, the totem, flowers in the niches, benches.
  B('infoDesk', 'greatHall', 'desk', 22.5, 28.5, -3, 3, 0, 1.1),
  B('lobbyPanel', 'greatHall', 'totem', 31.6, 32.4, -1.6, 1.6, 0, 3.2),
  B('planterNW', 'greatHall', 'planter', 13, 14.5, -17, -15.5, 0, 1.0),
  B('planterSW', 'greatHall', 'planter', 13, 14.5, 15.5, 17, 0, 1.0),
  B('planterNE', 'greatHall', 'planter', 37, 38.5, -17, -15.5, 0, 1.0),
  B('planterSE', 'greatHall', 'planter', 37, 38.5, 15.5, 17, 0, 1.0),
  B('benchGH1', 'greatHall', 'bench', 24, 27, -12.3, -11.7, 0, 0.45),
  B('benchGH2', 'greatHall', 'bench', 24, 27, 11.7, 12.3, 0, 0.45),

  // Greek and Roman: two rows of statues either side of a clear central aisle.
  ...[16, 22, 28, 34].flatMap((x, i) => [
    B(`greekN${i}`, 'greek', 'sculpture', x - 0.7, x + 0.7, 32.3, 33.7, 0, 1.1, { variant: i % 2 ? 'torso' : 'figure' }),
    B(`greekS${i}`, 'greek', 'sculpture', x - 0.7, x + 0.7, 44.3, 45.7, 0, 1.1, { variant: i % 2 ? 'figure' : 'torso' }),
  ]),

  // Arms and Armor: an equestrian procession down the middle, cases along the walls.
  ...[-44, -34, -24].map((z, i) => B(`knight${i}`, 'armsArmor', 'knight', 3.5, 6.5, z - 2, z + 2, 0, 0.5)),
  ...[-45, -38, -22, -16].map((z, i) => B(`armsCaseW${i}`, 'armsArmor', 'case', -1.4, 0.4, z - 0.9, z + 0.9, 0, 2.1)),
  ...[-45, -35, -27].map((z, i) => B(`armsCaseE${i}`, 'armsArmor', 'case', 9.8, 11.6, z - 0.9, z + 0.9, 0, 2.1)),

  // Africa, Oceania, the Americas: carved poles, dioramas, cases, the suspended canoe.
  B('dioramaA', 'cultures', 'diorama', 8.5, 11.5, 33, 39, 0, 4.5),
  B('dioramaB', 'cultures', 'diorama', 8.5, 11.5, 42, 48, 0, 4.5),
  B('poleA', 'cultures', 'obelisk', 0.4, 1.6, 19.4, 20.6, 0, 6.8, { variant: 'pole' }),
  B('poleB', 'cultures', 'obelisk', 8.4, 9.6, 25.4, 26.6, 0, 6.5, { variant: 'pole' }),
  B('poleC', 'cultures', 'obelisk', 0.4, 1.6, 43.4, 44.6, 0, 7, { variant: 'pole' }),
  B('cultPodium', 'cultures', 'plinth', 2, 7, 36, 42, 0, 0.6),
  B('caseC1', 'cultures', 'case', 3, 5, 15, 17, 0, 2.1),
  B('caseC2', 'cultures', 'case', 3, 5, 23, 25, 0, 2.1),
  B('maskWall', 'cultures', 'partition', 2, 8, 27.8, 28.2, 0, 3.4),
  B('canoe', 'cultures', 'sculpture', 0, 10, 31, 32.5, 5.6, 6.4, { noCollide: true, variant: 'canoe' }),

  // Dinosaur Hall: skeletons on plinths (cover) down the centre line.
  B('plinthRex', 'dinoHall', 'plinth', -16, -9, -35, -25, 0, 0.6, { variant: 'rex' }),
  B('plinthSauro', 'dinoHall', 'plinth', -15.5, -9.5, -9, 9, 0, 0.6, { variant: 'sauropod' }),
  B('plinthTrike', 'dinoHall', 'plinth', -16, -9, 25, 35, 0, 0.6, { variant: 'trike' }),

  // The American Wing: a classical bank facade along the park wall, period-room partitions.
  B('bankFacade', 'american', 'colonnade', -59.5, -57, -42, -20, 0, 7),
  B('amPartA', 'american', 'partition', -46, -36, -40, -39.6, 0, 3.6),
  B('amPartB', 'american', 'partition', -46, -36, -22.4, -22, 0, 3.6),
  B('amBench', 'american', 'bench', -42.5, -39.5, -31.3, -30.7, 0, 0.45),
  B('amCase', 'american', 'case', -30, -28, -46, -44, 0, 2.1),

  // European Sculpture Court.
  B('scFigureNW', 'sculptureCourt', 'sculpture', -50.7, -49.3, -6.7, -5.3, 0, 1.1, { variant: 'figure' }),
  B('scFigureNE', 'sculptureCourt', 'sculpture', -34.7, -33.3, -6.7, -5.3, 0, 1.1, { variant: 'torso' }),
  B('scFigureSW', 'sculptureCourt', 'sculpture', -50.7, -49.3, 5.3, 6.7, 0, 1.1, { variant: 'torso' }),
  B('scLion', 'sculptureCourt', 'sculpture', -36, -33, 5, 8, 0, 1.6, { variant: 'lion' }),
  B('scHorse', 'sculptureCourt', 'sculpture', -42.8, -41.2, -0.8, 0.8, 0, 1.3, { variant: 'horse' }),

  // Modern and Contemporary: a monumental piece, hanging walls for paintings.
  B('modernMonument', 'modern', 'sculpture', -45, -37, 28, 34, 0, 1.0, { variant: 'monument' }),
  B('modernWallA', 'modern', 'partition', -54, -44, 20, 20.4, 0, 3.6),
  B('modernWallB', 'modern', 'partition', -54, -44, 41.6, 42, 0, 3.6),
  B('modernBench', 'modern', 'bench', -42.5, -39.5, 21.7, 22.3, 0, 0.45),

  // Egyptian Art: walk-through mastaba chapel, sarcophagi, statues, an obelisk.
  B('mastabaN', 'egyptM', 'mastaba', 17, 26, -42, -39.75, 0, 3.8),
  B('mastabaS', 'egyptM', 'mastaba', 17, 26, -37.75, -35.5, 0, 3.8),
  B('sarcophagusCrawl', 'egyptS', 'sarcophagus', 35.4, 38.4, -32.6, -30.8, 0, 1.2),
  B('sarcophagus2', 'egyptM', 'sarcophagus', 30, 33.5, -38.2, -36.6, 0, 1.2),
  B('obeliskE', 'egyptM', 'obelisk', 34, 35.2, -40.2, -39, 0, 5.4),
  ...[13, 22.5, 26.5, 37].map((x, i) => B(`statueN${i}`, 'egyptN', 'statue', x, x + 1.2, -49.4, -48.4, 0, 3.4)),
  ...[20, 32].map((x, i) => B(`statueS${i}`, 'egyptN', 'statue', x, x + 1.2, -44.2, -43.6, 0, 3.0)),

  // North Court: temple, gateway, reflecting pool, relic pedestal, cover.
  B('temple', 'northCourt', 'temple', 29, 37, -75, -69.5, 1.2, 8.2),
  B('gateway', 'northCourt', 'temple', 31, 35, -66, -65, 1.2, 7, { variant: 'gate' }),
  B('pool', 'northCourt', 'pool', 6, 18, -71, -64, 0, 0.45),
  B('pedestalA', 'northCourt', 'plinth', -13, -11, -64, -62, 0, 1.0, { variant: 'relic' }),
  B('coverNA', 'northCourt', 'sculpture', -30, -27, -64, -61, 0, 1.6, { variant: 'lion' }),
  B('coverNB', 'northCourt', 'obelisk', -1, 0.2, -66, -64.8, 0, 6.5),

  // South Court: monumental sculpture, carved poles, relic pedestal.
  B('pedestalB', 'southCourt', 'plinth', -13, -11, 62, 64, 0, 1.0, { variant: 'relic' }),
  B('monument', 'southCourt', 'sculpture', 10, 18, 60, 66, 0, 1.0, { variant: 'monument' }),
  B('poleS1', 'southCourt', 'obelisk', -30.6, -29.4, 57.4, 58.6, 0, 9, { variant: 'pole' }),
  B('poleS2', 'southCourt', 'obelisk', -1, 0.2, 64.8, 66, 0, 8, { variant: 'pole' }),
  B('coverSA', 'southCourt', 'sculpture', -30, -27, 61, 64, 0, 1.6, { variant: 'lion' }),

  // Service level dressing.
  B('crate1', 'service', 'crate', 22.4, 23.6, -20, -18.8, -6, -4.8),
  B('crate2', 'service', 'crate', 24.6, 25.6, 18, 19.2, -6, -5),
  B('crate3', 'svcEast', 'crate', 34.4, 35.6, 14, 15.6, -6, -4.6),
  B('securityDesk', 'security', 'desk', 27.5, 29.5, -1.5, 0.5, -6, -5.1),
  B('labTable', 'lab', 'desk', 32, 33.5, -3, -1, -6, -5.1),
];

const doors: Door[] = [
  { id: 'egyptSecretDoor', portal: 'egyptM-N-secret', defaultOpen: false, style: 'secretPivot' },
];

/** Elevators between the ground floor and the second floor (cab footprint 2.8 m). */
const elevators: Elevator[] = [
  { id: 'elevGreatHallN', x: 14, z: -26.5, facing: '+x', stops: [{ floor: 1, label: '1', room: 'greatHall', y: 0 }, { floor: 2, label: '2', room: 'greatHall', y: F2 }] },
  { id: 'elevGreatHallS', x: 14, z: 26.5, facing: '+x', stops: [{ floor: 1, label: '1', room: 'greatHall', y: 0 }, { floor: 2, label: '2', room: 'greatHall', y: F2 }] },
  { id: 'elevCourtN', x: -58, z: -52, facing: '+x', stops: [{ floor: 1, label: '1', room: 'northCourt', y: 0 }, { floor: 2, label: '2', room: 'northCourt', y: F2 }] },
  { id: 'elevCourtS', x: -58, z: 52, facing: '+x', stops: [{ floor: 1, label: '1', room: 'southCourt', y: 0 }, { floor: 2, label: '2', room: 'southCourt', y: F2 }] },
];

const sp = (id: string, x: number, y: number, z: number, yaw = PI / 2): Spawn => ({ id, pos: [x, y, z], yaw });

const spawns: MuseumMap['spawns'] = {
  // All spawns face west (yaw π/2). On the front steps, facing the facade.
  exterior: [sp('steps1', 46.5, -1.35, -3), sp('steps2', 46.5, -1.35, -1), sp('steps3', 46.5, -1.35, 1), sp('steps4', 46.5, -1.35, 3)],
  lobby: [sp('lobby1', 34, 0, -2), sp('lobby2', 34, 0, 2), sp('lobby3', 35.5, 0, -1), sp('lobby4', 35.5, 0, 1)],
  // In the east of each court, away from the relic case.
  teamA: [sp('a1', 33, 0, -58), sp('a2', 37, 0, -58), sp('a3', 29, 0, -55), sp('a4', 35, 0, -54)],
  teamB: [sp('b1', 33, 0, 58), sp('b2', 37, 0, 58), sp('b3', 29, 0, 55), sp('b4', 35, 0, 54)],
};

const zones: Zone[] = [
  { id: 'captureA', kind: 'capture', room: 'northCourt', center: [-12, 0, -63], radius: 3 },
  { id: 'captureB', kind: 'capture', room: 'southCourt', center: [-12, 0, 63], radius: 3 },
  { id: 'exitAvenue', kind: 'exit', room: 'exterior', center: [46, -1.2, 0], radius: 6 },
  // Crowd Control: doorways on the visitor circuit where crowds jam, and the areas closed to visitors.
  { id: 'chokeArms', kind: 'choke', room: 'armsArmor', center: [12, 0, -20], radius: 2.5 },
  { id: 'chokeDinoArms', kind: 'choke', room: 'dinoHall', center: [-2, 0, -30], radius: 2.5 },
  { id: 'chokeSculpture', kind: 'choke', room: 'sculptureCourt', center: [-22, 0, -2], radius: 3 },
  { id: 'chokeModern', kind: 'choke', room: 'modern', center: [-41, 0, 12], radius: 2.5 },
  { id: 'chokeDinoModern', kind: 'choke', room: 'dinoHall', center: [-22, 0, 30], radius: 2.5 },
  { id: 'chokeCultures', kind: 'choke', room: 'cultures', center: [-2, 0, 30], radius: 2.5 },
  { id: 'chokeGreatHallS', kind: 'choke', room: 'greatHall', center: [12, 0, 20], radius: 2.5 },
  { id: 'closedEgypt', kind: 'restricted', room: 'egyptS', center: [32, 0, -31], radius: 2.5 },
  { id: 'closedStair', kind: 'restricted', room: 'grandStair', center: [9, 0, -9.5], radius: 2.5 },
  { id: 'closedNorthCourt', kind: 'restricted', room: 'northCourt', center: [-12, 0, -55.5], radius: 2.5 },
  { id: 'closedSouthCourt', kind: 'restricted', room: 'southCourt', center: [-41, 0, 55.5], radius: 2.5 },
  { id: 'restrictedService', kind: 'restricted', room: 'service', center: [24, -6, 0], radius: 30 },
  // Artifact Hunt: carry finds to the Registrar's Desk (the information desk) to secure them.
  { id: 'registrarDesk', kind: 'desk', room: 'greatHall', center: [25.5, 0, 0], radius: 4.5 },
];

const slots: Slot[] = [
  { id: 'caseA', kind: 'relicCase', room: 'northCourt', pos: [-12, 1.0, -63] },
  { id: 'caseB', kind: 'relicCase', room: 'southCourt', pos: [-12, 1.0, 63] },
  // Test grabbables on the information desk.
  { id: 'propBust1', kind: 'prop', room: 'greatHall', pos: [23.7, 1.1, -1.2] },
  { id: 'propBust2', kind: 'prop', room: 'greatHall', pos: [23.7, 1.1, 1.2] },
  { id: 'propVase1', kind: 'prop', room: 'greatHall', pos: [27.3, 1.1, 0] },
];

// ─── Insurance Fraud: destructibles (brief §18) and tool racks ────────────────
const D = (id: string, room: string, variant: string, x: number, y: number, z: number, yaw = 0, parent?: string): Slot =>
  ({ id, kind: 'destructible', room, variant, pos: [x, y, z], yaw, parent });
const T = (id: string, room: string, variant: string, x: number, y: number, z: number): Slot => ({ id, kind: 'tool', room, variant, pos: [x, y, z] });

slots.push(
  // Great Hall: cheap things close to the spawn.
  D('ghVaseN', 'greatHall', 'vase', 20, 0, -10), D('ghVaseS', 'greatHall', 'vase', 20, 0, 10),
  D('ghUrnN', 'greatHall', 'urn', 33, 0, -20), D('ghUrnS', 'greatHall', 'urn', 33, 0, 20),
  D('ghBustN', 'greatHall', 'bust', 18, 0, -23), D('ghBustS', 'greatHall', 'bust', 18, 0, 23),
  // Greek and Roman.
  D('grStatueW', 'greek', 'statue', 19, 0, 39, PI / 2), D('grStatueE', 'greek', 'statue', 31, 0, 39, -PI / 2),
  D('grAmphoraN', 'greek', 'amphora', 25, 0, 36), D('grAmphoraS', 'greek', 'amphora', 25, 0, 42), D('grBust', 'greek', 'bust', 37, 0, 39),
  // Egypt.
  D('egVase', 'egyptS', 'vase', 20, 0, -31), D('egUrn', 'egyptS', 'urn', 28, 0, -31),
  D('egAmphora', 'egyptM', 'amphora', 13.5, 0, -38.75), D('egClock', 'egyptM', 'clock', 28, 0, -41.6),
  D('egStatue', 'egyptN', 'statue', 17, 0, -46.5), D('egVase2', 'egyptN', 'vase', 30, 0, -46.5),
  // Arms and Armor.
  D('arClock', 'armsArmor', 'clock', 5, 0, -48.6), D('arBust', 'armsArmor', 'bust', 5, 0, -39), D('arPainting', 'armsArmor', 'painting', 1.5, 0, -26, PI / 2),
  // Africa, Oceania, the Americas.
  D('cuUrn', 'cultures', 'urn', 7, 0, 14), D('cuAmphora', 'cultures', 'amphora', 5, 0, 46.5),
  // Dinosaur Hall.
  D('diVaseN', 'dinoHall', 'vase', -4, 0, -10), D('diVaseS', 'dinoHall', 'vase', -20, 0, 10),
  // The American Wing.
  D('amClock', 'american', 'clock', -50, 0, -31, PI / 2), D('amPainting', 'american', 'painting', -41, 0, -36), D('amStatue', 'american', 'statue', -30, 0, -25), D('amVase', 'american', 'vase', -25, 0, -48),
  // Sculpture Court and Modern.
  D('scStatue', 'sculptureCourt', 'statue', -28, 0, -8), D('moPainting', 'modern', 'painting', -50, 0, 31), D('moStatue', 'modern', 'statue', -30, 0, 45), D('moVase', 'modern', 'vase', -56, 0, 15),
  // Courts.
  D('ncUrn', 'northCourt', 'urn', -40, 0, -60), D('ncStatue', 'northCourt', 'statue', -45, 0, -66), D('ncAmphora', 'northCourt', 'amphora', 2, 0, -58),
  // Upstairs: the European Paintings masterpieces, Asian Art, Musical Instruments.
  D('pEMaster', 'paintE2', 'masterpiece', -31.5, F2, -20), D('pWMaster', 'paintW4', 'masterpiece', -50.5, F2, 20),
  D('pWPainting', 'paintW2', 'painting', -50.5, F2, -20), D('pEPainting', 'paintE4', 'painting', -31.5, F2, 20),
  D('asUrn', 'asianArt', 'urn', 5, F2, -31), D('inClock', 'instruments', 'clock', 5, F2, 31),
  // Ultra-high-value pieces, each held by three anchors that must be loosened first.
  D('mammoth', 'dinoHall', 'mammoth', -12, 0, 42),
  D('mammothA1', 'dinoHall', 'anchor', -15, 0, 38, 0, 'mammoth'), D('mammothA2', 'dinoHall', 'anchor', -8.5, 0, 38.5, 0, 'mammoth'), D('mammothA3', 'dinoHall', 'anchor', -12, 0, 47.5, 0, 'mammoth'),
  D('giantCanvas', 'sculptureCourt', 'canvas', -55, 0, 0, -PI / 2),
  D('canvasA1', 'sculptureCourt', 'anchor', -53, 0, -4.5, 0, 'giantCanvas'), D('canvasA2', 'sculptureCourt', 'anchor', -53, 0, 4.5, 0, 'giantCanvas'), D('canvasA3', 'sculptureCourt', 'anchor', -58.5, 0, 0, 0, 'giantCanvas'),
  D('lionGate', 'southCourt', 'gate', 30, 0, 68),
  D('gateA1', 'southCourt', 'anchor', 27, 0, 64, 0, 'lionGate'), D('gateA2', 'southCourt', 'anchor', 33, 0, 64, 0, 'lionGate'), D('gateA3', 'southCourt', 'anchor', 30, 0, 73.5, 0, 'lionGate'),
  // Tools: scarce, spread out, the heavy ones far from the big pieces.
  T('toolMalletA', 'greatHall', 'mallet', 30, 0, -6), T('toolMalletB', 'greatHall', 'mallet', 30, 0, 6),
  T('toolCrowbarA', 'egyptS', 'crowbar', 16, 0, -31), T('toolCrowbarB', 'cultures', 'crowbar', 5, 0, 31),
  T('toolExtinguisher', 'armsArmor', 'extinguisher', 1, 0, -48), T('toolMace', 'armsArmor', 'mace', 11, 0, -18),
  T('toolAxe', 'service', 'axe', 24, -6, -30), T('toolSledge', 'northCourt', 'sledgehammer', -50, 0, -70),
  T('toolBall', 'southCourt', 'ball', -50, 0, 68),
);

const landmarks: MuseumMap['landmarks'] = [
  { id: 'caseA', room: 'northCourt', pos: [-12, 0, -63] },
  { id: 'caseB', room: 'southCourt', pos: [-12, 0, 63] },
  { id: 'steps', room: 'exterior', pos: [46.5, -1.35, 0] },
  { id: 'desk', room: 'greatHall', pos: [30, 0, 0] },
];

/**
 * The one-way visitor circuit: in through the Great Hall, Arms and Armor, the
 * Dinosaur Hall, the Sculpture Court, Modern, back across the Dinosaur Hall,
 * through Africa/Oceania/Americas and out of the Great Hall's south door.
 */
const circuit: MuseumMap['circuit'] = {
  points: [
    [38.5, 0, 0], [30, 0, -14], [15.5, 0, -21], [12, 0, -20], [7.5, 0, -29], [-2, 0, -30],
    [-6, 0, -20], [-17, 0, -12], [-22, 0, -2], [-38, 0, -2], [-41, 0, 12], [-35, 0, 20],
    [-28, 0, 29], [-22, 0, 30], [-18, 0, 22], [-6, 0, 22], [-2, 0, 30], [1, 0, 27],
    [1, 0, 22], [12, 0, 20], [30, 0, 14], [38.5, 0, 8],
  ],
  detours: [
    { from: 1, zone: 'closedEgypt', label: 'the closed Egyptian wing', path: [[33, 0, -24], [33, 0, -28], [32, 0, -31]] },
    { from: 2, zone: 'closedStair', label: 'the staff-only staircase', path: [[16, 0, -12], [13, 0, -7.5], [12, 0, -7], [9, 0, -9.5]] },
    { from: 5, zone: 'closedNorthCourt', label: 'the closed Temple Court', path: [[-3.5, 0, -32], [-3.5, 0, -47], [-9, 0, -50], [-12, 0, -55.5]] },
    { from: 11, zone: 'closedSouthCourt', label: 'the closed Glass Court', path: [[-34, 0, 40], [-41, 0, 48], [-41, 0, 50], [-41, 0, 55.5]] },
  ],
};

export const museum: MuseumMap = {
  rooms, portals, platforms, stairs, rails, blocks, doors, elevators, spawns, zones, slots, landmarks, circuit,
  exteriorFence: { x0: 39, x1: 61, z0: -40, z1: 40 },
};

/** Plan extents of the building (used by the exterior and the park). */
export const BUILDING = { x0: -60, x1: 39, z0: -76, z1: 76 };

/*
 * Artifact Hunt candidate slots (brief §16). [id, room, x, z, surface y hint, tier].
 * Obvious: in plain view. Tucked: catwalks, balconies, mezzanines, behind
 * partitions, upstairs corners. Hidden: the service level, past the secret
 * door and the crawl shaft. Each y is resolved against the map so every
 * artifact sits on its surface.
 */
const ARTIFACT_SLOTS: [string, string, number, number, number, NonNullable<Slot['tier']>][] = [
  // Obvious (17)
  ['dinoRex', 'dinoHall', -9.4, -34.5, 0.6, 'obvious'],
  ['dinoSauro', 'dinoHall', -9.9, 8.5, 0.6, 'obvious'],
  ['dinoTrike', 'dinoHall', -9.4, 34.5, 0.6, 'obvious'],
  ['amBench', 'american', -41, -31, 0.45, 'obvious'],
  ['sculptFloor', 'sculptureCourt', -42, -8, 0, 'obvious'],
  ['modernBench', 'modern', -41, 22, 0.45, 'obvious'],
  ['greekAisle', 'greek', 25, 39, 0, 'obvious'],
  ['greekCorner', 'greek', 37, 30, 0, 'obvious'],
  ['armsSouth', 'armsArmor', 5, -15, 0, 'obvious'],
  ['armsNorth', 'armsArmor', 10.5, -48, 0, 'obvious'],
  ['culturesPodium', 'cultures', 4.5, 39, 0.6, 'obvious'],
  ['culturesFloor', 'cultures', 5, 18.5, 0, 'obvious'],
  ['northObelisk', 'northCourt', 0.8, -63, 0, 'obvious'],
  ['northPodium', 'northCourt', 27.6, -66, 1.2, 'obvious'],
  ['northLion', 'northCourt', -26.3, -62.5, 0, 'obvious'],
  ['southMonument', 'southCourt', 17.3, 60.7, 1.0, 'obvious'],
  ['southFloor', 'southCourt', -30, 66, 0, 'obvious'],
  // Tucked (14)
  ['catE', 'dinoHall', -3.5, -15, F2, 'tucked'],
  ['catW', 'dinoHall', -20.5, 15, F2, 'tucked'],
  ['bridgeN', 'dinoHall', -12, -24.5, F2, 'tucked'],
  ['balconyE', 'greatHall', 37.5, 10, F2, 'tucked'],
  ['balconyN', 'greatHall', 30, -26.5, F2, 'tucked'],
  ['mezzN', 'northCourt', -45, -52, F2, 'tucked'],
  ['mezzS', 'southCourt', -45, 52, F2, 'tucked'],
  ['egyptTomb', 'egyptN', 24, -46.5, 0, 'tucked'],
  ['egyptOffering', 'egyptS', 20, -31, 0, 'tucked'],
  ['mastabaPassage', 'egyptM', 21, -38.75, 0, 'tucked'],
  ['behindAmPartition', 'american', -41, -40.8, 0, 'tucked'],
  ['grandLanding', 'grandStair', -1, -10, F2, 'tucked'],
  ['paintCorner', 'paintW3', -58.5, 8.5, F2, 'tucked'],
  ['asianCorner', 'asianArt', 11, -48.5, F2, 'tucked'],
  // Hidden (12)
  ['svcNorth', 'service', 24, -50, -6, 'hidden'],
  ['svcSouth', 'service', 24, 20, -6, 'hidden'],
  ['svcEast1', 'svcEast', 36, -10, -6, 'hidden'],
  ['svcEast2', 'svcEast', 36, 25, -6, 'hidden'],
  ['freightN', 'svcCrossN', 30, -40, -6, 'hidden'],
  ['freightS', 'svcCrossS', 30, 40, -6, 'hidden'],
  ['securityOffice', 'security', 28, 3, -6, 'hidden'],
  ['labTable', 'lab', 32.75, -2, -5.1, 'hidden'],
  ['stairNBottom', 'stairN', 24, -61.8, -6, 'hidden'],
  ['pastSecretDoor', 'egyptN', 29, -44.4, 0, 'hidden'],
  ['pastCrawl', 'egyptM', 37, -35, 0, 'hidden'],
  ['behindSarcophagus', 'egyptS', 37, -33.05, 0, 'hidden'],
];

for (const [id, room, x, z, yHint, tier] of ARTIFACT_SLOTS) {
  museum.slots.push({ id: `artifact.${id}`, kind: 'artifact', room, tier, pos: [x, groundHeightAt(museum, x, yHint, z) + 0.15, z] });
}
