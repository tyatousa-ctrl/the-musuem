import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MOODS, TOURIST_KINDS, museum, ropeSegments, tunables, type ServerEvents } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import type { ClientMode, ClientModeCtx } from './index';

/**
 * Crowd Control on the client (brief §17): floor arrows for the one-way
 * circuit, closed-area markers, velvet ropes between stanchions, speech
 * bubbles, and the tourists themselves, drawn instanced (seven draw calls for
 * the whole crowd) with a procedural walk bob instead of skeletons.
 */
const MAX = 64;
const MOOD_COLOR: Partial<Record<(typeof MOODS)[number], number>> = {
  wrong: 0xe0402a, offRoute: 0xf0a020, filming: 0xb060ff, huffy: 0xffffff, waiting: 0x60a0ff,
};
const SHIRTS = [0x3b6fb6, 0xc8553d, 0x4f9d69, 0xe0b440, 0x8a5fb0, 0x2f8f9d, 0xd9d4c7, 0x6b6b6b, 0xb04a7a, 0x5a7d2a];
const PANTS = [0x2b2f3a, 0x4a3b2a, 0x1f3550, 0x6b6250, 0x333333];
const HAIR = [0x2a1d14, 0x4a3020, 0x111111, 0x8a6a3a, 0xc9c2b4, 0x6b3a1e];
const SKIN = [0xf1c9a5, 0xd9a47a, 0xa8754f, 0x7a4f32, 0xe8b894];

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

interface Shown { x: number; z: number; yaw: number; phase: number; hop: number; seen: boolean; slot: number }

class Crowd {
  readonly group = new THREE.Group();
  private legs: THREE.InstancedMesh;
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private marker: THREE.InstancedMesh;
  private flag: THREE.InstancedMesh;
  private held: THREE.InstancedMesh;
  private shown = new Map<string, Shown>();
  private free: number[] = [];
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.group.name = 'tourists';
    const mat = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    const inst = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const im = new THREE.InstancedMesh(g, m, MAX);
      im.count = MAX;
      im.frustumCulled = false; // the crowd spans the museum; one bounding box would be the whole building
      for (let i = 0; i < MAX; i++) { im.setMatrixAt(i, this.zero); im.setColorAt(i, this.c.set(0xffffff)); }
      this.group.add(im);
      return im;
    };
    const legs = new THREE.BoxGeometry(0.3, 0.8, 0.17).translate(0, 0.4, 0);
    const torso = new THREE.CylinderGeometry(0.17, 0.21, 0.62, 8).translate(0, 1.11, 0);
    const arms = new THREE.BoxGeometry(0.56, 0.5, 0.11).translate(0, 1.13, 0);
    const head = new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.56, 0);
    const hair = new THREE.SphereGeometry(0.128, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.575, 0.012);
    const marker = new THREE.ConeGeometry(0.1, 0.22, 6).rotateX(Math.PI).translate(0, 2.05, 0);
    const flag = mergeGeometries([
      new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5).translate(0.22, 1.7, 0),
      new THREE.BoxGeometry(0.26, 0.17, 0.01).translate(0.36, 2.1, 0),
    ])!;
    const held = new THREE.BoxGeometry(0.16, 0.12, 0.02).rotateX(-0.6).translate(0, 1.32, -0.28);
    this.legs = inst(legs, mat());
    this.torso = inst(mergeGeometries([torso, arms])!, mat());
    this.head = inst(head, mat());
    this.hair = inst(hair, mat());
    this.marker = inst(marker, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.flag = inst(flag, mat());
    this.held = inst(held, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
  }

  update(state: NetState, dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 10);
    for (const v of this.shown.values()) v.seen = false;
    state?.agents?.forEach((a: NetState, id: string) => {
      let v = this.shown.get(id);
      if (!v) {
        const slot = this.free.pop();
        if (slot === undefined) return;
        v = { x: a.x, z: a.z, yaw: a.yaw, phase: 0, hop: 0, seen: true, slot };
        this.shown.set(id, v);
        this.paint(id, slot, TOURIST_KINDS[a.kind] ?? 'normal');
      }
      v.seen = true;
      const ox = v.x, oz = v.z;
      v.x += (a.x - v.x) * k;
      v.z += (a.z - v.z) * k;
      let dy = a.yaw - v.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.yaw += dy * Math.min(1, dt * 8);
      v.phase += Math.hypot(v.x - ox, v.z - oz) * 7.5;
      const mood = MOODS[a.mood] ?? 'ok';
      const kind = TOURIST_KINDS[a.kind] ?? 'normal';
      v.hop = mood === 'huffy' ? Math.min(1, v.hop + dt * 6) : Math.max(0, v.hop - dt * 3);
      const bob = Math.abs(Math.sin(v.phase)) * 0.05 + v.hop * Math.abs(Math.sin(this.t * 13)) * 0.12;
      const sway = Math.sin(v.phase) * 0.06 + v.hop * Math.sin(this.t * 17) * 0.25;
      const scale = kind === 'kid' ? 0.7 : 1;
      this.p.set(v.x, a.y + bob, v.z);
      this.q.setFromEuler(new THREE.Euler(0, v.yaw + sway, 0));
      this.s.setScalar(scale);
      this.m.compose(this.p, this.q, this.s);
      const i = v.slot;
      this.legs.setMatrixAt(i, this.m); this.torso.setMatrixAt(i, this.m); this.head.setMatrixAt(i, this.m); this.hair.setMatrixAt(i, this.m);
      this.flag.setMatrixAt(i, kind === 'guide' || kind === 'leader' ? this.m : this.zero);
      // Influencers hold up a phone (higher while filming); lost visitors stare at a map.
      if (kind === 'influencer' || kind === 'lost') {
        if (mood === 'filming') { this.p.y += 0.35; this.m.compose(this.p, this.q, this.s); this.p.y -= 0.35; }
        this.held.setMatrixAt(i, this.m);
      } else this.held.setMatrixAt(i, this.zero);
      const mc = MOOD_COLOR[mood];
      if (mc !== undefined) {
        this.p.y += Math.sin(this.t * 4 + i) * 0.05 * (1 / scale);
        this.q.setFromEuler(new THREE.Euler(0, this.t * 2.5, 0));
        this.m.compose(this.p, this.q, this.s);
        this.marker.setMatrixAt(i, this.m);
        const blink = mood === 'filming' && Math.sin(this.t * 20) > 0.6 ? 0xffffff : mc;
        this.marker.setColorAt(i, this.c.set(blink));
      } else this.marker.setMatrixAt(i, this.zero);
    });
    for (const [id, v] of this.shown) {
      if (v.seen) continue;
      for (const im of [this.legs, this.torso, this.head, this.hair, this.marker, this.flag, this.held]) im.setMatrixAt(v.slot, this.zero);
      this.free.push(v.slot);
      this.shown.delete(id);
    }
    for (const im of [this.legs, this.torso, this.head, this.hair, this.marker, this.flag, this.held]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** Clothes, skin and accessories for a newly arrived tourist. */
  private paint(id: string, slot: number, kind: string) {
    const h = hash(id);
    const shirt = kind === 'stubborn' ? 0x4a4a4a : kind === 'influencer' ? 0xff6fb5 : kind === 'guide' ? 0xf2c14e : SHIRTS[h % SHIRTS.length];
    this.torso.setColorAt(slot, this.c.set(shirt));
    this.legs.setColorAt(slot, this.c.set(PANTS[(h >>> 4) % PANTS.length]));
    this.head.setColorAt(slot, this.c.set(SKIN[(h >>> 8) % SKIN.length]));
    this.hair.setColorAt(slot, this.c.set(HAIR[(h >>> 12) % HAIR.length]));
    this.flag.setColorAt(slot, this.c.set(kind === 'guide' ? 0xf2c14e : 0x3b8fe0));
    this.held.setColorAt(slot, this.c.set(kind === 'lost' ? 0xf3ead9 : 0x222222));
  }

  dispose() { this.group.traverse((o) => { if (o instanceof THREE.InstancedMesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); o.dispose(); } }); }
}

/** A text sprite on a rounded card. */
function label(text: string, opts: { bg: string; fg: string; w?: number; h?: number; font?: string; scale?: number }): THREE.Sprite {
  const w = opts.w ?? 512, h = opts.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = opts.bg; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 26); x.fill();
  x.fillStyle = opts.fg; x.font = opts.font ?? 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  // Shrink the font until the text fits the card.
  for (let px = parseInt(/(\d+)px/.exec(x.font)?.[1] ?? '54', 10); x.measureText(text).width > w - 48 && px > 12; px -= 2) x.font = x.font.replace(/\d+px/, `${px}px`);
  x.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const sc = opts.scale ?? 2.2;
  s.scale.set(sc, sc * (h / w), 1);
  return s;
}

/** The circuit arrows, closed areas, entrance and exit. */
function circuitMarkers(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'circuit';
  const pts = museum.circuit.points;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.32); shape.lineTo(0.34, -0.02); shape.lineTo(0.2, -0.02); shape.lineTo(0, 0.17);
  shape.lineTo(-0.2, -0.02); shape.lineTo(-0.34, -0.02); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const places: { x: number; z: number; yaw: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, , az] = pts[i], [bx, , bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bx - ax), -(bz - az));
    for (let d = 1.2; d < len - 0.6; d += 2.6) places.push({ x: ax + ((bx - ax) * d) / len, z: az + ((bz - az) * d) / len, yaw });
  }
  const arrows = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8b23a, transparent: true, opacity: 0.92, depthWrite: false }), places.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  places.forEach((p, i) => arrows.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, 0.025, p.z), q.setFromAxisAngle(up, p.yaw), new THREE.Vector3(2, 1, 2))));
  g.add(arrows);

  for (const d of museum.circuit.detours) {
    const z = museum.zones.find((x) => x.id === d.zone)!;
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.radius - 0.15, z.radius, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8382a, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.position.set(z.center[0], z.center[1] + 0.03, z.center[2]);
    const sign = label('STAFF ONLY · CLOSED', { bg: 'rgba(150,24,18,0.92)', fg: '#fff3e6', font: 'bold 46px sans-serif' });
    sign.position.set(z.center[0], 2.4, z.center[2]);
    g.add(ring, sign);
  }
  const [ex, , ez] = pts[pts.length - 1];
  const exit = label('EXIT', { bg: 'rgba(20,110,60,0.92)', fg: '#ffffff', w: 256, h: 128, font: 'bold 70px sans-serif', scale: 1.2 });
  exit.position.set(ex - 1, 3, ez);
  const [nx, , nz] = pts[0];
  const entry = label('ENTRANCE · FOLLOW THE ARROWS', { bg: 'rgba(24,20,16,0.9)', fg: '#f3dc9a', w: 768, font: 'bold 50px Georgia, serif', scale: 3 });
  entry.position.set(nx - 1.5, 3.2, nz - 3);
  g.add(exit, entry);
  return g;
}

/** Velvet ropes between standing stanchions (the same rule the server uses). */
class Ropes {
  readonly group = new THREE.Group();
  private pool: THREE.Mesh[] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  constructor() {
    this.group.name = 'ropes';
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 6).rotateX(Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x9a1b2a });
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; this.pool.push(m); this.group.add(m); }
  }

  update(ctx: ClientModeCtx) {
    const posts: { id: string; x: number; z: number; y: number }[] = [];
    ctx.net.state?.objects?.forEach((o: NetState, id: string) => {
      if (o.kind !== 'stanchion' || o.status === 'carried' || o.status === 'flight' || o.y > 2) return;
      posts.push({ id, x: o.x, z: o.z, y: o.y });
    });
    let n = 0;
    for (const r of ropeSegments(posts, tunables.crowdControl.ropeMaxLen)) {
      if (!ctx.objects.position(r.a, this.a) || !ctx.objects.position(r.b, this.b)) continue;
      this.a.y -= 0.08; this.b.y -= 0.08;
      // Two halves that sag in the middle.
      const mid = this.a.clone().lerp(this.b, 0.5);
      mid.y -= 0.14;
      for (const [p, q] of [[this.a, mid], [mid, this.b]] as const) {
        const m = this.pool[n++];
        if (!m) break;
        m.visible = true;
        m.position.copy(p).lerp(q, 0.5);
        m.scale.set(1, 1, p.distanceTo(q));
        m.lookAt(q);
      }
    }
    for (; n < this.pool.length; n++) this.pool[n].visible = false;
  }
}

/** Short comic speech bubbles over tourists. */
const LINES: Record<string, string[]> = {
  turned: ['Oh! This way?', 'Fine, fine.', 'Well, excuse ME.', 'Hmph!', 'Okay, okay!'],
  huffy: ['Hey!', 'Personal space!', 'Rude.', 'I KNOW.'],
  ignored: ['Nope!', 'Wheee!', 'Can\'t catch me!'],
  again: ['I know where I\'m going.', 'Not listening.', 'Hmm? No.'],
  sign: ['Oh, a sign!', 'Ah. Arrows.'],
  wrongExit: ['Bye, I guess.', 'Worst museum ever.'],
  filming: ['Wait, content!', 'Like and subscribe!'],
  breach: ['Ooh, what\'s in here?', 'Staff only? Pfft.'],
};

class Bubbles {
  readonly group = new THREE.Group();
  private cache = new Map<string, THREE.SpriteMaterial>();
  private live: { s: THREE.Sprite; life: number }[] = [];

  constructor() { this.group.name = 'bubbles'; }

  say(kind: string, pos: [number, number, number]) {
    const lines = LINES[kind];
    if (!lines) return;
    const text = lines[Math.floor(Math.random() * lines.length)];
    let mat = this.cache.get(text);
    if (!mat) {
      mat = label(text, { bg: 'rgba(255,255,255,0.94)', fg: '#2a2118', font: 'italic bold 48px Georgia, serif' }).material;
      this.cache.set(text, mat);
    }
    const s = new THREE.Sprite(mat);
    s.scale.set(1.3, 0.325, 1);
    s.position.set(pos[0], pos[1] + 0.75, pos[2]);
    this.group.add(s);
    this.live.push({ s, life: 1.8 });
    if (this.live.length > 8) { this.live[0].s.removeFromParent(); this.live.shift(); }
  }

  update(dt: number) {
    for (const b of this.live) { b.life -= dt; b.s.position.y += dt * 0.25; }
    this.live = this.live.filter((b) => { if (b.life > 0) return true; b.s.removeFromParent(); return false; });
  }
}

let crowd: Crowd | null = null;
let markers: THREE.Group | null = null;
let ropes: Ropes | null = null;
let bubbles: Bubbles | null = null;
let unsubscribe: (() => void) | null = null;

const bar = (v: number) => '●'.repeat(Math.round(v * 6)).padEnd(6, '○');

export const crowdControl: ClientMode = {
  id: 'crowdControl',
  enter(ctx) {
    crowd = new Crowd();
    markers = circuitMarkers();
    ropes = new Ropes();
    bubbles = new Bubbles();
    ctx.scene.add(crowd.group, markers, ropes.group, bubbles.group);
    unsubscribe = ctx.net.on('crowd', (m: ServerEvents['crowd']) => {
      const near = ctx.playerPos().distanceTo(new THREE.Vector3(...m.pos)) < 25;
      if (m.type === 'touched') {
        bubbles?.say(m.effect ?? 'turned', m.pos);
        if (near) ctx.audio.play('huff', m.pos, { rate: m.effect === 'turned' ? 1.15 : 0.9 });
      } else if (m.type === 'filming') { bubbles?.say('filming', m.pos); if (near) ctx.audio.play('shutter', m.pos); }
      else if (m.type === 'wrongExit') { bubbles?.say('wrongExit', m.pos); if (near) ctx.audio.play('bad', m.pos, { gain: 0.5 }); }
      else if (m.type === 'breach') bubbles?.say('breach', m.pos);
    });
  },
  exit() {
    unsubscribe?.();
    unsubscribe = null;
    crowd?.group.removeFromParent(); crowd?.dispose();
    markers?.removeFromParent();
    ropes?.group.removeFromParent();
    bubbles?.group.removeFromParent();
    crowd = null; markers = null; ropes = null; bubbles = null;
  },
  update(ctx, dt) {
    crowd?.update(ctx.net.state, dt);
    ropes?.update(ctx);
    bubbles?.update(dt);
  },
  hud(ctx) {
    const s = ctx.net.state;
    let wrong = 0, off = 0;
    s.agents?.forEach((a: NetState) => { const m = MOODS[a.mood]; if (m === 'wrong') wrong++; if (m === 'offRoute') off++; });
    const strays = wrong + off === 0 ? 'Everyone is on route' : [wrong && `${wrong} wrong way`, off && `${off} in closed areas`].filter(Boolean).join(' · ');
    return [`Wave ${s.ccWave}/${tunables.crowdControl.waves} · Score ${s.ccScore}`, `Jam ${bar(s.ccCongestion)}  Closed ${bar(s.ccBreach)}`, strays];
  },
};
