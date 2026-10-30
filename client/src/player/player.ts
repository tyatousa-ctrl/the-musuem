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
  /** Jumping, climbing and pulling up onto ledges. */
  private coyote = 0;
  private climbAnchors: Partial<Record<Hand, THREE.Vector3>> = {};
  private mantle: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  /** True while climbing a wall on desktop (Space held against a wall). */
  desktopClimbing = false;

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

  // ─── Climbing (VR: grip any surface and pull; desktop: hold Space at a wall) ──
  /** VR: try to grip the wall, rail or ledge at this hand. Returns true if there was something to hold. */
  tryGripSurface(h: Hand): boolean {
    const at = this.hands[h].glove.getWorldPosition(new THREE.Vector3());
    if (distanceToGeometry(this.bvh, at, 0.3) > tunables.player.climbReach) return false;
    this.climbAnchors[h] = at;
    return true;
  }

  releaseGrip(h: Hand) { delete this.climbAnchors[h]; }

  get climbing() { return Object.keys(this.climbAnchors).length > 0 || this.desktopClimbing; }

  get mantling() { return !!this.mantle; }

  private ray = new THREE.Ray();

  /** First solid surface along a ray within `far`, or null. */
  private cast(origin: THREE.Vector3, dir: THREE.Vector3, far: number) {
    this.ray.set(origin, dir);
    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide);
    return hit && hit.distance <= far ? hit : null;
  }

  /** A ledge just ahead (top within reach, room to stand on it), as the point to stand on. */
  private ledgeAhead(feet: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null {
    // Look a little way ahead at a few distances (a thin wall's top is just past its face).
    for (const d of [0.5, 0.7, 0.95]) {
      const l = this.ledgeAt(feet, dir, d);
      if (l) return l;
    }
    return null;
  }

  private ledgeAt(feet: THREE.Vector3, dir: THREE.Vector3, ahead: number): THREE.Vector3 | null {
    const p = tunables.player;
    const probe = feet.clone().addScaledVector(dir, ahead);
    probe.y = feet.y + p.mantleMax + 0.3;
    const down = this.cast(probe, new THREE.Vector3(0, -1, 0), p.mantleMax + 0.3);
    if (!down || (down.face && Math.abs(down.face.normal.y) < 0.7)) return null;
    const top = down.point.y;
    if (top - feet.y < 0.4) return null; // a step, not a ledge
    // Headroom on top, and nothing in the way at head height.
    if (this.cast(new THREE.Vector3(probe.x, top + 0.05, probe.z), new THREE.Vector3(0, 1, 0), 1.7)) return null;
    if (this.cast(new THREE.Vector3(feet.x, top + 1.2, feet.z), dir, ahead + 0.1)) return null;
    return new THREE.Vector3(probe.x, top, probe.z);
  }

  /** Is there a wall right in front of the chest (desktop climbing)? */
  private wallAhead(feet: THREE.Vector3, dir: THREE.Vector3): boolean {
    return !!this.cast(new THREE.Vector3(feet.x, feet.y + 1.1, feet.z), dir, 0.7);
  }

  /** Eyes closed: instantly and completely black (no peeking while it fades). */
  blackout = false;

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

    // Pulling up onto a ledge: a short scripted arc (up first, then over), no collision.
    if (this.mantle) {
      this.mantle.t = Math.min(1, this.mantle.t + dt / p.mantleSec);
      const t = this.mantle.t, up = Math.min(1, t * 1.6), over = Math.max(0, (t - 0.35) / 0.65);
      this.rig.position.set(
        this.mantle.from.x + (this.mantle.to.x - this.mantle.from.x) * over,
        this.mantle.from.y + (this.mantle.to.y - this.mantle.from.y) * up,
        this.mantle.from.z + (this.mantle.to.z - this.mantle.from.z) * over);
      this.velocity.set(0, 0, 0);
      if (t >= 1) { this.mantle = null; this.grounded = true; this.lastSafe.copy(this.rig.position); }
      if (!xr) { this.yaw += a.lookDelta.x; this.pitch = THREE.MathUtils.clamp(this.pitch + a.lookDelta.y, -1.45, 1.45); this.camera.rotation.set(this.pitch, 0, 0, 'YXZ'); }
      this.rig.rotation.y = this.yaw;
      return;
    }

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

    // Jump (with a moment's grace after walking off an edge).
    this.coyote = this.grounded ? p.coyoteSec : Math.max(0, this.coyote - dt);
    if (a.jumpPressed && this.coyote > 0 && move && !this.climbing) { this.velocity.y = p.jumpSpeed; this.coyote = 0; this.grounded = false; }

    // Climbing. VR: each gripping hand stays put on the wall and the body follows it.
    // Desktop: hold Space facing a wall to climb straight up it.
    this.desktopClimbing = !xr && move > 0 && a.jumpHeld && !this.grounded && this.wallAhead(this.rig.position, fwd);
    const anchors = Object.entries(this.climbAnchors) as [Hand, THREE.Vector3][];
    if (anchors.length) {
      const pull = new THREE.Vector3();
      for (const [h, anchor] of anchors) pull.add(anchor.clone().sub(this.hands[h].glove.getWorldPosition(tmpV2)));
      pull.divideScalar(anchors.length).clampLength(0, 0.3);
      this.velocity.set(0, 0, 0);
      this.rig.position.add(pull);
    } else if (this.desktopClimbing) {
      this.velocity.set(0, p.climbSpeed, 0);
      this.rig.position.addScaledVector(this.velocity, dt);
    } else this.rig.position.addScaledVector(this.velocity, dt);

    // Reaching the top of something while jumping or climbing: pull up onto it.
    if ((!this.grounded || this.climbing) && (a.move.y > 0.3 || this.climbing) && move) {
      const ledge = this.ledgeAhead(this.rig.position, fwd);
      if (ledge) {
        this.headPosition(headWorld);
        const off = new THREE.Vector3(headWorld.x - this.rig.position.x, 0, headWorld.z - this.rig.position.z);
        this.mantle = { from: this.rig.position.clone(), to: ledge.sub(off), t: 0 };
        this.climbAnchors = {};
        return;
      }
    }
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
    const fTarget = Math.max(this.fadeTarget, headFade, this.flashHold > 0 || this.blackout ? 1 : 0);
    fm.opacity = this.blackout ? 1 : fm.opacity + (fTarget - fm.opacity) * Math.min(1, dt * 6);
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
