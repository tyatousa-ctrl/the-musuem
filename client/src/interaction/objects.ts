import * as THREE from 'three';
import type { Hand } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import type { Avatars } from '../multiplayer/avatars';
import type { TrackedHand } from '../player/hands';
import type { DynamicBox } from '../player/collision';
import { DESTRUCTIBLE_CENTER, DESTRUCTIBLE_NAME, money } from '@museum/shared';
import { SIZE, destructibleMesh, priceTag, rubbleMesh } from './destructibles';

const tmp = new THREE.Vector3();

/** Visual for a synced grabbable (relic, prop). */
function makeObjectMesh(kind: string, variant: string, team: string): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'relic') {
    const color = team === 'A' ? 0xf2c14e : 0x4fcf98;
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 });
    if (variant === 'falcon') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), mat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat);
      head.position.set(0, 0.13, -0.02);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 6), mat);
      beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.12, -0.08);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.02), mat);
      wing.position.set(0, 0.03, 0.03);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 10), mat);
      base.position.y = -0.11;
      g.add(body, head, beak, wing, base);
    } else {
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
      face.scale.set(0.9, 1.25, 0.55);
      face.rotation.x = Math.PI / 2;
      const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.02), new THREE.MeshBasicMaterial({ color: 0x0b2a1e }));
      eyes.position.set(0, 0.03, -0.055);
      g.add(face, eyes);
    }
    // Soft glow halo.
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.name = 'glow';
    g.add(glow);
  } else if (kind === 'artifact') {
    // Rarity reads at a glance: terracotta, gold, then a jewelled crown with a violet aura.
    const spec = variant === 'legendary' ? { color: 0x9b6bff, glow: 0xb48cff, r: 0.32 } : variant === 'rare' ? { color: 0xf0c24a, glow: 0xffd56b, r: 0.24 } : { color: 0xb8643a, glow: 0xffc9a0, r: 0.16 };
    const mat = new THREE.MeshLambertMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: variant === 'common' ? 0.1 : 0.4 });
    if (variant === 'legendary') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.06, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xf0c24a, emissive: 0xf0c24a, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
      g.add(band);
      for (let i = 0; i < 6; i++) { const pt = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), band.material); pt.position.set(Math.cos(i * 1.047) * 0.085, 0.055, Math.sin(i * 1.047) * 0.085); g.add(pt); }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), mat);
      gem.position.y = 0.02; gem.position.z = 0.09;
      g.add(gem);
    } else if (variant === 'rare') {
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), mat);
      mask.scale.set(0.85, 1.2, 0.5);
      mask.rotation.x = Math.PI / 2;
      g.add(mask);
    } else {
      const amphora = new THREE.Mesh(new THREE.LatheGeometry([0.001, 0.03, 0.06, 0.07, 0.05, 0.025, 0.035].map((r, i) => new THREE.Vector2(r, i * 0.035 - 0.1)), 10), mat);
      g.add(amphora);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(spec.r, 12, 8), new THREE.MeshBasicMaterial({ color: spec.glow, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.name = 'glow';
    g.add(glow);
    g.scale.setScalar(1.4); // big enough to spot across a room
  } else if (kind === 'tool') {
    g.add(makeTool(variant));
  } else if (kind === 'stanchion') {
    // Brass queue post, held by its top: the origin is the grab point, the base sits 0.95 m below.
    const brass = new THREE.MeshLambertMaterial({ color: 0xc9a24f, emissive: 0x3a2a0a });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), brass);
    post.position.y = -0.47;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), brass);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 14), brass);
    base.position.y = -0.93;
    g.add(post, top, base);
  } else if (kind === 'sign') {
    // "Please follow the arrows" sandwich sign on a post; the origin is the top of the post.
    const c = document.createElement('canvas');
    c.width = 256; c.height = 192;
    const x = c.getContext('2d')!;
    x.fillStyle = '#1d2a44'; x.fillRect(0, 0, 256, 192);
    x.strokeStyle = '#c9a24f'; x.lineWidth = 8; x.strokeRect(6, 6, 244, 180);
    x.fillStyle = '#f3dc9a'; x.font = 'bold 34px Georgia, serif'; x.textAlign = 'center';
    x.fillText('PLEASE', 128, 52); x.fillText('FOLLOW THE', 128, 92); x.fillText('ARROWS', 128, 132);
    x.font = 'bold 44px sans-serif'; x.fillText('➜', 128, 178);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.03), [
      new THREE.MeshLambertMaterial({ color: 0x1d2a44 }), new THREE.MeshLambertMaterial({ color: 0x1d2a44 }),
      new THREE.MeshLambertMaterial({ color: 0x1d2a44 }), new THREE.MeshLambertMaterial({ color: 0x1d2a44 }),
      new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex }),
    ]);
    board.position.y = -0.25;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    post.position.y = -0.5;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 12), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    base.position.y = -0.98;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshLambertMaterial({ color: 0xc9a24f }));
    g.add(board, post, base, knob);
  } else if (variant === 'vase') {
    const vase = new THREE.Mesh(new THREE.LatheGeometry([0, 0.06, 0.1, 0.08, 0.05, 0.07].map((r, i) => new THREE.Vector2(r || 0.001, i * 0.05)), 12), new THREE.MeshLambertMaterial({ color: 0x3e6fa8 }));
    vase.position.y = -0.1;
    g.add(vase);
  } else {
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf0ebe2 }));
    bust.position.y = 0.06;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0xd9d2c4 }));
    base.position.y = -0.05;
    g.add(bust, base);
  }
  return g;
}

/**
 * Insurance Fraud tools. The origin is the grip; at rest they stand on the
 * butt of the handle (0.45 m below the grip) with the head up. In the hand
 * they point forward along the controller.
 */
function makeTool(variant: string): THREE.Object3D {
  const g = new THREE.Group();
  const m = (c: number, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: e });
  const wood = m(0x8a5a32), steel = m(0x9aa0a8, 0.1), red = m(0xc0302a, 0.15), gold = m(0xd9b23a, 0.25);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.z = rz; g.add(o); return o; };
  const handle = (top: number, mat: THREE.Material = wood, r = 0.022) => add(new THREE.CylinderGeometry(r, r, top + 0.45, 8), mat, 0, (top - 0.45) / 2);
  switch (variant) {
    case 'mallet': handle(0.25); add(new THREE.BoxGeometry(0.24, 0.13, 0.13), m(0x5a4030), 0, 0.3); break;
    case 'crowbar': handle(0.42, red, 0.016); add(new THREE.TorusGeometry(0.06, 0.016, 6, 10, Math.PI), red, 0.06, 0.42); break;
    case 'extinguisher':
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 14), red, 0, -0.24);
      add(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 8), m(0x222222), 0, 0.0);
      add(new THREE.BoxGeometry(0.12, 0.02, 0.03), m(0x222222), 0.04, 0.05);
      break;
    case 'mace':
      handle(0.28, gold, 0.02);
      add(new THREE.SphereGeometry(0.075, 12, 8), gold, 0, 0.34);
      for (let i = 0; i < 6; i++) { const c = add(new THREE.ConeGeometry(0.02, 0.06, 5), gold, Math.cos(i) * 0.08, 0.34, Math.sin(i) * 0.08); c.lookAt(0, 0.34, 0); c.rotateX(-Math.PI / 2); }
      break;
    case 'axe': handle(0.45); add(new THREE.BoxGeometry(0.2, 0.15, 0.03), red, 0.09, 0.38); add(new THREE.BoxGeometry(0.03, 0.17, 0.035), steel, 0.2, 0.38); break;
    case 'sledgehammer': handle(0.5, wood, 0.025); add(new THREE.BoxGeometry(0.3, 0.13, 0.13), steel, 0, 0.55); break;
    case 'ball': g.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), m(0x9a9282))); break;
    default: handle(0.3);
  }
  return g;
}

/** Tools point forward from the hand: their +y head along the controller's -z. */
const TOOL_GRIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const tmpQ = new THREE.Quaternion();

interface Entry { obj: THREE.Object3D; kind: string; team: string }

/** Synced world objects with local grab prediction (brief §12.4). */
export class WorldObjects {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** Locally predicted holds: objectId → hand, until the server agrees or rejects. */
  private predicted = new Map<string, { hand: Hand; at: number }>();
  t = 0;

  constructor() { this.group.name = 'objects'; }

  predictGrab(id: string, hand: Hand) { this.predicted.set(id, { hand, at: performance.now() }); }
  rejectGrab(id: string) { this.predicted.delete(id); }
  clearPrediction(id: string) { this.predicted.delete(id); }

  /** Nearest grabbable within `radius` of a point, not held by someone else. */
  nearest(state: NetState, p: THREE.Vector3, radius: number, myId: string): string | null {
    let best: string | null = null, bestD = radius;
    state?.objects?.forEach((o: NetState, id: string) => {
      if (o.holder && o.holder !== myId) return;
      if (o.status === 'carried' && o.holder === myId) return;
      const e = this.entries.get(id);
      if (!e) return;
      e.obj.getWorldPosition(tmp);
      const d = tmp.distanceTo(p);
      if (d < bestD) { bestD = d; best = id; }
    });
    return best;
  }

  update(state: NetState, myId: string, hands: Record<Hand, TrackedHand>, avatars: Avatars, dt: number) {
    this.t += dt;
    const seen = new Set<string>();
    state?.objects?.forEach((o: NetState, id: string) => {
      seen.add(id);
      let e = this.entries.get(id);
      if (!e) {
        e = { obj: makeObjectMesh(o.kind, o.variant, o.team), kind: o.kind, team: o.team };
        e.obj.position.set(o.x, o.y, o.z);
        this.entries.set(id, e);
        this.group.add(e.obj);
      }
      const pred = this.predicted.get(id);
      if (pred && (o.holder === myId || performance.now() - pred.at > 1500)) this.predicted.delete(id);
      const mine = o.holder === myId || this.predicted.has(id);
      const hand: Hand | undefined = o.holder === myId ? o.hand : pred?.hand;
      const pointed = e.kind === 'tool' && o.variant !== 'ball';
      if (mine && hand) {
        hands[hand].glove.getWorldPosition(tmp);
        e.obj.position.copy(tmp);
        if (pointed) e.obj.quaternion.copy(hands[hand].glove.getWorldQuaternion(tmpQ)).multiply(TOOL_GRIP);
      } else if (o.status === 'carried' && o.holder) {
        const av = avatars.get(o.holder);
        const h = av && (o.hand === 'left' ? av.left : av.right);
        if (h) {
          h.getWorldPosition(e.obj.position);
          if (pointed) e.obj.quaternion.copy(h.getWorldQuaternion(tmpQ)).multiply(TOOL_GRIP);
        }
      } else {
        if (pointed) e.obj.quaternion.identity();
        // Smoothly chase the server position.
        tmp.set(o.x, o.y, o.z);
        if (e.obj.position.distanceTo(tmp) > 3) e.obj.position.copy(tmp);
        else e.obj.position.lerp(tmp, Math.min(1, dt * 15));
      }
      if (e.kind === 'artifact') e.obj.rotation.y += dt * 0.8;
      if (e.kind === 'relic') {
        e.obj.rotation.y += dt * (o.status === 'home' ? 0.6 : 2);
        const glow = e.obj.getObjectByName('glow') as THREE.Mesh | undefined;
        // Anti-stalemate: a carried relic pulses.
        if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = o.status === 'carried' ? 0.18 + 0.15 * Math.sin(this.t * 6) : 0.16;
      }
    });
    for (const [id, e] of this.entries) if (!seen.has(id)) { e.obj.removeFromParent(); this.entries.delete(id); }
  }

  position(id: string, out: THREE.Vector3) { const e = this.entries.get(id); return e ? e.obj.getWorldPosition(out) : null; }
}

interface Dest {
  root: THREE.Group; mesh: THREE.Mesh; rubble: THREE.Mesh; tag: THREE.Sprite; tagKey: string;
  stage: number; variant: string; center: THREE.Vector3; radius: number; height: number; box?: DynamicBox; wobble: number;
}

/**
 * Everything breakable (brief §20): CTR's display cases crack and shatter;
 * Insurance Fraud's destructibles tilt when damaged and collapse into rubble.
 * Stage meshes swap and shards are pooled; no runtime fracturing.
 */
export class Breakables {
  readonly group = new THREE.Group();
  /** Collision for big destructibles while they stand. */
  readonly boxes: DynamicBox[] = [];
  private cases = new Map<string, { root: THREE.Group; glass: THREE.Mesh; cracks: THREE.Mesh; stage: number }>();
  private dests = new Map<string, Dest>();
  private shards: { m: THREE.Mesh; v: THREE.Vector3; life: number; floor: number }[] = [];
  private glassMat = new THREE.MeshBasicMaterial({ color: 0xd8f0f8, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  private crackTex: THREE.CanvasTexture;

  constructor() {
    this.group.name = 'breakables';
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      g.beginPath(); g.moveTo(128, 128);
      let x = 128, y = 128; const a = (i / 14) * Math.PI * 2;
      for (let k = 0; k < 6; k++) { x += Math.cos(a + (Math.random() - 0.5) * 0.6) * 22; y += Math.sin(a + (Math.random() - 0.5) * 0.6) * 22; g.lineTo(x, y); }
      g.stroke();
    }
    this.crackTex = new THREE.CanvasTexture(c);
    const shardGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.02, 0), new THREE.Vector3(0.02, 0.07, 0.01)]);
    shardGeo.computeVertexNormals();
    const shardMat = new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(shardGeo, shardMat);
      m.visible = false;
      this.group.add(m);
      this.shards.push({ m, v: new THREE.Vector3(), life: 0, floor: 0 });
    }
  }

  update(state: NetState, dt: number, viewer?: THREE.Vector3) {
    const seen = new Set<string>();
    state?.breakables?.forEach((b: NetState, id: string) => {
      seen.add(id);
      if (b.kind === 'destructible') { this.updateDest(id, b, dt); return; }
      let c = this.cases.get(id);
      if (!c) {
        const root = new THREE.Group();
        root.position.set(b.x, b.y, b.z);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.75), this.glassMat);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 0.78), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
        frame.position.y = 0.45;
        const cracks = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.91, 0.76), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false }));
        cracks.visible = false;
        root.add(glass, frame, cracks);
        this.group.add(root);
        c = { root, glass, cracks, stage: 0 };
        this.cases.set(id, c);
      }
      if (b.stage !== c.stage) {
        if (b.stage === 2) this.burst(c.root.position);
        c.stage = b.stage;
      }
      c.glass.visible = b.stage < 2;
      c.cracks.visible = b.stage === 1;
    });
    for (const [id, c] of this.cases) if (!seen.has(id)) { c.root.removeFromParent(); this.cases.delete(id); }
    for (const [id, d] of this.dests) if (!seen.has(id)) {
      d.root.removeFromParent(); d.tag.removeFromParent();
      if (d.box) this.boxes.splice(this.boxes.indexOf(d.box), 1);
      this.dests.delete(id);
    }
    if (viewer) this.updateTags(viewer);
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 9.8 * dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.m.position.y < s.floor + 0.02) { s.m.position.y = s.floor + 0.02; s.v.set(0, 0, 0); }
      s.m.rotation.x += dt * 5;
      s.m.visible = s.life > 0;
    }
  }

  private updateDest(id: string, b: NetState, dt: number) {
    let d = this.dests.get(id);
    if (!d) {
      const center = DESTRUCTIBLE_CENTER[b.variant] ?? 1;
      const root = new THREE.Group();
      root.position.set(b.x, b.y - center, b.z);
      root.rotation.y = b.yaw;
      const mesh = destructibleMesh(b.variant);
      const rubble = rubbleMesh(b.variant);
      rubble.visible = false;
      root.add(mesh, rubble);
      this.group.add(root);
      const size = SIZE[b.variant] ?? SIZE.vase;
      const tag = priceTag('', '');
      tag.visible = false;
      this.group.add(tag);
      d = { root, mesh, rubble, tag, tagKey: '', stage: 0, variant: b.variant, center: new THREE.Vector3(b.x, b.y, b.z), radius: b.radius, height: size[2], wobble: 0 };
      // Players bump into the big pieces (not vases on pedestals).
      if (size[0] >= 0.3 || size[2] >= 1.8) {
        const sideways = Math.abs(Math.sin(b.yaw)) > 0.7;
        const hx = sideways ? size[1] : size[0], hz = sideways ? size[0] : size[1];
        const fy = b.y - center;
        d.box = { box: new THREE.Box3(new THREE.Vector3(b.x - hx, fy, b.z - hz), new THREE.Vector3(b.x + hx, fy + size[2], b.z + hz)), active: true };
        this.boxes.push(d.box);
      }
      this.dests.set(id, d);
    }
    // Damage: a jolt and a lasting lean; destroyed: rubble and flying pieces.
    if (b.stage !== d.stage || (b.stage === 1 && d.wobble <= 0 && b.hp !== d.mesh.userData.hp)) {
      if (b.stage === 2 && d.stage < 2) this.burst(d.center, Math.min(60, 12 + d.height * 8), d.root.position.y);
      d.wobble = 0.35;
      d.stage = b.stage;
    }
    d.mesh.userData.hp = b.hp;
    d.wobble = Math.max(0, d.wobble - dt);
    const lean = b.stage === 1 ? (1 - b.hp / Math.max(1, b.maxHp)) * 0.12 : 0;
    d.mesh.rotation.z = lean + Math.sin(d.wobble * 40) * d.wobble * 0.15;
    d.mesh.visible = b.stage < 2;
    d.rubble.visible = b.stage >= 2;
    if (d.box) d.box.active = b.stage < 2;
    // Tag text follows value and state.
    const key = `${b.value}|${b.stage}|${b.locked}`;
    if (key !== d.tagKey) {
      d.tagKey = key;
      const sub = b.variant === 'anchor' ? 'anchor: loosen me' : b.locked ? `${DESTRUCTIBLE_NAME[b.variant]} · anchored` : DESTRUCTIBLE_NAME[b.variant] ?? '';
      const fresh = priceTag(b.variant === 'anchor' ? 'ANCHOR' : money(b.value), sub);
      d.tag.material = fresh.material;
      d.tag.position.set(b.x, b.y - (DESTRUCTIBLE_CENTER[b.variant] ?? 1) + d.height + (d.height > 3 ? 0.6 : 0.3), b.z);
      if (d.height > 3) d.tag.scale.set(1.1, 0.48, 1); else d.tag.scale.set(0.55, 0.24, 1);
    }
  }

  /** Price tags on the nearest few standing destructibles only (each tag is a draw call). */
  private updateTags(viewer: THREE.Vector3) {
    const near: { d: Dest; dist: number }[] = [];
    for (const d of this.dests.values()) {
      d.tag.visible = false;
      if (d.stage >= 2) continue;
      const dist = d.center.distanceTo(viewer);
      if (dist < (d.height > 3 ? 14 : 8)) near.push({ d, dist });
    }
    near.sort((a, b) => a.dist - b.dist).slice(0, 6).forEach(({ d }) => (d.tag.visible = true));
  }

  private burst(at: THREE.Vector3, count = 30, floor = 0) {
    let n = 0;
    for (const s of this.shards) {
      if (s.life > 0 || n++ > count) continue;
      s.floor = floor;
      s.m.position.set(at.x + (Math.random() - 0.5) * 0.7, at.y + (Math.random() - 0.5) * 0.8, at.z + (Math.random() - 0.5) * 0.7);
      s.v.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      s.life = 2.5 + Math.random();
      s.m.visible = true;
    }
  }

  /** Breakable whose volume contains (or nearly contains) a point. */
  hitTest(p: THREE.Vector3, pad = 0.12): string | null {
    for (const [id, d] of this.dests) {
      if (d.stage >= 2) continue;
      const floor = d.root.position.y;
      if (Math.hypot(p.x - d.center.x, p.z - d.center.z) < Math.max(0.3, d.radius) + pad && p.y > floor - pad && p.y < floor + d.height + pad) return id;
    }
    for (const [id, c] of this.cases) {
      if (c.stage >= 2) continue;
      const d = c.root.position;
      if (Math.abs(p.x - d.x) < 0.375 + pad && Math.abs(p.y - d.y) < 0.45 + pad && Math.abs(p.z - d.z) < 0.375 + pad) return id;
    }
    return null;
  }

  /** Nearest intact case within `range` in front of a ray (desktop punches). */
  inFront(origin: THREE.Vector3, dir: THREE.Vector3, range: number): string | null {
    let best: string | null = null, bestD = range;
    for (const [id, c] of this.cases) {
      if (c.stage >= 2) continue;
      tmp.subVectors(c.root.position, origin);
      const along = tmp.dot(dir);
      if (along < 0 || along > range) continue;
      const off = tmp.addScaledVector(dir, -along).length();
      if (off < 0.6 && along < bestD) { bestD = along; best = id; }
    }
    for (const [id, d] of this.dests) {
      if (d.stage >= 2) continue;
      tmp.subVectors(d.center, origin);
      tmp.y *= 0.5; // be generous vertically: tall things are hit anywhere
      const along = tmp.dot(dir);
      if (along < 0 || along > range + d.radius) continue;
      const off = tmp.addScaledVector(dir, -along).length();
      if (off < Math.max(0.5, d.radius) && along < bestD + d.radius) { bestD = along; best = id; }
    }
    return best;
  }

  position(id: string) { return this.cases.get(id)?.root.position ?? this.dests.get(id)?.center; }
}
