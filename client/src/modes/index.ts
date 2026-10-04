import * as THREE from 'three';
import type { ModeId } from '@museum/shared';
import type { Net, NetState } from '../multiplayer/net';
import type { AudioEngine } from '../audio/audio';
import type { WorldObjects } from '../interaction/objects';
import { fmtTime } from '../ui/menus';

/** What a client mode can touch (brief §14). */
export interface ClientModeCtx {
  net: Net;
  audio: AudioEngine;
  objects: WorldObjects;
  scene: THREE.Object3D;
}

export interface ClientMode {
  id: ModeId;
  enter(ctx: ClientModeCtx): void;
  update(ctx: ClientModeCtx, dt: number): void;
  exit(ctx: ClientModeCtx): void;
  /** Lines for the wrist display / desktop HUD. */
  hud(ctx: ClientModeCtx): string[];
}

const TEAM = { A: 'Falcons', B: 'Masks' } as const;
const tmp = new THREE.Vector3();

function timer(ctx: ClientModeCtx) {
  const s = ctx.net.state;
  if (!s) return '';
  if (s.phase === 'countdown') return `Starting in ${fmtTime(s.phaseEndsAt - ctx.net.serverNow())}`;
  if (s.phase === 'playing') return s.phaseEndsAt ? fmtTime(s.phaseEndsAt - ctx.net.serverNow()) : s.suddenDeath ? 'SUDDEN DEATH' : '';
  return '';
}

const ctr: ClientMode = {
  id: 'ctr',
  enter() {},
  exit(ctx) { ctx.audio.setHum(null); },
  update(ctx) {
    // Anti-stalemate: a carried relic hums audibly wherever it goes.
    let carried: string | null = null;
    ctx.net.state?.objects?.forEach((o: NetState, id: string) => { if (o.kind === 'relic' && o.status === 'carried') carried = id; });
    ctx.audio.setHum(carried && ctx.objects.position(carried, tmp) ? tmp : null);
  },
  hud(ctx) {
    const s = ctx.net.state;
    const me = ctx.net.me();
    const team = me?.team as 'A' | 'B' | '';
    const own = team ? s.objects?.get(team === 'A' ? 'relicA' : 'relicB') : null;
    const status = !own ? '' : own.status === 'home' ? 'Your relic is home' : own.status === 'carried' ? 'YOUR RELIC IS STOLEN' : 'Your relic is loose!';
    return [`${TEAM.A} ${s.scoreA} – ${s.scoreB} ${TEAM.B}`, `${team ? `You: ${TEAM[team]}` : ''}  ${timer(ctx)}`, status];
  },
};

const tour: ClientMode = {
  id: 'tour',
  enter() {}, exit() {}, update() {},
  hud(ctx) { return ['Free Tour', timer(ctx), '']; },
};

/** Client mode registry; one line per mode. */
export const CLIENT_MODES: Partial<Record<ModeId, ClientMode>> = { ctr, tour };

export function lobbyHud(ctx: ClientModeCtx): string[] {
  const s = ctx.net.state;
  if (!s) return ['Connecting…'];
  const n = s.players?.size ?? 0;
  if (s.phase === 'roundEnd') return ['Round over', s.result, 'Back to the lobby shortly…'];
  return ['Grand Lobby', `${n} in party${ctx.net.isHost() ? ' · you host' : ''}`, 'Visit the totem by the desk'];
}
