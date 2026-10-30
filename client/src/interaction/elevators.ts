import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tunables, type Elevator, type MuseumMap } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import type { DynamicBox } from '../player/collision';

const CAB_HALF = 1.4;

export interface ElevatorButton {
  /** 'car': a floor button inside the cab; 'call': the call button by the door on a floor. */
  kind: 'car' | 'call';
  elevator: string;
  floor: number;
  pos: THREE.Vector3;
  mesh: THREE.Mesh;
  pressedAt: number;
}

interface StopDoors { e: Elevator; floor: number; y: number; left: THREE.Mesh; right: THREE.Mesh; open: number; box: DynamicBox; side: THREE.Vector3; travel: number; wasOpening: boolean }

/** A canvas label texture for a button face or plate. */
function labelTex(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = fg; g.font = 'bold 72px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // The cylinder's cap is mapped a quarter-turn round from upright.
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2;
  return t;
}

/**
 * Elevators on the client: sliding doors on every floor (open only where the
 * cab is), pushable floor buttons inside each cab and a call button on the
 * door pillar on each floor. Push a button with your fingertip in VR, or look
 * at it and press E (or click) on desktop. The server runs the cab.
 */
export class Elevators {
  readonly group = new THREE.Group();
  readonly boxes: DynamicBox[] = [];
  readonly buttons: ElevatorButton[] = [];
  private doors: StopDoors[] = [];
  private litMat = new Map<string, THREE.MeshBasicMaterial>();

  constructor(map: MuseumMap) {
    this.group.name = 'elevators';
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xb8a27a });
    const plateMat = new THREE.MeshLambertMaterial({ color: 0xc9a24f });
    /** All the brass button plates, merged into one mesh after the loop. */
    const plates: THREE.BufferGeometry[] = [];
    for (const e of map.elevators) {
      const f = facingVec(e.facing), s = new THREE.Vector3(-f.z, 0, f.x); // s: along the doorway
      const inner = CAB_HALF - 0.25; // half-width of the doorway inside the brass frame
      for (const stop of e.stops) {
        const base = new THREE.Vector3(e.x, stop.y, e.z);
        // Two sliding door leaves in the doorway.
        const leafGeo = new THREE.BoxGeometry(inner, 2.6, 0.05);
        const mk = (dir: number) => {
          const m = new THREE.Mesh(leafGeo, doorMat);
          m.position.copy(base).addScaledVector(f, CAB_HALF - 0.02).addScaledVector(s, dir * inner / 2).setY(stop.y + 1.3);
          m.lookAt(m.position.clone().add(f));
          this.group.add(m);
          return m;
        };
        const left = mk(-1), right = mk(1);
        const c = base.clone().addScaledVector(f, CAB_HALF);
        const half = new THREE.Vector3().addScaledVector(s, inner).add(new THREE.Vector3().addScaledVector(f, 0.08));
        const box: DynamicBox = { box: new THREE.Box3(
          new THREE.Vector3(c.x - Math.abs(half.x), stop.y, c.z - Math.abs(half.z)),
          new THREE.Vector3(c.x + Math.abs(half.x), stop.y + 2.6, c.z + Math.abs(half.z))), active: false };
        this.boxes.push(box);
        this.doors.push({ e, floor: stop.floor, y: stop.y, left, right, open: 1, box, side: s, travel: inner, wasOpening: false });

        // Inside: a brass plate on the side wall by the door with a button per floor, facing into the cab.
        const plateCenter = base.clone().addScaledVector(s, -(CAB_HALF - 0.14)).addScaledVector(f, CAB_HALF - 0.6).setY(stop.y + 1.25);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12 + e.stops.length * 0.13, 0.02), plateMat);
        plate.position.copy(plateCenter);
        plate.lookAt(plateCenter.clone().add(s));
        plate.updateMatrixWorld(true);
        plates.push(plate.geometry.clone().applyMatrix4(plate.matrixWorld));
        e.stops.forEach((target, i) => {
          const pos = plateCenter.clone().addScaledVector(s, 0.025).setY(stop.y + 1.25 + (i - (e.stops.length - 1) / 2) * 0.13);
          this.addButton('car', e.id, target.floor, target.label, pos, s);
        });
        // Outside: the call button on the door pillar, facing out.
        const callPos = base.clone().addScaledVector(f, CAB_HALF + 0.11).addScaledVector(s, -(CAB_HALF - 0.125)).setY(stop.y + 1.2);
        const callPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), plateMat);
        callPlate.position.copy(callPos).addScaledVector(f, -0.015);
        callPlate.lookAt(callPlate.position.clone().add(f));
        callPlate.updateMatrixWorld(true);
        plates.push(callPlate.geometry.clone().applyMatrix4(callPlate.matrixWorld));
        const other = e.stops.find((x) => x.floor !== stop.floor);
        this.addButton('call', e.id, stop.floor, other && other.y > stop.y ? '▲' : '▼', callPos, f);
      }
    }
    const plateMesh = new THREE.Mesh(mergeGeometries(plates.map((g) => g.index ? g.toNonIndexed() : g))!, plateMat);
    plateMesh.name = 'elevatorPlates';
    this.group.add(plateMesh);
    // The door leaves: one instanced draw for all of them (the Mesh objects stay as handy transforms).
    const leafGeo = (this.doors[0]?.left.geometry as THREE.BufferGeometry) ?? new THREE.BoxGeometry(1, 2.6, 0.05);
    this.leaves = new THREE.InstancedMesh(leafGeo, doorMat, this.doors.length * 2);
    this.leaves.frustumCulled = false;
    this.group.add(this.leaves);
    for (const d of this.doors) { d.left.removeFromParent(); d.right.removeFromParent(); }
  }

  /** Door leaves are drawn as one instanced batch (they're all the same shape). */
  private leaves!: THREE.InstancedMesh;

  private addButton(kind: 'car' | 'call', elevator: string, floor: number, label: string, pos: THREE.Vector3, normal: THREE.Vector3) {
    const tex = labelTex(label, '#2a2118', '#f3dc9a');
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 20).rotateX(Math.PI / 2), mat);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(normal));
    this.group.add(mesh);
    const key = `${kind}:${elevator}:${floor}:${label}`;
    this.litMat.set(key, new THREE.MeshBasicMaterial({ map: labelTex(label, '#ffd56b', '#2a2118') }));
    mesh.userData = { key, normal: normal.clone(), base: pos.clone(), unlit: mat };
    this.buttons.push({ kind, elevator, floor, pos: pos.clone(), mesh, pressedAt: 0 });
  }

  /** A button within `r` of a point (a fingertip in VR). */
  hitTest(p: THREE.Vector3, r = 0.06): ElevatorButton | null {
    let best: ElevatorButton | null = null, bd = r;
    for (const b of this.buttons) { const d = b.pos.distanceTo(p); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  /** The button you're looking at (desktop), within `range`. */
  inFront(origin: THREE.Vector3, dir: THREE.Vector3, range = 2.4): ElevatorButton | null {
    let best: ElevatorButton | null = null, bd = range;
    const v = new THREE.Vector3();
    for (const b of this.buttons) {
      v.subVectors(b.pos, origin);
      const along = v.dot(dir);
      if (along < 0 || along > bd) continue;
      if (v.addScaledVector(dir, -along).length() < 0.12) { bd = along; best = b; }
    }
    return best;
  }

  pressed(b: ElevatorButton) { b.pressedAt = performance.now(); }

  /** Is a point standing in a cab, and at which of its floors? (desktop E fallback, offline rides) */
  static cabAt(map: MuseumMap, feet: THREE.Vector3): { e: Elevator; floor: number } | null {
    const h = tunables.elevator.insideHalf;
    for (const e of map.elevators) {
      if (Math.abs(feet.x - e.x) > h || Math.abs(feet.z - e.z) > h) continue;
      const stop = e.stops.find((s) => Math.abs(feet.y - s.y) < 1.2);
      if (stop) return { e, floor: stop.floor };
    }
    return null;
  }

  /** Animate doors and buttons from the synced cab states. Returns stops whose doors just began opening (for the ding). */
  update(state: NetState | undefined, dt: number, viewer: THREE.Vector3): THREE.Vector3[] {
    const dings: THREE.Vector3[] = [];
    const rate = dt / tunables.elevator.doorSec;
    for (const d of this.doors) {
      const s = state?.elevators?.get(d.e.id);
      // Offline (no server): doors stay open.
      const here = !s || s.floor === d.floor;
      const opening = !s || (here && (s.state === 'open' || s.state === 'opening'));
      if (s && here && s.state === 'opening' && !d.wasOpening) dings.push(new THREE.Vector3(d.e.x, d.y + 2, d.e.z));
      d.wasOpening = !!s && here && s.state === 'opening';
      d.open = THREE.MathUtils.clamp(d.open + (opening ? rate : -rate), 0, 1);
      // Each leaf folds back into its brass pillar (it never sticks out past the cab).
      const width = d.travel * (1 - 0.92 * d.open);
      const near = viewer.distanceTo(d.left.position) < 40;
      for (const [leaf, dir] of [[d.left, -1], [d.right, 1]] as const) {
        leaf.scale.x = width / d.travel;
        leaf.position.set(d.e.x, d.y + 1.3, d.e.z).addScaledVector(facingVec(d.e.facing), CAB_HALF - 0.02)
          .addScaledVector(d.side, dir * (d.travel - width / 2));
        leaf.visible = near && width > 0.02;
      }
      d.box.active = d.open < 0.6;
    }
    let n = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const d of this.doors) for (const leaf of [d.left, d.right]) {
      leaf.updateMatrix();
      this.leaves.setMatrixAt(n++, leaf.visible ? leaf.matrix : zero);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    // Buttons light while their floor is on the way, and dip briefly when pushed.
    const now = performance.now();
    for (const b of this.buttons) {
      const s = state?.elevators?.get(b.elevator);
      const lit = !!s && s.dest === b.floor && s.state !== 'open' || now - b.pressedAt < 500;
      const ud = b.mesh.userData as { key: string; normal: THREE.Vector3; base: THREE.Vector3; unlit: THREE.Material };
      b.mesh.material = lit ? this.litMat.get(ud.key)! : ud.unlit;
      b.mesh.position.copy(ud.base).addScaledVector(ud.normal, now - b.pressedAt < 200 ? -0.008 : 0);
      // Buttons are small: only drawn when you're close enough to read and press them.
      b.mesh.visible = viewer.distanceTo(b.pos) < 4.5;
    }
    return dings;
  }
}

function facingVec(f: Elevator['facing']): THREE.Vector3 {
  return f === '+x' ? new THREE.Vector3(1, 0, 0) : f === '-x' ? new THREE.Vector3(-1, 0, 0) : f === '+z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
}
