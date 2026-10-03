import * as THREE from 'three';
import type { Hand } from '@museum/shared';

/** Simple stylised glove with open / grip / point poses (brief §11.3). ~300 triangles. */
export class Glove extends THREE.Group {
  private fingers: THREE.Mesh[] = [];
  private thumb: THREE.Mesh;
  private curl = 0;
  private targetCurl = 0;
  private point = false;
  readonly material: THREE.MeshLambertMaterial;

  constructor(readonly hand: Hand, color = 0xf2efe8) {
    super();
    this.material = new THREE.MeshLambertMaterial({ color });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 0.09), this.material);
    palm.position.set(0, 0, 0.01);
    this.add(palm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.06, 8), this.material);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, 0, 0.08);
    this.add(cuff);
    const fg = new THREE.CapsuleGeometry(0.009, 0.05, 2, 6);
    fg.translate(0, 0.034, 0);
    fg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fg, this.material);
      f.position.set(-0.027 + i * 0.018, 0, -0.035);
      this.add(f);
      this.fingers.push(f);
    }
    this.thumb = new THREE.Mesh(fg, this.material);
    this.thumb.position.set(hand === 'right' ? -0.04 : 0.04, 0, 0.005);
    this.thumb.rotation.y = hand === 'right' ? 0.8 : -0.8;
    this.add(this.thumb);
  }

  setPose(grip: number, pointing: boolean) { this.targetCurl = grip; this.point = pointing; }

  update(dt: number) {
    this.curl += (this.targetCurl - this.curl) * Math.min(1, dt * 18);
    this.fingers.forEach((f, i) => { f.rotation.x = -(this.point && i === 0 ? 0.05 : this.curl * 1.5); });
    this.thumb.rotation.x = -this.curl * 0.8;
  }
}

/** World-space hand tracking with a short velocity history for throws and hits. */
export class TrackedHand {
  readonly glove: Glove;
  /** Grip-space object (VR) or camera-relative mount (desktop). */
  readonly anchor = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  private history: { p: THREE.Vector3; t: number }[] = [];
  private head = 0;
  heldId = '';
  heldPredictedAt = 0;

  constructor(readonly hand: Hand, frames: number) {
    this.glove = new Glove(hand);
    this.anchor.add(this.glove);
    for (let i = 0; i < frames; i++) this.history.push({ p: new THREE.Vector3(), t: 0 });
  }

  sample(t: number) {
    this.glove.getWorldPosition(this.pos);
    this.glove.getWorldQuaternion(this.quat);
    const slot = this.history[this.head];
    slot.p.copy(this.pos);
    slot.t = t;
    this.head = (this.head + 1) % this.history.length;
    const oldest = this.history[this.head];
    const dt = t - oldest.t;
    if (oldest.t > 0 && dt > 1e-3) this.velocity.subVectors(this.pos, oldest.p).divideScalar(dt);
  }

  speed() { return this.velocity.length(); }
}
