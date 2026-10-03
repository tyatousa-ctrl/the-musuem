import { schema, t, type SchemaType } from '@colyseus/schema';

/** World-space pose of one tracked point. */
export const PoseT = schema({
  px: t.float32().default(0), py: t.float32().default(0), pz: t.float32().default(0),
  qx: t.float32().default(0), qy: t.float32().default(0), qz: t.float32().default(0), qw: t.float32().default(1),
}, 'Pose');
export type PoseT = SchemaType<typeof PoseT>;

export const PlayerT = schema({
  id: t.string().default(''),
  name: t.string().default(''),
  joinedAt: t.number().default(0),
  isVR: t.boolean().default(false),
  /** 'active' | 'ko' | 'spectating' | 'reconnecting' */
  status: t.string().default('active'),
  /** '' | 'A' | 'B' */
  team: t.string().default(''),
  score: t.int16().default(0),
  daze: t.float32().default(0),
  koUntil: t.number().default(0),
  protectedUntil: t.number().default(0),
  menuOpen: t.boolean().default(false),
  feetY: t.float32().default(0),
  head: PoseT,
  left: PoseT,
  right: PoseT,
  heldLeft: t.string().default(''),
  heldRight: t.string().default(''),
}, 'Player');
export type PlayerT = SchemaType<typeof PlayerT>;

/** Grabbable world object: relics, props, later tools and artifacts. */
export const ObjectT = schema({
  id: t.string().default(''),
  /** 'relic' | 'prop' */
  kind: t.string().default(''),
  variant: t.string().default(''),
  team: t.string().default(''),
  /** 'home' | 'carried' | 'dropped' | 'flight' | 'rest' */
  status: t.string().default('rest'),
  holder: t.string().default(''),
  hand: t.string().default(''),
  x: t.float32().default(0), y: t.float32().default(0), z: t.float32().default(0),
  vx: t.float32().default(0), vy: t.float32().default(0), vz: t.float32().default(0),
  spin: t.float32().default(0),
}, 'WorldObject');
export type ObjectT = SchemaType<typeof ObjectT>;

export const BreakableT = schema({
  id: t.string().default(''),
  /** 'case' (later: vase, painting, …) */
  kind: t.string().default(''),
  /** 0 intact, 1 cracked, 2 shattered */
  stage: t.uint8().default(0),
  hits: t.uint8().default(0),
  team: t.string().default(''),
  x: t.float32().default(0), y: t.float32().default(0), z: t.float32().default(0),
}, 'Breakable');
export type BreakableT = SchemaType<typeof BreakableT>;

export const DoorT = schema({
  id: t.string().default(''),
  open: t.boolean().default(false),
}, 'Door');
export type DoorT = SchemaType<typeof DoorT>;

export const PartyState = schema({
  slug: t.string().default(''),
  hostId: t.string().default(''),
  mode: t.string().default('ctr'),
  /** 'lobby' | 'countdown' | 'playing' | 'roundEnd' */
  phase: t.string().default('lobby'),
  /** Server clock (Date.now) when the current phase ends; 0 = no limit. */
  phaseEndsAt: t.number().default(0),
  serverNow: t.number().default(0),
  scoreA: t.int16().default(0),
  scoreB: t.int16().default(0),
  suddenDeath: t.boolean().default(false),
  result: t.string().default(''),
  /** Host-editable round settings. */
  ctrScoreLimit: t.uint8().default(3),
  ctrTimeMin: t.uint8().default(8),
  tourTimeMin: t.uint8().default(3),
  players: t.map(PlayerT),
  objects: t.map(ObjectT),
  breakables: t.map(BreakableT),
  doors: t.map(DoorT),
}, 'PartyState');
export type PartyState = SchemaType<typeof PartyState>;
