import * as THREE from 'three';
import { money, type ServerEvents } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import { Crowd, label } from './crowd';
import { timer, type ClientMode, type ClientModeCtx } from './index';

/**
 * Insurance Fraud on the client (brief §18): guards (the shared instanced NPC
 * renderer), beacons over wanted players, "+$26,000" pop-ups, tool labels,
 * smash sounds, and the HUD with your bill, rank and Security Level.
 */
const TOOL_NAME: Record<string, string> = {
  mallet: 'MALLET', crowbar: 'CROWBAR', extinguisher: 'FIRE EXTINGUISHER', mace: 'CEREMONIAL MACE',
  axe: 'FIRE AXE', sledgehammer: 'SLEDGEHAMMER', ball: 'STONE BALL',
};

class Beacons {
  readonly group = new THREE.Group();
  private pool: { col: THREE.Mesh; stars: THREE.Sprite; level: number }[] = [];
  private starMats = new Map<number, THREE.SpriteMaterial>();

  constructor() {
    this.group.name = 'wantedBeacons';
    const geo = new THREE.CylinderGeometry(0.12, 0.3, 7, 10, 1, true).translate(0, 3.5, 0);
    for (let i = 0; i < 4; i++) {
      const col = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const stars = new THREE.Sprite();
      stars.scale.set(0.9, 0.22, 1);
      col.visible = stars.visible = false;
      this.group.add(col, stars);
      this.pool.push({ col, stars, level: -1 });
    }
  }

  private starsMat(level: number) {
    let m = this.starMats.get(level);
    if (!m) { m = label('★'.repeat(level) + '☆'.repeat(5 - level), { bg: 'rgba(120,20,10,0.85)', fg: '#ffd56b', w: 320, h: 80, font: 'bold 48px sans-serif' }).material; this.starMats.set(level, m); }
    return m;
  }

  update(ctx: ClientModeCtx, t: number) {
    let i = 0;
    ctx.net.state?.players?.forEach((p: NetState, id: string) => {
      if (id === ctx.net.playerId || p.wanted < 2 || p.status !== 'active' || i >= this.pool.length) return;
      const b = this.pool[i++];
      b.col.visible = b.stars.visible = true;
      b.col.position.set(p.head.px, p.feetY, p.head.pz);
      (b.col.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.sin(t * (2 + p.wanted));
      b.stars.position.set(p.head.px, p.head.py + 0.55, p.head.pz);
      if (b.level !== p.wanted) { b.stars.material = this.starsMat(p.wanted); b.level = p.wanted; }
    });
    for (; i < this.pool.length; i++) this.pool[i].col.visible = this.pool[i].stars.visible = false;
  }
}

class Popups {
  readonly group = new THREE.Group();
  private live: { s: THREE.Sprite; life: number }[] = [];
  constructor() { this.group.name = 'payouts'; }
  show(text: string, pos: [number, number, number], mine: boolean) {
    const s = label(text, { bg: mine ? 'rgba(20,90,40,0.92)' : 'rgba(40,40,40,0.8)', fg: mine ? '#d8ffd0' : '#f3ead9', w: 384, h: 96, font: 'bold 56px Georgia, serif' });
    s.scale.set(mine ? 0.7 : 0.8, mine ? 0.175 : 0.2, 1);
    s.position.set(pos[0], pos[1] + 0.6, pos[2]);
    this.group.add(s);
    this.live.push({ s, life: 2 });
    if (this.live.length > 8) { const old = this.live.shift()!; old.s.removeFromParent(); old.s.material.map?.dispose(); old.s.material.dispose(); }
  }
  update(dt: number) {
    for (const p of this.live) { p.life -= dt; p.s.position.y += dt * 0.4; p.s.material.opacity = Math.min(1, p.life); }
    this.live = this.live.filter((p) => { if (p.life > 0) return true; p.s.removeFromParent(); p.s.material.map?.dispose(); p.s.material.dispose(); return false; });
  }
}

/** Labels over resting tools nearby, so players can find them. */
class ToolLabels {
  readonly group = new THREE.Group();
  private sprites = new Map<string, THREE.Sprite>();
  private mats = new Map<string, THREE.SpriteMaterial>();
  constructor() { this.group.name = 'toolLabels'; }
  update(ctx: ClientModeCtx) {
    const me = ctx.playerPos();
    const near: { id: string; d: number; o: NetState }[] = [];
    ctx.net.state?.objects?.forEach((o: NetState, id: string) => {
      if (o.kind !== 'tool' || o.status === 'carried') return;
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      if (d < 12 && Math.abs(o.y - me.y) < 3) near.push({ id, d, o });
    });
    near.sort((a, b) => a.d - b.d);
    const show = new Set(near.slice(0, 3).map((n) => n.id));
    for (const { id, o } of near.slice(0, 3)) {
      let s = this.sprites.get(id);
      if (!s) {
        let m = this.mats.get(o.variant);
        if (!m) { m = label(TOOL_NAME[o.variant] ?? o.variant, { bg: 'rgba(24,20,16,0.88)', fg: '#ffd56b', w: 384, h: 80, font: 'bold 40px sans-serif' }).material; this.mats.set(o.variant, m); }
        s = new THREE.Sprite(m);
        s.scale.set(0.8, 0.17, 1);
        this.sprites.set(id, s);
        this.group.add(s);
      }
      s.position.set(o.x, o.y + 0.75, o.z);
      s.visible = true;
    }
    for (const [id, s] of this.sprites) if (!show.has(id)) s.visible = false;
  }
}

let guards: Crowd | null = null;
let beacons: Beacons | null = null;
let popups: Popups | null = null;
let toolLabels: ToolLabels | null = null;
let offs: (() => void)[] = [];
let t = 0;

export const insuranceFraud: ClientMode = {
  id: 'insuranceFraud',
  enter(ctx) {
    guards = new Crowd(); beacons = new Beacons(); popups = new Popups(); toolLabels = new ToolLabels();
    ctx.scene.add(guards.group, beacons.group, popups.group, toolLabels.group);
    offs = [
      ctx.net.on('payout', (m: ServerEvents['payout']) => {
        const mine = m.playerId === ctx.net.playerId;
        popups?.show(`+${money(m.amount)}`, m.pos, mine);
        if (mine) ctx.audio.play('score', m.pos, { gain: 0.5, rate: 1.3 });
      }),
      ctx.net.on('smash', (m: ServerEvents['smash']) => {
        const big = ['canvas', 'gate', 'mammoth', 'statue'].includes(m.variant);
        if (m.stage === 2) ctx.audio.play(big ? 'thud' : 'shatter', m.pos, { gain: big ? 1.6 : 1.1, rate: big ? 0.55 : 1.2, refDistance: big ? 6 : 3 });
        else ctx.audio.play(m.variant === 'anchor' ? 'door' : 'crack', m.pos, { gain: 0.8, rate: big ? 0.7 : 1 });
      }),
    ];
  },
  exit() {
    offs.forEach((f) => f());
    offs = [];
    for (const g of [guards?.group, beacons?.group, popups?.group, toolLabels?.group]) g?.removeFromParent();
    guards?.dispose();
    guards = null; beacons = null; popups = null; toolLabels = null;
  },
  update(ctx, dt) {
    t += dt;
    guards?.update(ctx.net.state, dt);
    beacons?.update(ctx, t);
    popups?.update(dt);
    toolLabels?.update(ctx);
  },
  hud(ctx) {
    const s = ctx.net.state;
    const me = ctx.net.me();
    const ranked: { id: string; name: string; score: number }[] = [];
    s.players?.forEach((p: NetState, id: string) => { if (p.status !== 'spectating') ranked.push({ id, name: p.name, score: p.score }); });
    ranked.sort((a, b) => b.score - a.score);
    const leader = ranked[0];
    if (!me || me.status === 'spectating') {
      return ['Spectating until the next round', ranked.slice(0, 3).map((r) => `${r.name} ${money(r.score)}`).join(' · ') || 'No damage yet', timer(ctx)];
    }
    const rank = ranked.findIndex((r) => r.id === ctx.net.playerId) + 1;
    const lead = leader && leader.id !== ctx.net.playerId ? ` · ${leader.name} ${money(leader.score)}` : rank === 1 && ranked.length > 1 ? ' · leading!' : '';
    let tool = '';
    for (const id of [me.heldRight, me.heldLeft]) { const o = id && s.objects.get(id); if (o && o.kind === 'tool') tool = TOOL_NAME[o.variant] ?? o.variant; }
    const status = me.status === 'held' ? `HELD BY SECURITY ${Math.max(0, Math.ceil((me.koUntil - ctx.net.serverNow()) / 1000))}s`
      : `Security ${'★'.repeat(me.wanted)}${'☆'.repeat(5 - me.wanted)}${tool ? ` · ${tool}` : ' · bare hands'}`;
    return [`Bill ${money(me.score)} · #${rank} of ${ranked.length}${lead}`, `${timer(ctx)} left`, status];
  },
};
