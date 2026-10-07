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
  /** 'active' | 'ko' | 'held' | 'spectating' | 'reconnecting' */
  status: t.string().default('active'),
  /** '' | 'A' | 'B' */
  team: t.string().default(''),
  score: t.int16().default(0),
  daze: t.float32().default(0),
  koUntil: t.number().default(0),
  protectedUntil: t.number().default(0),
  menuOpen: t.boolean().default(false),
  /** Insurance Fraud security level, 0–5. */
  wanted: t.uint8().default(0),
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
  /** 'case' (CTR glass cases) or 'destructible' (Insurance Fraud) */
  kind: t.string().default(''),
  /** Destructibles: catalogue key (vase, statue, anchor, mammoth, …). */
  variant: t.string().default(''),
  /** 0 intact, 1 damaged, 2 destroyed */
  stage: t.uint8().default(0),
  hits: t.uint8().default(0),
  hp: t.float32().default(0),
  maxHp: t.float32().default(0),
  /** Insured value, thousands of dollars. */
  value: t.uint16().default(0),
  /** Least tool class needed: 'hands' | 'tool' | 'heavy'. */
  tool: t.string().default(''),
  /** Reach target around the centre, m. */
  radius: t.float32().default(0),
  yaw: t.float32().default(0),
  /** Anchors: the object they hold. Ultras: locked until their anchors are gone. */
  parent: t.string().default(''),
  locked: t.boolean().default(false),
  team: t.string().default(''),
  x: t.float32().default(0), y: t.float32().default(0), z: t.float32().default(0),
}, 'Breakable');
export type BreakableT = SchemaType<typeof BreakableT>;

/** A server-simulated NPC (Crowd Control tourists; later Insurance Fraud guards), synced at 10 Hz. */
export const AgentT = schema({
  id: t.string().default(''),
  /** Index into TOURIST_KINDS (or a guard kind later). */
  kind: t.uint8().default(0),
  /** Index into MOODS. */
  mood: t.uint8().default(0),
  x: t.float32().default(0), y: t.float32().default(0), z: t.float32().default(0),
  yaw: t.float32().default(0),
}, 'Agent');
export type AgentT = SchemaType<typeof AgentT>;

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
  huntTimeMin: t.uint8().default(6),
  /** Artifact Hunt: false = free-for-all, true = teams. */
  huntTeams: t.boolean().default(false),
  /** Crowd Control: wave, meters (0..1) and tallies. */
  ccWave: t.uint8().default(0),
  ccCongestion: t.float32().default(0),
  ccBreach: t.float32().default(0),
  ccScore: t.int16().default(0),
  ccRouted: t.int16().default(0),
  ccSpawned: t.int16().default(0),
  players: t.map(PlayerT),
  objects: t.map(ObjectT),
  breakables: t.map(BreakableT),
  doors: t.map(DoorT),
  agents: t.map(AgentT),
}, 'PartyState');
export type PartyState = SchemaType<typeof PartyState>;
