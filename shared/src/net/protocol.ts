/** Message names, payloads and enums shared by client and server (brief §12.4). */

export const ROOM_NAME = 'party';

export type ModeId = 'tour' | 'ctr' | 'artifactHunt' | 'crowdControl' | 'insuranceFraud';
export type Phase = 'lobby' | 'countdown' | 'playing' | 'roundEnd';
export type Team = '' | 'A' | 'B';
export type PlayerStatus = 'active' | 'ko' | 'spectating' | 'reconnecting';
export type Hand = 'left' | 'right';

export interface ModeInfo {
  id: ModeId;
  name: string;
  pitch: string;
  players: string;
  available: boolean;
}

/** Shown on the lobby panel. Unavailable modes are visible but locked. */
export const MODE_CATALOG: ModeInfo[] = [
  { id: 'ctr', name: 'Capture the Relic', pitch: 'Smash their case, steal their relic, carry it home.', players: '2–4 · teams', available: true },
  { id: 'artifactHunt', name: 'Artifact Hunt', pitch: 'Find hidden treasures and bring them to the desk.', players: '1–4 · FFA or teams', available: true },
  { id: 'crowdControl', name: 'Crowd Control', pitch: 'Co-op security. Turn the tourists around.', players: '1–4 · co-op', available: false },
  { id: 'insuranceFraud', name: 'Insurance Fraud', pitch: 'Run up the biggest insurance bill.', players: '2–4 · FFA', available: false },
  { id: 'tour', name: 'Free Tour', pitch: 'A timed wander. Explore, practise, mess about.', players: '1–4', available: true },
];

export interface JoinOptions {
  slug: string;
  playerId: string;
  name: string;
  isVR: boolean;
}

/** Pose in world space: head and both hands, position + quaternion. */
export type PoseArray = [
  hx: number, hy: number, hz: number, hqx: number, hqy: number, hqz: number, hqw: number,
  lx: number, ly: number, lz: number, lqx: number, lqy: number, lqz: number, lqw: number,
  rx: number, ry: number, rz: number, rqx: number, rqy: number, rqz: number, rqw: number,
];

// Client → server requests.
export interface ClientMessages {
  pose: { p: PoseArray; feetY: number; menuOpen: boolean };
  grab: { objectId: string; hand: Hand };
  release: { hand: Hand; pos: [number, number, number]; vel: [number, number, number] };
  hitBreakable: { id: string; hand: Hand; speed: number };
  hitPlayer: { targetId: string; hand: Hand; speed: number; dir: [number, number, number]; kind: 'shove' | 'bonk' };
  useDoor: { id: string };
  selectMode: { mode: ModeId };
  setSetting: { key: string; value: number | string | boolean };
  startRound: Record<string, never>;
  endRound: Record<string, never>;
  leaveParty: Record<string, never>;
  ping: { t: number };
}

// Server → client one-shot events.
export interface ServerEvents {
  glassCracked: { id: string; pos: [number, number, number] };
  glassShattered: { id: string; pos: [number, number, number] };
  alarm: { id: string; pos: [number, number, number]; team: Team };
  ko: { playerId: string; pos: [number, number, number] };
  hit: { attackerId: string; targetId: string; kind: 'shove' | 'bonk'; pos: [number, number, number] };
  knockback: { vel: [number, number, number] };
  teleport: { pos: [number, number, number]; yaw: number };
  scored: { team: Team; playerId: string; scoreA: number; scoreB: number };
  announcement: { text: string; tone: 'info' | 'good' | 'bad' | 'alert'; team?: Team };
  grabRejected: { objectId: string; hand: Hand };
  pong: { t: number; server: number };
}

export const SETTINGS_KEYS = ['ctrScoreLimit', 'ctrTimeMin', 'tourTimeMin', 'huntTimeMin', 'huntTeams'] as const;
