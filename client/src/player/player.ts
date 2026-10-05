import * as THREE from 'three';
import { museum, roomAt, tunables, type Hand } from '@museum/shared';
import type { MeshBVH } from 'three-mesh-bvh';
import { type Actions } from './input';
import { distanceToGeometry, resolveCapsule, type DynamicBox } from './collision';
import { TrackedHand } from './hands';
import { loadPref } from '../core/identity';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const headWorld = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

/**
 * The local player rig (brief §11). `rig` sits at the feet and carries the
 * yaw; in VR the headset moves the camera inside it, on desktop the camera
 * sits at eye height with mouse pitch. Collision is a capsule under the head.
 */
export class Player {
  readonly rig = new THREE.Group();
  readonly hands: Record<Hand, TrackedHand>;
  readonly velocity = new THREE.Vector3();
  private knock = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = true;
  crouching = false;
  /** Seconds of input lock (KO, menu-free teleports). */
  frozen = 0;
  speedMul = 1;
  readonly vignette: THREE.Mesh;
  readonly fade: THREE.Mesh;
  private fadeTarget = 0;
  private knockFade = 0;
  vignetteOn = loadPref('vignette', true);
  smoothTurn = loadPref('smoothTurn', false);
  private lastSafe = new THREE.Vector3();
  dynamicBoxes: DynamicBox[] = [];

  constructor(readonly camera: THREE.PerspectiveCamera, private renderer: THREE.WebGLRenderer, private bvh: MeshBVH) {
    this.rig.name = 'rig';
    this.rig.add(camera);
    camera.position.set(0, tunables.player.eyeHeight, 0);
    this.hands = {
      left: new TrackedHand('left', tunables.player.throwHistoryFrames),
      right: new TrackedHand('right', tunables.player.throwHistoryFrames),
    };

    // Comfort vignette: a ring in front of the eyes whose opacity follows speed.
    const vg = document.createElement('canvas');
    vg.width = vg.height = 256;
    const g = vg.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 50, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vg), transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.vignette.position.z = -0.12;
    this.vignette.renderOrder = 999;
    camera.add(this.vignette);
    // Full fade for KO and for the head poking into walls.
    this.fade = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.fade.renderOrder = 1000;
    camera.add(this.fade);
  }

  get inXR() { return this.renderer.xr.isPresenting; }

  /** Feet position in world space. */
  get feet() { return this.rig.position; }

  /** Head position in world space. */
  headPosition(out: THREE.Vector3) { return this.camera.getWorldPosition(out); }

  teleport(pos: [number, number, number], yaw: number) {
    this.rig.position.set(...pos);
    this.velocity.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.yaw = yaw;
    this.rig.rotation.y = yaw;
    if (this.inXR) {
      // Keep the physical head over the spawn point.
      this.camera.updateMatrixWorld();
      const local = this.camera.position;
      tmpV.set(local.x, 0, local.z).applyAxisAngle(UP, yaw);
      this.rig.position.x -= tmpV.x;
      this.rig.position.z -= tmpV.z;
    }
    this.lastSafe.copy(this.rig.position);
  }

  knockback(vel: [number, number, number]) {
    this.knock.set(vel[0], 0, vel[2]);
    if (this.grounded) this.velocity.y = vel[1];
    this.knockFade = 0.35;
  }

  setFade(target: number) { this.fadeTarget = target; }

  /** Instant black, held briefly, then fade back in (elevator rides). */
  flash(hold = 0.3) {
    (this.fade.material as THREE.MeshBasicMaterial).opacity = 1;
    this.fade.visible = true;
    this.flashHold = hold;
  }
  private flashHold = 0;

  update(dt: number, a: Actions, menuOpen: boolean) {
    const p = tunables.player;
    const xr = this.inXR;

    // Turning.
    if (!xr) {
      this.yaw += a.lookDelta.x;
      this.pitch = THREE.MathUtils.clamp(this.pitch + a.lookDelta.y, -1.45, 1.45);
      this.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
      this.crouching = a.crouch;
      const eye = this.crouching ? 0.95 : p.eyeHeight;
      this.camera.position.y += (eye - this.camera.position.y) * Math.min(1, dt * 12);
    } else if (this.smoothTurn) {
      this.turnAroundHead(-a.turn * THREE.MathUtils.degToRad(p.smoothTurnDegPerSec) * dt);
    } else if (a.snapTurn) {
      this.turnAroundHead(-a.snapTurn * THREE.MathUtils.degToRad(p.snapTurnDeg));
    }
    this.rig.rotation.y = this.yaw;

    // Movement relative to where the head looks (head-relative, brief §11.2).
    const move = this.frozen > 0 || menuOpen && !xr ? 0 : 1;
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.crossVectors(fwd, UP).normalize();
    const speed = (a.sprint ? p.sprintSpeed : p.walkSpeed) * this.speedMul * (this.crouching ? 0.5 : 1);
    tmpV.set(0, 0, 0).addScaledVector(fwd, a.move.y * speed * move).addScaledVector(right, a.move.x * speed * move);
    this.velocity.x = tmpV.x + this.knock.x;
    this.velocity.z = tmpV.z + this.knock.z;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
    this.velocity.y = this.grounded ? Math.max(this.velocity.y, -1) - p.gravity * dt : this.velocity.y - p.gravity * dt;
    this.rig.position.addScaledVector(this.velocity, dt);
    this.frozen = Math.max(0, this.frozen - dt);
    this.knockFade = Math.max(0, this.knockFade - dt);

    // Collide a capsule under the head. In VR the head can be off-centre in the rig.
    this.headPosition(headWorld);
    const offX = headWorld.x - this.rig.position.x, offZ = headWorld.z - this.rig.position.z;
    tmpV2.set(headWorld.x, this.rig.position.y, headWorld.z);
    const headHeight = xr ? Math.max(0.9, this.camera.position.y + 0.1) : this.camera.position.y + 0.12;
    const { grounded } = resolveCapsule(this.bvh, tmpV2, p.radius, headHeight, this.dynamicBoxes);
    this.rig.position.set(tmpV2.x - offX, tmpV2.y, tmpV2.z - offZ);
    this.grounded = grounded;
    if (grounded) this.velocity.y = Math.max(0, this.velocity.y);

    // Fell out of the world (or a bad teleport): return to the last safe spot.
    if (this.rig.position.y < -20 || !roomAt(museum, headWorld.x, this.rig.position.y + 1, headWorld.z)) {
      if (this.rig.position.y < -20) this.rig.position.copy(this.lastSafe);
    } else if (grounded) this.lastSafe.copy(this.rig.position);

    // Head poking into a wall: fade to black and nudge the rig back (VR only; desktop can't).
    let headFade = 0;
    if (xr) {
      this.headPosition(headWorld);
      const d = distanceToGeometry(this.bvh, headWorld, 0.3);
      if (d < 0.12) headFade = THREE.MathUtils.clamp((0.12 - d) / 0.08, 0, 1);
    }

    // Comfort vignette scales with artificial motion.
    const moving = Math.hypot(this.velocity.x, this.velocity.z) / p.sprintSpeed;
    const vTarget = (this.vignetteOn ? Math.min(1, moving * 1.3) * p.vignetteStrength : 0) + this.knockFade;
    const vm = this.vignette.material as THREE.MeshBasicMaterial;
    vm.opacity += (vTarget - vm.opacity) * Math.min(1, dt * 8);
    const fm = this.fade.material as THREE.MeshBasicMaterial;
    this.flashHold = Math.max(0, this.flashHold - dt);
    const fTarget = Math.max(this.fadeTarget, headFade, this.flashHold > 0 ? 1 : 0);
    fm.opacity += (fTarget - fm.opacity) * Math.min(1, dt * 6);
    this.fade.visible = fm.opacity > 0.01;
    this.vignette.visible = vm.opacity > 0.01;
  }

  /** Rotate the rig about the head rather than the rig origin (no sideways lurch in VR). */
  private turnAroundHead(angle: number) {
    this.headPosition(headWorld);
    this.yaw += angle;
    tmpV.subVectors(this.rig.position, headWorld).applyAxisAngle(UP, angle);
    this.rig.position.set(headWorld.x + tmpV.x, this.rig.position.y, headWorld.z + tmpV.z);
  }

  /** Recenter (personal menu): face the current head direction forward. */
  recenter() {
    if (!this.inXR) { this.pitch = 0; return; }
    this.camera.getWorldDirection(fwd);
    const headYaw = Math.atan2(-fwd.x, -fwd.z);
    this.turnAroundHead(this.yaw - headYaw);
  }
}
