/**
 * Map data types (brief §6.4). Coordinates are metres: +x east, +y up, +z south.
 * North ("uptown") is −z. The avenue entrance faces +x.
 */

export type Vec3 = [number, number, number];

export type RoomId = string;

export type RoomStyle =
  | 'exterior' | 'lobby' | 'dino' | 'gallery' | 'sculpture' | 'egypt'
  | 'cultures' | 'courtNorth' | 'courtSouth' | 'service' | 'stairwell' | 'office'
  | 'stairhall' | 'arms' | 'american' | 'modern' | 'greek';

export interface Room {
  id: RoomId;
  name: string;
  style: RoomStyle;
  /** Plan bounds. */
  x0: number; x1: number; z0: number; z1: number;
  /** Floor and ceiling heights. A room may be stacked under or over another. */
  floorY: number; ceilY: number;
  /** Wall tint for galleries (hex). */
  wallColor?: number;
  /** Rectangular holes in this room's floor (e.g. stairwells down to service). */
  floorHoles?: Rect[];
  /** No auto walls/ceiling (the exterior). */
  open?: boolean;
  /** Skip the auto ceiling (stairwells open to the room above). */
  noCeiling?: boolean;
  /** Reverb/ambience preset id. */
  acoustic: 'hall' | 'court' | 'tomb' | 'gallery' | 'service' | 'outdoor';
}

export interface Rect { x0: number; x1: number; z0: number; z1: number }

export type PortalKind = 'door' | 'arch' | 'grand' | 'secret' | 'crawl' | 'opening';

/**
 * A connection between two rooms. Portals on a shared wall cut an opening in
 * both rooms' auto walls. `axis` is the direction the wall runs: 'x' for a wall
 * at constant z, 'z' for a wall at constant x. `opening` portals (stair holes)
 * cut nothing and exist for culling and the waypoint graph.
 */
export interface Portal {
  id: string;
  a: RoomId; b: RoomId;
  kind: PortalKind;
  axis: 'x' | 'z';
  /** Centre of the opening at floor level. */
  x: number; y: number; z: number;
  width: number; height: number;
}

/** Walkable slab above a room floor: balconies, catwalks, mezzanines, temple platform. */
export interface Platform {
  id: string; room: RoomId;
  x0: number; x1: number; z0: number; z1: number;
  /** Top surface height. */
  y: number;
  /** Solid to the floor (a plinth-like podium) rather than a thin slab. */
  solid?: boolean;
  style: 'balcony' | 'catwalk' | 'podium' | 'mezzanine' | 'landing';
}

/** A straight stair flight. Collision is a ramp; visuals are steps. */
export interface Stair {
  id: string; room: RoomId;
  x0: number; x1: number; z0: number; z1: number;
  /** Height at the low and high ends. */
  y0: number; y1: number;
  /** Direction of ascent. */
  dir: '+x' | '-x' | '+z' | '-z';
  style: 'stone' | 'grand' | 'metal' | 'concrete';
}

/** Railing from (x0,z0) at surface height ya to (x1,z1) at height yb (sloped on stairs). Collides. */
export interface Rail { x0: number; z0: number; x1: number; z1: number; ya: number; yb: number; style: 'balustrade' | 'metal' | 'glass' }

export type BlockKind =
  | 'partition' | 'plinth' | 'mastaba' | 'sarcophagus' | 'statue' | 'diorama'
  | 'totem' | 'desk' | 'bench' | 'temple' | 'pool' | 'crate' | 'lintel'
  | 'case' | 'planter' | 'barrier' | 'sculpture' | 'obelisk'
  | 'knight' | 'colonnade';

/** Solid axis-aligned exhibit or obstacle. Rendered by kind; collides unless `noCollide`. */
export interface Block {
  id: string; room: RoomId; kind: BlockKind;
  x0: number; x1: number; z0: number; z1: number;
  y0: number; y1: number;
  noCollide?: boolean;
  /** Free-form parameter for the renderer (e.g. skeleton species, sculpture seed). */
  variant?: string;
}

/** Server-owned door state (secret pivot doors, fire doors). Collides when closed. */
export interface Door {
  id: string; portal: string;
  defaultOpen: boolean;
  style: 'secretPivot' | 'fireDoor' | 'glass';
}

export interface Spawn { id: string; pos: Vec3; yaw: number }

/**
 * An elevator: one cab footprint (centre x/z, 2.8 m square) with a stop on each
 * floor. Riding is a short fade and a server teleport between stops (no moving
 * floor: better for comfort). `facing` is the open side of the cab.
 */
export interface Elevator {
  id: string;
  x: number; z: number;
  facing: '+x' | '-x' | '+z' | '-z';
  stops: { floor: number; label: string; room: RoomId; y: number }[];
}

export interface Zone {
  id: string; kind: 'capture' | 'restricted' | 'exit' | 'choke' | 'desk';
  room: RoomId;
  center: Vec3; radius: number;
}

export interface Slot {
  id: string; kind: 'relicCase' | 'artifact' | 'tool' | 'prop' | 'painting';
  room: RoomId; pos: Vec3;
  /** For artifacts: placement difficulty. */
  tier?: 'obvious' | 'tucked' | 'hidden';
  /** For paintings: wall normal yaw and max size. */
  yaw?: number; maxW?: number; maxH?: number;
}

export interface WaypointNode { id: string; pos: Vec3; rooms: RoomId[] }
export interface WaypointEdge { a: string; b: string; len: number; oneWay?: boolean }

export interface MuseumMap {
  rooms: Room[];
  portals: Portal[];
  platforms: Platform[];
  stairs: Stair[];
  rails: Rail[];
  blocks: Block[];
  doors: Door[];
  elevators: Elevator[];
  spawns: {
    exterior: Spawn[];
    lobby: Spawn[];
    teamA: Spawn[];
    teamB: Spawn[];
  };
  zones: Zone[];
  slots: Slot[];
  /** Extra waypoint nodes beyond portal centres (bases, desks, landmarks). */
  landmarks: { id: string; room: RoomId; pos: Vec3 }[];
  /** Walkable bounds for the exterior: invisible fences. */
  exteriorFence: Rect;
}
