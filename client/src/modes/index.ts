import * as THREE from 'three';
import { heatWord, hintHeat, museum, type ModeId, type Tier } from '@museum/shared';
import type { Net, NetState } from '../multiplayer/net';
import type { AudioEngine } from '../audio/audio';
import type { WorldObjects } from '../interaction/objects';
import { fmtTime } from '../ui/menus';
import { crowdControl } from './crowd';

/** What a client mode can touch (brief §14). */
export interface ClientModeCtx {
  net: Net;
  audio: AudioEngine;
  objects: WorldObjects;
  scene: THREE.Object3D;
  /** Local player's feet position. */
  playerPos: () => THREE.Vector3;
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

// ─── Artifact Hunt ───────────────────────────────────────────────────────────
const TIER_OF: Record<string, Tier> = { common: 'obvious', rare: 'tucked', legendary: 'hidden' };

function deskMarker(): THREE.Group {
  const desk = museum.zones.find((z) => z.kind === 'desk')!;
  const g = new THREE.Group();
  g.name = 'registrarDesk';
  const ring = new THREE.Mesh(new THREE.RingGeometry(desk.radius - 0.2, desk.radius, 64), new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(desk.center[0], desk.center[1] + 0.02, desk.center[2]);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(24,20,16,0.9)'; x.beginPath(); x.roundRect(4, 4, 504, 120, 24); x.fill();
  x.strokeStyle = '#c9a24f'; x.lineWidth = 4; x.stroke();
  x.fillStyle = '#f3dc9a'; x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.fillText("REGISTRAR'S DESK", 256, 70);
  x.fillStyle = '#f3ead9'; x.font = 'italic 26px Georgia, serif'; x.fillText('bring artifacts here', 256, 106);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sign.scale.set(2.4, 0.6, 1);
  sign.position.set(desk.center[0], 3.4, desk.center[2]);
  g.add(ring, sign);
  return g;
}

let marker: THREE.Group | null = null;
let hintHeatSmoothed = 0;
let tickAcc = 0;

function huntHeat(ctx: ClientModeCtx): number {
  const arts: { pos: [number, number, number]; tier: Tier }[] = [];
  ctx.net.state?.objects?.forEach((o: NetState) => {
    if (o.kind === 'artifact' && o.status !== 'carried') arts.push({ pos: [o.x, o.y, o.z], tier: TIER_OF[o.variant] ?? 'obvious' });
  });
  const p = ctx.playerPos();
  return hintHeat([p.x, p.y, p.z], arts);
}

const artifactHunt: ClientMode = {
  id: 'artifactHunt',
  enter(ctx) { marker = deskMarker(); ctx.scene.add(marker); hintHeatSmoothed = 0; },
  exit() { marker?.removeFromParent(); marker = null; },
  update(ctx, dt) {
    hintHeatSmoothed += (huntHeat(ctx) - hintHeatSmoothed) * Math.min(1, dt * 3);
    if (marker) (marker.children[0] as THREE.Mesh).rotation.z += dt * 0.4;
    // A soft tick that speeds up as you get warmer (only while searching).
    const me = ctx.net.me();
    if (ctx.net.state?.phase !== 'playing' || me?.heldLeft || me?.heldRight || hintHeatSmoothed < 0.2) return;
    tickAcc += dt;
    if (tickAcc > 1.6 - hintHeatSmoothed * 1.3) { tickAcc = 0; ctx.audio.play('ui', undefined, { gain: 0.25 + hintHeatSmoothed * 0.4, rate: 0.8 + hintHeatSmoothed }); }
  },
  hud(ctx) {
    const s = ctx.net.state;
    const me = ctx.net.me();
    let left = 0;
    s.objects?.forEach((o: NetState) => { if (o.kind === 'artifact') left++; });
    let score: string;
    if (s.huntTeams) score = `${TEAM.A} ${s.scoreA} – ${s.scoreB} ${TEAM.B}`;
    else {
      let best = { name: '', score: -1 };
      s.players?.forEach((p: NetState) => { if (p.id !== ctx.net.playerId && p.score > best.score) best = { name: p.name, score: p.score }; });
      score = `You ${me?.score ?? 0}${best.score >= 0 ? ` · ${best.name} ${best.score}` : ''}`;
    }
    const carrying = !!(me?.heldLeft || me?.heldRight) && [me.heldLeft, me.heldRight].some((id: string) => s.objects.get(id)?.kind === 'artifact');
    const dots = '●'.repeat(Math.round(hintHeatSmoothed * 5)).padEnd(5, '○');
    return [score, `${timer(ctx)}  ·  ${left} left`, carrying ? 'Take it to the Registrar\'s Desk!' : `${heatWord(hintHeatSmoothed)} ${dots}`];
  },
};

/** Client mode registry; one line per mode. */
export const CLIENT_MODES: Partial<Record<ModeId, ClientMode>> = { ctr, artifactHunt, crowdControl, tour };

export function lobbyHud(ctx: ClientModeCtx): string[] {
  const s = ctx.net.state;
  if (!s) return ['Connecting…'];
  const n = s.players?.size ?? 0;
  if (s.phase === 'roundEnd') return ['Round over', s.result, 'Back to the lobby shortly…'];
  return ['Grand Lobby', `${n} in party${ctx.net.isHost() ? ' · you host' : ''}`, 'Visit the totem by the desk'];
}
