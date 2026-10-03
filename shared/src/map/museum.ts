import type {
  Block, Door, MuseumMap, Platform, Portal, Rail, Room, Slot, Spawn, Stair, Zone,
} from './types.js';

/*
 * The museum, as data. +x east, +z south, north is −z. Ground floor y = 0,
 * service level y = −6, balcony/catwalks y = 7. See docs/DECISIONS.md for the
 * dimensions that differ from the brief.
 *
 *   x: −45 … −27 Art Galleries | −27 … −7 Dinosaur Hall | −7 … 39 east wings | 39+ exterior
 *   z: −60 … −37 North Court | −37 … 37 main block | 37 … 60 South Court
 */

const PI = Math.PI;

// ─── Rooms ────────────────────────────────────────────────────────────────────
const galleryColors = [0x6e1f2a, 0x1f4a3a, 0x24365e, 0xc9b99a, 0x5a2a4e, 0x2f5552, 0x7a3b1e];
const galleryZ = [-37, -27, -17, -7, 7, 17, 27, 37];

const rooms: Room[] = [
  { id: 'exterior', name: 'The Avenue', style: 'exterior', x0: 39, x1: 110, z0: -60, z1: 60, floorY: -2.4, ceilY: 40, open: true, acoustic: 'outdoor' },
  { id: 'lobby', name: 'Grand Lobby', style: 'lobby', x0: -7, x1: 39, z0: -11, z1: 11, floorY: 0, ceilY: 20, acoustic: 'hall' },
  { id: 'egyptS', name: 'Egypt — Offering Hall', style: 'egypt', x0: -7, x1: 39, z0: -16, z1: -11, floorY: 0, ceilY: 4.5, acoustic: 'tomb' },
  { id: 'egyptM', name: 'Egypt — Mastaba Hall', style: 'egypt', x0: -7, x1: 39, z0: -26, z1: -16, floorY: 0, ceilY: 6, acoustic: 'tomb' },
  { id: 'egyptN2', name: 'Egypt — Statue Corridor', style: 'egypt', x0: -7, x1: 39, z0: -31.5, z1: -26, floorY: 0, ceilY: 4, acoustic: 'tomb' },
  { id: 'egyptN1', name: 'Egypt — Tomb Corridor', style: 'egypt', x0: -7, x1: 39, z0: -37, z1: -31.5, floorY: 0, ceilY: 4, acoustic: 'tomb' },
  { id: 'cultures', name: 'World Cultures', style: 'cultures', x0: -7, x1: 39, z0: 11, z1: 37, floorY: 0, ceilY: 12, acoustic: 'gallery' },
  { id: 'dinoHall', name: 'Dinosaur Hall', style: 'dino', x0: -27, x1: -7, z0: -37, z1: 37, floorY: 0, ceilY: 18, acoustic: 'hall' },
  ...galleryZ.slice(0, -1).map((z0, i): Room => ({
    id: `gallery${i + 1}`,
    name: i === 3 ? 'Sculpture Gallery' : `Gallery ${i + 1}`,
    style: i === 3 ? 'sculpture' : 'gallery',
    x0: -45, x1: -27, z0, z1: galleryZ[i + 1],
    floorY: 0, ceilY: i === 3 ? 12 : 9,
    wallColor: galleryColors[i],
    acoustic: 'gallery',
  })),
  { id: 'northCourt', name: 'Temple Court', style: 'courtNorth', x0: -45, x1: 39, z0: -60, z1: -37, floorY: 0, ceilY: 20, acoustic: 'court', floorHoles: [{ x0: 10, x1: 14, z0: -57, z1: -45 }] },
  { id: 'southCourt', name: 'Glass Court', style: 'courtSouth', x0: -45, x1: 39, z0: 37, z1: 60, floorY: 0, ceilY: 20, acoustic: 'court', floorHoles: [{ x0: 10, x1: 14, z0: 45, z1: 57 }] },
  { id: 'stairN', name: 'North Service Stair', style: 'stairwell', x0: 10, x1: 14, z0: -57, z1: -45, floorY: -6, ceilY: 0, noCeiling: true, acoustic: 'service' },
  { id: 'stairS', name: 'South Service Stair', style: 'stairwell', x0: 10, x1: 14, z0: 45, z1: 57, floorY: -6, ceilY: 0, noCeiling: true, acoustic: 'service' },
  { id: 'service', name: 'Service Corridor', style: 'service', x0: 10, x1: 14, z0: -45, z1: 45, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'svcCrossN', name: 'Freight Corridor North', style: 'service', x0: 14, x1: 28, z0: -32, z1: -28, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'svcCrossS', name: 'Freight Corridor South', style: 'service', x0: 14, x1: 28, z0: 28, z1: 32, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'svcEast', name: 'Loading Corridor', style: 'service', x0: 28, x1: 32, z0: -32, z1: 32, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'security', name: 'Security Office', style: 'office', x0: 14, x1: 24, z0: -5, z1: 5, floorY: -6, ceilY: -2.6, acoustic: 'service' },
  { id: 'lab', name: 'Conservation Lab', style: 'office', x0: 24, x1: 28, z0: -5, z1: 5, floorY: -6, ceilY: -2.6, acoustic: 'service' },
];

// ─── Portals ──────────────────────────────────────────────────────────────────
const P = (
  id: string, a: string, b: string, kind: Portal['kind'], axis: Portal['axis'],
  x: number, y: number, z: number, width: number, height: number,
): Portal => ({ id, a, b, kind, axis, x, y, z, width, height });

const portals: Portal[] = [
  // Facade: three arched bays onto the steps.
  P('facadeN', 'exterior', 'lobby', 'arch', 'z', 39, 0, -8, 4, 6.5),
  P('facadeC', 'exterior', 'lobby', 'arch', 'z', 39, 0, 0, 4, 6.5),
  P('facadeS', 'exterior', 'lobby', 'arch', 'z', 39, 0, 8, 4, 6.5),
  // Lobby.
  P('lobby-dino', 'lobby', 'dinoHall', 'grand', 'z', -7, 0, 0, 8, 12),
  P('lobby-egypt', 'lobby', 'egyptS', 'door', 'x', 16, 0, -11, 4, 4),
  P('lobby-cultures', 'lobby', 'cultures', 'door', 'x', 16, 0, 11, 4, 5),
  // Egypt.
  P('egyptS-M-w', 'egyptS', 'egyptM', 'door', 'x', 3.5, 0, -16, 3, 3.5),
  P('egyptS-M-e', 'egyptS', 'egyptM', 'door', 'x', 21.5, 0, -16, 3, 3.5),
  P('egyptS-M-crawl', 'egyptS', 'egyptM', 'crawl', 'x', 31, 0, -16, 1.2, 1.2),
  P('egyptM-N2-w', 'egyptM', 'egyptN2', 'door', 'x', 3.5, 0, -26, 3, 3.5),
  P('egyptM-N2-e', 'egyptM', 'egyptN2', 'door', 'x', 34.5, 0, -26, 3, 3.5),
  P('egyptM-N2-secret', 'egyptM', 'egyptN2', 'secret', 'x', 16, 0, -26, 1.6, 2.6),
  P('egyptN2-N1-w', 'egyptN2', 'egyptN1', 'opening', 'x', -3, 0, -31.5, 6, 4),
  P('egyptN2-N1-e', 'egyptN2', 'egyptN1', 'opening', 'x', 35, 0, -31.5, 6, 4),
  P('egypt-north', 'egyptN1', 'northCourt', 'door', 'x', 4, 0, -37, 3, 4),
  // Cultures.
  P('cultures-south', 'cultures', 'southCourt', 'door', 'x', 4, 0, 37, 4, 5),
  // Dinosaur Hall.
  P('dino-north', 'dinoHall', 'northCourt', 'grand', 'x', -17, 0, -37, 10, 12),
  P('dino-south', 'dinoHall', 'southCourt', 'grand', 'x', -17, 0, 37, 10, 12),
  // Gallery enfilade, zig-zagging (mirror-symmetric north/south for fairness).
  P('gal-north', 'northCourt', 'gallery1', 'door', 'x', -40, 0, -37, 3, 4.5),
  P('gal-1-2', 'gallery1', 'gallery2', 'door', 'x', -32, 0, -27, 3, 4.5),
  P('gal-2-3', 'gallery2', 'gallery3', 'door', 'x', -40, 0, -17, 3, 4.5),
  P('gal-3-4', 'gallery3', 'gallery4', 'door', 'x', -32, 0, -7, 3, 4.5),
  P('gal-4-5', 'gallery4', 'gallery5', 'door', 'x', -32, 0, 7, 3, 4.5),
  P('gal-5-6', 'gallery5', 'gallery6', 'door', 'x', -40, 0, 17, 3, 4.5),
  P('gal-6-7', 'gallery6', 'gallery7', 'door', 'x', -32, 0, 27, 3, 4.5),
  P('gal-south', 'gallery7', 'southCourt', 'door', 'x', -40, 0, 37, 3, 4.5),
  // Cross-doors from the galleries into the Dinosaur Hall.
  P('gal2-dino', 'gallery2', 'dinoHall', 'door', 'z', -27, 0, -22, 3, 4.5),
  P('gal4-dino', 'gallery4', 'dinoHall', 'arch', 'z', -27, 0, 0, 4, 5.5),
  P('gal6-dino', 'gallery6', 'dinoHall', 'door', 'z', -27, 0, 22, 3, 4.5),
  // Service level.
  P('north-stair', 'northCourt', 'stairN', 'opening', 'x', 12, 0, -57, 4, 3),
  P('stairN-service', 'stairN', 'service', 'door', 'x', 12, -6, -45, 4, 3),
  P('south-stair', 'southCourt', 'stairS', 'opening', 'x', 12, 0, 57, 4, 3),
  P('stairS-service', 'stairS', 'service', 'door', 'x', 12, -6, 45, 4, 3),
  P('svc-crossN', 'service', 'svcCrossN', 'door', 'z', 14, -6, -30, 4, 3),
  P('crossN-east', 'svcCrossN', 'svcEast', 'door', 'z', 28, -6, -30, 4, 3),
  P('svc-crossS', 'service', 'svcCrossS', 'door', 'z', 14, -6, 30, 4, 3),
  P('crossS-east', 'svcCrossS', 'svcEast', 'door', 'z', 28, -6, 30, 4, 3),
  P('svc-security', 'service', 'security', 'door', 'z', 14, -6, 0, 2, 2.6),
  P('security-lab', 'security', 'lab', 'door', 'z', 24, -6, 0, 2, 2.6),
  P('lab-east', 'lab', 'svcEast', 'door', 'z', 28, -6, 0, 2, 2.6),
];

// ─── Platforms, stairs, rails ─────────────────────────────────────────────────
const platforms: Platform[] = [
  // Upper Balcony ringing the lobby.
  { id: 'balconyN', room: 'lobby', x0: -7, x1: 39, z0: -11, z1: -8, y: 7, style: 'balcony' },
  { id: 'balconyS', room: 'lobby', x0: -7, x1: 39, z0: 8, z1: 11, y: 7, style: 'balcony' },
  { id: 'balconyW', room: 'lobby', x0: -7, x1: -4, z0: -8, z1: 8, y: 7, style: 'balcony' },
  { id: 'balconyE', room: 'lobby', x0: 36, x1: 39, z0: -8, z1: 8, y: 7, style: 'balcony' },
  { id: 'grandLandingN', room: 'lobby', x0: -4, x1: 0, z0: -8, z1: -5.5, y: 7, style: 'landing' },
  { id: 'grandLandingS', room: 'lobby', x0: -4, x1: 0, z0: 5.5, z1: 8, y: 7, style: 'landing' },
  // Dinosaur Hall catwalks.
  { id: 'catwalkE', room: 'dinoHall', x0: -10, x1: -7, z0: -37, z1: 37, y: 7, style: 'catwalk' },
  { id: 'catwalkW', room: 'dinoHall', x0: -27, x1: -24, z0: -37, z1: 37, y: 7, style: 'catwalk' },
  { id: 'catLandEN', room: 'dinoHall', x0: -13, x1: -10, z0: -37, z1: -34, y: 7, style: 'catwalk' },
  { id: 'catLandES', room: 'dinoHall', x0: -13, x1: -10, z0: 34, z1: 37, y: 7, style: 'catwalk' },
  { id: 'catLandWN', room: 'dinoHall', x0: -24, x1: -21, z0: -37, z1: -34, y: 7, style: 'catwalk' },
  { id: 'catLandWS', room: 'dinoHall', x0: -24, x1: -21, z0: 34, z1: 37, y: 7, style: 'catwalk' },
  // Courts.
  { id: 'templePodium', room: 'northCourt', x0: 16, x1: 32, z0: -59.5, z1: -49, y: 1.2, solid: true, style: 'podium' },
  { id: 'mezzanine', room: 'southCourt', x0: 30, x1: 39, z0: 41, z1: 59.5, y: 5, style: 'mezzanine' },
  { id: 'mezzLanding', room: 'southCourt', x0: 27, x1: 30, z0: 54, z1: 57, y: 5, style: 'landing' },
  // Exterior terrace in front of the doors.
  { id: 'terrace', room: 'exterior', x0: 39, x1: 42, z0: -18, z1: 18, y: 0, solid: true, style: 'podium' },
];

const stairs: Stair[] = [
  { id: 'grandN', room: 'lobby', x0: 0, x1: 14, z0: -8, z1: -5.5, y0: 0, y1: 7, dir: '-x', style: 'grand' },
  { id: 'grandS', room: 'lobby', x0: 0, x1: 14, z0: 5.5, z1: 8, y0: 0, y1: 7, dir: '-x', style: 'grand' },
  { id: 'catEN', room: 'dinoHall', x0: -13, x1: -10, z0: -34, z1: -20, y0: 0, y1: 7, dir: '-z', style: 'metal' },
  { id: 'catES', room: 'dinoHall', x0: -13, x1: -10, z0: 20, z1: 34, y0: 0, y1: 7, dir: '+z', style: 'metal' },
  { id: 'catWN', room: 'dinoHall', x0: -24, x1: -21, z0: -34, z1: -20, y0: 0, y1: 7, dir: '-z', style: 'metal' },
  { id: 'catWS', room: 'dinoHall', x0: -24, x1: -21, z0: 20, z1: 34, y0: 0, y1: 7, dir: '+z', style: 'metal' },
  { id: 'templeSteps', room: 'northCourt', x0: 20, x1: 28, z0: -49, z1: -46.6, y0: 0, y1: 1.2, dir: '-z', style: 'stone' },
  { id: 'mezzStair', room: 'southCourt', x0: 27, x1: 30, z0: 44, z1: 54, y0: 0, y1: 5, dir: '+z', style: 'metal' },
  { id: 'svcStairN', room: 'stairN', x0: 10, x1: 14, z0: -57, z1: -45, y0: -6, y1: 0, dir: '-z', style: 'concrete' },
  { id: 'svcStairS', room: 'stairS', x0: 10, x1: 14, z0: 45, z1: 57, y0: -6, y1: 0, dir: '+z', style: 'concrete' },
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
  // Balcony inner edges.
  R(0, -8, 36, -8, 7), R(0, 8, 36, 8, 7), R(36, -8, 36, 8, 7), R(-4, -5.5, -4, 5.5, 7),
  // Grand stair sides and landings.
  stairRail(st('grandN'), 'z1', 'balustrade'), stairRail(st('grandN'), 'z0', 'balustrade'), R(-4, -5.5, 0, -5.5, 7),
  stairRail(st('grandS'), 'z0', 'balustrade'), stairRail(st('grandS'), 'z1', 'balustrade'), R(-4, 5.5, 0, 5.5, 7),
  // Catwalk inner edges and stairs.
  R(-10, -34, -10, 34, 7, 7, 'metal'), R(-24, -34, -24, 34, 7, 7, 'metal'),
  ...['catEN', 'catES'].flatMap((id) => [stairRail(st(id), 'x0', 'metal'), stairRail(st(id), 'x1', 'metal')]),
  ...['catWN', 'catWS'].flatMap((id) => [stairRail(st(id), 'x0', 'metal'), stairRail(st(id), 'x1', 'metal')]),
  R(-13, -37, -13, -34, 7, 7, 'metal'), R(-13, 34, -13, 37, 7, 7, 'metal'),
  R(-21, -37, -21, -34, 7, 7, 'metal'), R(-21, 34, -21, 37, 7, 7, 'metal'),
  // Service stair holes in the courts (entry side left open).
  R(10, -57, 10, -45, 0, 0, 'metal'), R(14, -57, 14, -45, 0, 0, 'metal'), R(10, -45, 14, -45, 0, 0, 'metal'),
  R(10, 45, 10, 57, 0, 0, 'metal'), R(14, 45, 14, 57, 0, 0, 'metal'), R(10, 45, 14, 45, 0, 0, 'metal'),
  // South Court mezzanine.
  R(30, 41, 30, 54, 5, 5, 'glass'), R(30, 41, 39, 41, 5, 5, 'glass'),
  stairRail(st('mezzStair'), 'x0', 'glass'), R(27, 54, 27, 57, 5, 5, 'glass'), R(27, 57, 30, 57, 5, 5, 'glass'),
];

// ─── Blocks (exhibits and obstacles) ──────────────────────────────────────────
const B = (
  id: string, room: string, kind: Block['kind'],
  x0: number, x1: number, z0: number, z1: number, y0: number, y1: number,
  extra: Partial<Block> = {},
): Block => ({ id, room, kind, x0, x1, z0, z1, y0, y1, ...extra });

const blocks: Block[] = [
  // Exterior: stair cheek walls and fountains.
  B('cheekN', 'exterior', 'plinth', 42, 50, -18, -16, -2.4, 0.8),
  B('cheekS', 'exterior', 'plinth', 42, 50, 16, 18, -2.4, 0.8),
  B('fountainN', 'exterior', 'pool', 52, 58, -30, -22, -2.4, -1.75),
  B('fountainS', 'exterior', 'pool', 52, 58, 22, 30, -2.4, -1.75),
  B('hotdog', 'exterior', 'barrier', 57, 59.2, 8, 9.2, -2.4, -1.4, { variant: 'hotdog' }),

  // Lobby.
  B('infoDesk', 'lobby', 'desk', 13, 19, -3, 3, 0, 1.1),
  B('lobbyPanel', 'lobby', 'totem', 23.6, 24.4, -1.6, 1.6, 0, 3.2),
  B('planterNW', 'lobby', 'planter', 24, 26, -10.5, -9, 0, 1.0),
  B('planterNE', 'lobby', 'planter', 32, 34, -10.5, -9, 0, 1.0),
  B('planterSW', 'lobby', 'planter', 24, 26, 9, 10.5, 0, 1.0),
  B('planterSE', 'lobby', 'planter', 32, 34, 9, 10.5, 0, 1.0),
  B('benchL1', 'lobby', 'bench', 28, 31, -4.3, -3.7, 0, 0.45),
  B('benchL2', 'lobby', 'bench', 28, 31, 3.7, 4.3, 0, 0.45),

  // Dinosaur Hall: skeletons on plinths (cover).
  B('plinthRex', 'dinoHall', 'plinth', -21, -13, -25, -15, 0, 0.6, { variant: 'rex' }),
  B('plinthSauro', 'dinoHall', 'plinth', -20.5, -13.5, -8, 8, 0, 0.6, { variant: 'sauropod' }),
  B('plinthTrike', 'dinoHall', 'plinth', -21, -13, 15, 25, 0, 0.6, { variant: 'trike' }),

  // Galleries: benches and free-standing partitions.
  B('bench1', 'gallery1', 'bench', -37.5, -34.5, -32.3, -31.7, 0, 0.45),
  B('part2', 'gallery2', 'partition', -39, -33, -22.2, -21.8, 0, 3.6),
  B('bench3', 'gallery3', 'bench', -37.5, -34.5, -12.3, -11.7, 0, 0.45),
  B('sculpt4a', 'gallery4', 'sculpture', -41, -39.6, -3.7, -2.3, 0, 1.1, { variant: 'figure' }),
  B('sculpt4b', 'gallery4', 'sculpture', -32.7, -31.3, 2.3, 3.7, 0, 1.1, { variant: 'torso' }),
  B('sculpt4c', 'gallery4', 'sculpture', -36.8, -35.2, -0.8, 0.8, 0, 1.3, { variant: 'horse' }),
  B('bench5', 'gallery5', 'bench', -37.5, -34.5, 11.7, 12.3, 0, 0.45),
  B('part6', 'gallery6', 'partition', -39, -33, 21.8, 22.2, 0, 3.6),
  B('bench7', 'gallery7', 'bench', -37.5, -34.5, 31.7, 32.3, 0, 0.45),

  // Egypt: walk-through mastaba chapel, sarcophagi, statue rows, corridor wall.
  B('mastabaN', 'egyptM', 'mastaba', 6, 20, -24.5, -22, 0, 3.8),
  B('mastabaS', 'egyptM', 'mastaba', 6, 20, -20, -17.5, 0, 3.8),
  B('sarcophagusCrawl', 'egyptS', 'sarcophagus', 29, 33, -14.6, -12.6, 0, 1.2),
  B('sarcophagus2', 'egyptM', 'sarcophagus', 26, 30, -23, -21, 0, 1.2),
  B('obeliskE', 'egyptM', 'obelisk', -2, -0.8, -21.6, -20.4, 0, 5.4),
  ...[-2, 6, 14, 22, 30].map((x, i) => B(`statueN${i}`, 'egyptN1', 'statue', x, x + 1.2, -36.4, -35.4, 0, 3.4)),
  ...[2, 10, 26].map((x, i) => B(`statueS${i}`, 'egyptN2', 'statue', x, x + 1.2, -27.2, -26.6, 0, 3.0, { noCollide: false })),

  // World Cultures: dioramas, tall carved forms, raised platform, cases, the canoe.
  B('dioramaA', 'cultures', 'diorama', 33, 38.5, 13, 20, 0, 4.5),
  B('dioramaB', 'cultures', 'diorama', 33, 38.5, 24, 31, 0, 4.5),
  B('poleA', 'cultures', 'obelisk', 8, 9.2, 17, 18.2, 0, 8.5, { variant: 'pole' }),
  B('poleB', 'cultures', 'obelisk', 22, 23.2, 22, 23.2, 0, 7.5, { variant: 'pole' }),
  B('poleC', 'cultures', 'obelisk', -2, -0.8, 28, 29.2, 0, 9, { variant: 'pole' }),
  B('cultPodium', 'cultures', 'plinth', 12, 20, 27, 33, 0, 0.6),
  B('caseC1', 'cultures', 'case', 0, 2, 16, 18, 0, 2.1),
  B('caseC2', 'cultures', 'case', 26, 28, 16, 18, 0, 2.1),
  B('caseC3', 'cultures', 'case', 26, 28, 28, 30, 0, 2.1),
  B('maskWall', 'cultures', 'partition', 2, 10, 24, 24.4, 0, 3.4),
  B('canoe', 'cultures', 'sculpture', 0, 24, 21.5, 23, 7.2, 8.0, { noCollide: true, variant: 'canoe' }),

  // North Court: temple, gateway, reflecting pool, relic pedestal.
  B('temple', 'northCourt', 'temple', 19.5, 28.5, -58.5, -53, 1.2, 8.2),
  B('gateway', 'northCourt', 'temple', 22, 26, -51, -50, 1.2, 7, { variant: 'gate' }),
  B('pool', 'northCourt', 'pool', 17, 31, -45.5, -40.5, 0, 0.45),
  B('pedestalA', 'northCourt', 'plinth', -18, -16, -53, -51, 0, 1.0, { variant: 'relic' }),
  B('coverNA', 'northCourt', 'sculpture', -32, -29, -48, -45, 0, 1.6, { variant: 'lion' }),
  B('coverNB', 'northCourt', 'obelisk', -5, -3.8, -50, -48.8, 0, 6.5),

  // South Court: monumental sculpture, carved poles, relic pedestal.
  B('pedestalB', 'southCourt', 'plinth', -18, -16, 51, 53, 0, 1.0, { variant: 'relic' }),
  B('monument', 'southCourt', 'sculpture', 16, 24, 45, 51, 0, 1.0, { variant: 'monument' }),
  B('poleS1', 'southCourt', 'obelisk', -32, -30.8, 45, 46.2, 0, 9, { variant: 'pole' }),
  B('poleS2', 'southCourt', 'obelisk', -5, -3.8, 48.8, 50, 0, 8, { variant: 'pole' }),
  B('coverSA', 'southCourt', 'sculpture', -32, -29, 45, 48, 0, 1.6, { variant: 'lion' }),

  // Service level dressing.
  B('crate1', 'service', 'crate', 10.4, 11.6, -20, -18.8, -6, -4.8),
  B('crate2', 'service', 'crate', 12.6, 13.6, 18, 19.2, -6, -5),
  B('crate3', 'svcEast', 'crate', 28.4, 29.6, 14, 15.6, -6, -4.6),
  B('securityDesk', 'security', 'desk', 18, 21, -1, 1, -6, -5.1),
  B('labTable', 'lab', 'desk', 25, 27, -3, -1, -6, -5.1),
];

const doors: Door[] = [
  { id: 'egyptSecretDoor', portal: 'egyptM-N2-secret', defaultOpen: false, style: 'secretPivot' },
];

const sp = (id: string, x: number, y: number, z: number, yaw = PI / 2): Spawn => ({ id, pos: [x, y, z], yaw });

const spawns: MuseumMap['spawns'] = {
  // All spawns face west (yaw π/2). On the front steps, facing the facade.
  exterior: [sp('steps1', 46.5, -1.35, -3), sp('steps2', 46.5, -1.35, -1), sp('steps3', 46.5, -1.35, 1), sp('steps4', 46.5, -1.35, 3)],
  lobby: [sp('lobby1', 28, 0, -2), sp('lobby2', 28, 0, 2), sp('lobby3', 30, 0, -1), sp('lobby4', 30, 0, 1)],
  // Out of sight of each case, behind cover in the east of each court.
  teamA: [sp('a1', 35, 0, -56), sp('a2', 36, 0, -52), sp('a3', 35, 0, -44), sp('a4', 36, 0, -40)],
  teamB: [sp('b1', 35, 0, 56), sp('b2', 36, 0, 52), sp('b3', 35, 0, 44), sp('b4', 36, 0, 40)],
};

const zones: Zone[] = [
  { id: 'captureA', kind: 'capture', room: 'northCourt', center: [-17, 0, -52], radius: 3 },
  { id: 'captureB', kind: 'capture', room: 'southCourt', center: [-17, 0, 52], radius: 3 },
  { id: 'exitAvenue', kind: 'exit', room: 'exterior', center: [46, -1.2, 0], radius: 6 },
  { id: 'chokeDinoN', kind: 'choke', room: 'dinoHall', center: [-17, 0, -36], radius: 5 },
  { id: 'chokeDinoS', kind: 'choke', room: 'dinoHall', center: [-17, 0, 36], radius: 5 },
  { id: 'restrictedService', kind: 'restricted', room: 'service', center: [12, -6, 0], radius: 30 },
];

const slots: Slot[] = [
  { id: 'caseA', kind: 'relicCase', room: 'northCourt', pos: [-17, 1.0, -52] },
  { id: 'caseB', kind: 'relicCase', room: 'southCourt', pos: [-17, 1.0, 52] },
  // Test grabbables on the information desk (M2).
  { id: 'propBust1', kind: 'prop', room: 'lobby', pos: [14.2, 1.1, -1.2] },
  { id: 'propBust2', kind: 'prop', room: 'lobby', pos: [14.2, 1.1, 1.2] },
  { id: 'propVase1', kind: 'prop', room: 'lobby', pos: [17.8, 1.1, 0] },
];

const landmarks: MuseumMap['landmarks'] = [
  { id: 'caseA', room: 'northCourt', pos: [-17, 0, -52] },
  { id: 'caseB', room: 'southCourt', pos: [-17, 0, 52] },
  { id: 'steps', room: 'exterior', pos: [46.5, -1.35, 0] },
  { id: 'desk', room: 'lobby', pos: [20, 0, 0] },
];

export const museum: MuseumMap = {
  rooms, portals, platforms, stairs, rails, blocks, doors, spawns, zones, slots, landmarks,
  exteriorFence: { x0: 39, x1: 61, z0: -40, z1: 40 },
};
