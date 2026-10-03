import * as THREE from 'three';
import { tunables } from '@museum/shared';
import { Glove } from '../player/hands';
import type { NetState } from './net';

export const TEAM_COLORS: Record<string, number> = { '': 0x8a7f72, A: 0xe0b84a, B: 0x3fae86 };

interface Sample { t: number; v: Float32Array }

/** One remote player: head with visor, inferred torso, gloves, name tag, KO stars. Under 3k tris. */
class Avatar {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  readonly torso: THREE.Mesh;
  readonly left = new Glove('left');
  readonly right = new Glove('right');
  private stars = new THREE.Group();
  private tag: THREE.Sprite;
  private tagCanvas = document.createElement('canvas');
  private menuIcon: THREE.Sprite;
  private shadow: THREE.Mesh;
  private samples: Sample[] = [];
  private torsoMat: THREE.MeshLambertMaterial;
  private name = '';
  private team = '-';
  readonly current = new Float32Array(21);
  feetY = 0;

  constructor(shadowTex: THREE.Texture) {
    const skin = new THREE.MeshLambertMaterial({ color: 0xf1e6d6 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), skin);
    skull.scale.set(1, 1.1, 1.05);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), new THREE.MeshLambertMaterial({ color: 0x1d2228 }));
    visor.position.set(0, 0.015, -0.11);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 6), skin);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.03, -0.13);
    this.head.add(skull, visor, nose);
    this.torsoMat = new THREE.MeshLambertMaterial({ color: TEAM_COLORS[''] });
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 4, 10), this.torsoMat);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(this.tagCanvas), depthTest: true, transparent: true }));
    this.tag.scale.set(0.8, 0.2, 1);
    this.tagCanvas.width = 256; this.tagCanvas.height = 64;
    const starGeo = new THREE.OctahedronGeometry(0.04, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(starGeo, starMat); s.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.2, 0, Math.sin((i / 5) * Math.PI * 2) * 0.2); this.stars.add(s); }
    this.stars.position.y = 0.2;
    this.stars.visible = false;
    this.head.add(this.stars);
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = iconCanvas.height = 64;
    const g = iconCanvas.getContext('2d')!;
    g.fillStyle = '#f3ead9'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1610'; for (let i = 0; i < 3; i++) g.fillRect(16, 18 + i * 11, 32, 6);
    this.menuIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(iconCanvas) }));
    this.menuIcon.scale.set(0.16, 0.16, 1);
    this.menuIcon.visible = false;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.45 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.head, this.torso, this.left, this.right, this.tag, this.menuIcon, this.shadow);
  }

  push(t: number, p: NetState) {
    const v = new Float32Array(21);
    const set = (o: number, q: NetState) => { v[o] = q.px; v[o + 1] = q.py; v[o + 2] = q.pz; v[o + 3] = q.qx; v[o + 4] = q.qy; v[o + 5] = q.qz; v[o + 6] = q.qw; };
    set(0, p.head); set(7, p.left); set(14, p.right);
    const last = this.samples[this.samples.length - 1];
    if (last && last.v.every((x, i) => x === v[i])) return;
    this.samples.push({ t, v });
    if (this.samples.length > 12) this.samples.shift();
  }

  update(now: number, p: NetState, dt: number) {
    if (p.name !== this.name || p.team !== this.team) this.drawTag(p.name, p.team);
    this.feetY = p.feetY;
    // Interpolate ~100 ms in the past between buffered samples.
    const t = now - tunables.net.interpolationDelayMs;
    let a = this.samples[0], b = this.samples[0];
    for (let i = 0; i < this.samples.length - 1; i++) if (this.samples[i].t <= t && this.samples[i + 1].t >= t) { a = this.samples[i]; b = this.samples[i + 1]; break; }
    if (this.samples.length && t > this.samples[this.samples.length - 1].t) a = b = this.samples[this.samples.length - 1];
    if (!a) return;
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    for (let i = 0; i < 21; i++) this.current[i] = a.v[i] + (b.v[i] - a.v[i]) * k;
    const q = new THREE.Quaternion();
    const apply = (obj: THREE.Object3D, o: number) => {
      obj.position.set(this.current[o], this.current[o + 1], this.current[o + 2]);
      q.set(this.current[o + 3], this.current[o + 4], this.current[o + 5], this.current[o + 6]).normalize();
      obj.quaternion.copy(q);
    };
    apply(this.head, 0); apply(this.left, 7); apply(this.right, 14);
    // Torso hangs below the head, yawed with it.
    const e = new THREE.Euler().setFromQuaternion(this.head.quaternion, 'YXZ');
    this.torso.position.set(this.head.position.x, this.head.position.y - 0.55, this.head.position.z);
    this.torso.rotation.set(0, e.y, 0);
    this.tag.position.set(this.head.position.x, this.head.position.y + 0.38, this.head.position.z);
    this.menuIcon.position.set(this.head.position.x, this.head.position.y + 0.58, this.head.position.z);
    this.menuIcon.visible = !!p.menuOpen;
    this.shadow.position.set(this.head.position.x, p.feetY + 0.02, this.head.position.z);
    this.stars.visible = p.status === 'ko' || p.daze > 0.6;
    this.stars.rotation.y += dt * 4;
    this.torsoMat.color.setHex(TEAM_COLORS[p.team] ?? TEAM_COLORS['']);
    const ghost = p.status === 'reconnecting' || p.status === 'spectating';
    this.group.visible = p.status !== 'spectating';
    this.torsoMat.transparent = ghost;
    this.torsoMat.opacity = ghost ? 0.4 : 1;
    this.left.setPose(p.heldLeft ? 1 : 0.2, false);
    this.right.setPose(p.heldRight ? 1 : 0.2, false);
    this.left.update(dt); this.right.update(dt);
    this.left.material.color.setHex(p.team ? TEAM_COLORS[p.team] : 0xf2efe8);
    this.right.material.color.setHex(p.team ? TEAM_COLORS[p.team] : 0xf2efe8);
  }

  private drawTag(name: string, team: string) {
    this.name = name; this.team = team;
    const g = this.tagCanvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(20,16,12,0.7)';
    g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
    g.fillStyle = team === 'A' ? '#f2cf6a' : team === 'B' ? '#6fe0b4' : '#f3ead9';
    g.font = 'bold 28px Georgia, serif'; g.textAlign = 'center';
    g.fillText(name.slice(0, 16), 128, 42);
    (this.tag.material.map as THREE.Texture).needsUpdate = true;
  }

  dispose() { this.group.removeFromParent(); }
}

/** All remote avatars, driven by synced state. */
export class Avatars {
  readonly group = new THREE.Group();
  private map = new Map<string, Avatar>();
  private shadowTex: THREE.Texture;

  constructor(shadowTex: THREE.Texture) { this.shadowTex = shadowTex; this.group.name = 'avatars'; }

  update(state: NetState, myId: string, dt: number) {
    if (!state?.players) return;
    const now = performance.now();
    const seen = new Set<string>();
    state.players.forEach((p: NetState, id: string) => {
      if (id === myId) return;
      seen.add(id);
      let a = this.map.get(id);
      if (!a) { a = new Avatar(this.shadowTex); this.map.set(id, a); this.group.add(a.group); }
      a.push(now, p);
      a.update(now, p, dt);
    });
    for (const [id, a] of this.map) if (!seen.has(id)) { a.dispose(); this.map.delete(id); }
  }

  /** Interpolated head/hand positions of a remote player, for hit tests and held objects. */
  get(id: string) { return this.map.get(id); }
  get count() { return this.map.size; }
  entries() { return this.map.entries(); }
}
