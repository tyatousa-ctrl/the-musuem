import type { Hand, ModeId, MuseumMap, ServerEvents, Spawn, Team, Tunables } from '@museum/shared';
import type { BreakableT, ObjectT, PartyState, PlayerT } from '../state/schema.js';
import type { Systems } from '../systems/index.js';

export interface RoundResult {
  /** Short human-readable result shown on the results card. */
  summary: string;
  winner?: Team | string;
}

/** Everything a mode may touch. Modes never reach into the room directly. */
export interface ModeContext {
  state: PartyState;
  map: MuseumMap;
  tunables: Tunables;
  systems: Systems;
  now(): number;
  players(): PlayerT[];
  player(id: string): PlayerT | undefined;
  announce(text: string, tone?: ServerEvents['announcement']['tone'], team?: Team): void;
  broadcast<K extends keyof ServerEvents>(type: K, payload: ServerEvents[K]): void;
  sendTo<K extends keyof ServerEvents>(playerId: string, type: K, payload: ServerEvents[K]): void;
  teleport(player: PlayerT, spawn: Spawn): void;
}

/** What a grab attempt resolves to. 'consumed' means the mode handled it (e.g. a relic return). */
export type GrabVerdict = 'allow' | 'deny' | 'consumed';

export interface ServerMode {
  id: ModeId;
  minPlayers: number;
  maxPlayers: number;
  joinPolicy: 'immediate' | 'spectateUntilNextRound';
  /** Round length in seconds for the current settings; 0 = untimed. */
  timeLimitSec(ctx: ModeContext): number;

  onEnter(ctx: ModeContext): void;
  onPlayerJoin(ctx: ModeContext, player: PlayerT, midRound: boolean): void;
  onPlayerLeave(ctx: ModeContext, player: PlayerT): void;
  onRequest?(ctx: ModeContext, player: PlayerT, type: string, payload: unknown): void;
  tick(ctx: ModeContext, dtMs: number): void;
  onTimeUp?(ctx: ModeContext): void;
  isRoundOver(ctx: ModeContext): RoundResult | null;
  onExit(ctx: ModeContext): void;

  /** Where a player (re)spawns during this mode. */
  spawnFor(ctx: ModeContext, player: PlayerT): Spawn;

  // Shared-system hooks (all optional).
  canGrab?(ctx: ModeContext, player: PlayerT, obj: ObjectT, hand: Hand): GrabVerdict;
  onGrabbed?(ctx: ModeContext, player: PlayerT, obj: ObjectT): void;
  onReleased?(ctx: ModeContext, player: PlayerT, obj: ObjectT, thrown: boolean): void;
  onLanded?(ctx: ModeContext, obj: ObjectT): void;
  /** Return true to let the breakable system apply the hit. */
  onBreakableHit?(ctx: ModeContext, player: PlayerT, breakableId: string): boolean;
  onBreakableStage?(ctx: ModeContext, player: PlayerT, breakableId: string, stage: number): void;
  /** Damage a validated hit does (0 rejects it). Without this, every allowed hit does 1. */
  breakableDamage?(ctx: ModeContext, player: PlayerT, b: BreakableT, hand: Hand): number;
  onBreakableDamaged?(ctx: ModeContext, player: PlayerT, b: BreakableT, damage: number): void;
  onKo?(ctx: ModeContext, player: PlayerT, pos: [number, number, number]): void;
  /** Respawn delay override in seconds (e.g. short-handed teams). */
  respawnDelaySec?(ctx: ModeContext, player: PlayerT): number;
}
