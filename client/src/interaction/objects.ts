import * as THREE from 'three';
import type { Hand } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import type { Avatars } from '../multiplayer/avatars';
import type { TrackedHand } from '../player/hands';

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
      if (mine && hand) {
        hands[hand].glove.getWorldPosition(tmp);
        e.obj.position.copy(tmp);
      } else if (o.status === 'carried' && o.holder) {
        const av = avatars.get(o.holder);
        if (av) (o.hand === 'left' ? av.left : av.right).getWorldPosition(e.obj.position);
      } else {
        // Smoothly chase the server position.
        tmp.set(o.x, o.y, o.z);
        if (e.obj.position.distanceTo(tmp) > 3) e.obj.position.copy(tmp);
        else e.obj.position.lerp(tmp, Math.min(1, dt * 15));
      }
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

/** Display cases that crack and shatter (brief §20): stage meshes swap; shards are pooled. */
export class Breakables {
  readonly group = new THREE.Group();
  private cases = new Map<string, { root: THREE.Group; glass: THREE.Mesh; cracks: THREE.Mesh; stage: number }>();
  private shards: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
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
      this.shards.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  }

  update(state: NetState, dt: number) {
    const seen = new Set<string>();
    state?.breakables?.forEach((b: NetState, id: string) => {
      seen.add(id);
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
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 9.8 * dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.v.set(0, 0, 0); }
      s.m.rotation.x += dt * 5;
      s.m.visible = s.life > 0;
    }
  }

  private burst(at: THREE.Vector3) {
    let n = 0;
    for (const s of this.shards) {
      if (s.life > 0 || n++ > 30) continue;
      s.m.position.set(at.x + (Math.random() - 0.5) * 0.7, at.y + (Math.random() - 0.5) * 0.8, at.z + (Math.random() - 0.5) * 0.7);
      s.v.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      s.life = 2.5 + Math.random();
      s.m.visible = true;
    }
  }

  /** Breakable whose glass volume contains (or nearly contains) a point. */
  hitTest(p: THREE.Vector3, pad = 0.12): string | null {
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
    return best;
  }

  position(id: string) { return this.cases.get(id)?.root.position; }
}
