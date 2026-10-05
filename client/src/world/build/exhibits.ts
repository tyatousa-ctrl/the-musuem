import * as THREE from 'three';
import type { Block } from '@museum/shared';
import type { Sink } from '../sink';
import { column, flowers, mergeParts, vitrine } from '../kit/kit';
import { seeded } from '../textures';
import { assets } from '../../core/assets';

/** Exhibits whose manifest entry has a real model: placed after the build (brief §8.1). */
export const pendingModels: { id: string; room: string; matrix: THREE.Matrix4 }[] = [];

const M = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

// ─── Skeletons (procedural; replace with Smithsonian CC0 scans via the manifest) ──
function bone(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}
function knob(p: THREE.Vector3, r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.translate(p.x, p.y, p.z);
  return g;
}

/** A mounted skeleton facing +x, standing on y = 0, centred near the origin. */
export function skeleton(kind: 'rex' | 'sauropod' | 'trike'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const s = kind === 'sauropod' ? 1.35 : kind === 'rex' ? 1 : 0.8;
  // Spine curve: tail tip → hips → shoulders → neck → skull.
  const spinePts = kind === 'sauropod'
    ? [V(-9, 1.2), V(-5, 3.0), V(-1.5, 4.2), V(1.5, 4.4), V(4, 5.6), V(5.8, 7.4), V(7.2, 8.4)]
    : kind === 'rex'
      ? [V(-6.5, 1.0), V(-3.5, 2.6), V(-0.5, 3.6), V(2, 3.9), V(3.5, 4.5), V(4.4, 4.6)]
      : [V(-4, 0.8), V(-2, 1.8), V(0, 2.3), V(2, 2.2), V(3, 1.9)];
  const spine = new THREE.CatmullRomCurve3(spinePts.map((p) => p.multiplyScalar(s)));
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = spine.getPoint(i / n), b = spine.getPoint((i + 0.8) / n);
    const t = i / n;
    const r = (kind === 'sauropod' ? 0.26 : 0.2) * s * (0.45 + Math.sin(Math.PI * Math.min(1, t * 1.3)) * 0.75);
    parts.push(bone(a, b, r, r * 0.9));
    // Neural spines.
    if (t > 0.2 && t < 0.8) parts.push(bone(a, a.clone().add(V(0, 0.35 * s, 0)), r * 0.35, r * 0.15));
  }
  // Ribcage: loops hanging off the dorsal spine between hips and shoulders.
  const ribFrom = kind === 'sauropod' ? 0.36 : 0.42, ribTo = kind === 'sauropod' ? 0.6 : 0.72;
  for (let i = 0; i < 11; i++) {
    const t = ribFrom + (i / 10) * (ribTo - ribFrom);
    const top = spine.getPoint(t);
    const depth = (kind === 'sauropod' ? 2.2 : kind === 'rex' ? 1.5 : 1.0) * s * Math.sin(Math.PI * (i + 1) / 12);
    const width = depth * 0.62;
    for (const side of [-1, 1]) {
      let prev = top.clone();
      for (let k = 1; k <= 5; k++) {
        const a = (k / 5) * Math.PI * 0.95;
        const p = top.clone().add(V(-0.1 * k * s, -Math.sin(a / 2) * depth, side * Math.sin(a) * width));
        parts.push(bone(prev, p, 0.05 * s, 0.04 * s));
        prev = p;
      }
    }
  }
  // Legs as tapered capsules.
  const hip = spine.getPoint(kind === 'sauropod' ? 0.33 : 0.38);
  const shoulder = spine.getPoint(kind === 'sauropod' ? 0.56 : 0.72);
  const leg = (root: THREE.Vector3, len: number, thick: number, fwd: number, side: number) => {
    const r = root.clone().add(V(0, -0.2, side * thick * 3));
    const knee = r.clone().add(V(fwd * 0.6 * s, -len * 0.5, side * 0.05));
    const foot = V(r.x + fwd * 0.2 * s, 0.1, r.z);
    parts.push(bone(r, knee, thick, thick * 0.8), bone(knee, foot, thick * 0.8, thick * 0.6), knob(knee, thick * 1.1));
    const toe = new THREE.BoxGeometry(0.9 * s * thick * 4, 0.12, thick * 3);
    toe.translate(foot.x + 0.3 * s, 0.06, foot.z);
    parts.push(toe);
  };
  for (const side of [-1, 1]) {
    leg(hip, hip.y, (kind === 'sauropod' ? 0.32 : 0.24) * s, 0.4, side);
    if (kind !== 'rex') leg(shoulder, shoulder.y, (kind === 'sauropod' ? 0.3 : 0.18) * s, -0.2, side);
    else {
      // Tiny arms.
      const a0 = shoulder.clone().add(V(0.3, -0.5, side * 0.35));
      parts.push(bone(a0, a0.clone().add(V(0.5, -0.4, 0)), 0.05, 0.04));
    }
  }
  // Pelvis and skull.
  parts.push(knob(hip.clone().add(V(0, -0.25 * s, 0)), 0.38 * s));
  const head = spine.getPoint(1);
  if (kind === 'rex') {
    const skull = new THREE.BoxGeometry(1.5, 0.75, 0.6);
    skull.translate(head.x + 0.5, head.y, 0);
    const jaw = new THREE.BoxGeometry(1.3, 0.22, 0.5);
    jaw.rotateZ(-0.25);
    jaw.translate(head.x + 0.45, head.y - 0.5, 0);
    parts.push(skull, jaw);
  } else if (kind === 'trike') {
    const skull = new THREE.BoxGeometry(1.1, 0.7, 0.8);
    skull.translate(head.x + 0.4, head.y, 0);
    const frill = new THREE.CylinderGeometry(0.9, 0.9, 0.12, 12);
    frill.rotateZ(Math.PI / 2 - 0.5);
    frill.translate(head.x - 0.1, head.y + 0.35, 0);
    parts.push(skull, frill);
    for (const [dz, dy] of [[-0.3, 0.3], [0.3, 0.3], [0, -0.1]]) {
      const horn = new THREE.ConeGeometry(0.09, dz === 0 ? 0.35 : 0.9, 6);
      horn.rotateZ(-Math.PI / 2 + 0.4);
      horn.translate(head.x + 0.8, head.y + dy, dz);
      parts.push(horn);
    }
  } else {
    parts.push(knob(head, 0.35));
  }
  // Display armature: vertical steel supports.
  for (const p of [hip, shoulder]) parts.push(bone(V(p.x, 0, 0), V(p.x, p.y - 0.4, 0), 0.04, 0.04));
  return mergeParts(parts);
}

// ─── Exhibit blocks ──────────────────────────────────────────────────────────
export function buildBlock(sink: Sink, b: Block) {
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0, h = b.y1 - b.y0;
  const collide = !b.noCollide;
  const solid = (mat: Parameters<Sink['box']>[0], tint: number) => sink.box(mat, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, { tint, collide });
  const rand = seeded(b.id.length * 131 + Math.round(cx * 7 + cz * 13));

  switch (b.kind) {
    case 'plinth': {
      sink.box('stone', b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, { tint: b.variant === 'relic' ? 0x5e4b3a : 0xd9cfbf, collide });
      // Moulded cap.
      sink.box('stone', b.x0 - 0.06, b.y1 - 0.08, b.z0 - 0.06, b.x1 + 0.06, b.y1, b.z1 + 0.06, { tint: b.variant === 'relic' ? 0x6b5643 : 0xe6dccb });
      if (b.variant === 'rex' || b.variant === 'sauropod' || b.variant === 'trike') {
        const along = d > w; // face along the hall's long axis
        const m = M(cx, b.y1, cz).multiply(new THREE.Matrix4().makeRotationY(along ? (b.variant === 'trike' ? -Math.PI / 2 : Math.PI / 2) : 0));
        const modelId = `model.skeleton.${b.variant}`;
        if (assets.has(modelId)) pendingModels.push({ id: modelId, room: b.room, matrix: m });
        else sink.add('bone', skeleton(b.variant), m, { tint: 0xd8c9a8 });
        // Collide with the legs region only (partial cover).
        sink.collideBox(cx - 0.6, b.y1, cz - (along ? d * 0.3 : 0.6), cx + 0.6, b.y1 + 3, cz + (along ? d * 0.3 : 0.6));
      }
      break;
    }
    case 'bench': {
      sink.box('wood', b.x0, 0.38, b.z0, b.x1, 0.45, b.z1, { tint: 0x9a6b45, collide });
      sink.box('plain', b.x0 + 0.02, 0.45, b.z0 + 0.03, b.x1 - 0.02, 0.5, b.z1 - 0.03, { tint: 0x5b3326 });
      for (const x of [b.x0 + 0.15, b.x1 - 0.23]) sink.box('plain', x, 0, b.z0 + 0.05, x + 0.08, 0.38, b.z1 - 0.05, { tint: 0x2a2622, collide });
      break;
    }
    case 'partition': {
      solid('plaster', b.room.startsWith('gallery') ? 0xe9e1d2 : 0x3a2a24);
      if (b.room === 'cultures') {
        // A wall of masks.
        for (let i = 0; i < 6; i++) {
          const mx = b.x0 + 0.7 + i * ((w - 1.4) / 5);
          const mask = new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI);
          mask.scale(1, 1.4, 0.5);
          mask.translate(mx, 1.6 + (i % 2) * 0.6, b.z1 + 0.02);
          sink.add('plain', mask, undefined, { tint: [0x8a4b2a, 0xc2a26a, 0x3d2a1e, 0xa3392b][i % 4] });
        }
      }
      break;
    }
    case 'mastaba': {
      // Battered walls: stacked, slightly receding courses.
      const courses = 5;
      for (let i = 0; i < courses; i++) {
        const inset = i * 0.06, y0 = b.y0 + (h * i) / courses, y1 = b.y0 + (h * (i + 1)) / courses;
        sink.box('sandstone', b.x0 + inset, y0, b.z0 + inset, b.x1 - inset, y1, b.z1 - inset, { tint: 0xe2c9a1, collide: collide && i === 0 });
      }
      sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      // False door relief panel on the passage face.
      break;
    }
    case 'sarcophagus': {
      sink.box('sandstone', b.x0, b.y0, b.z0, b.x1, b.y1 - 0.2, b.z1, { tint: 0x8a6a46, collide });
      const lid = new THREE.CapsuleGeometry(Math.min(w, d) / 2 - 0.05, Math.max(w, d) - Math.min(w, d), 4, 10);
      lid.rotateZ(w > d ? Math.PI / 2 : 0);
      if (w <= d) lid.rotateX(Math.PI / 2);
      lid.scale(1, 0.35, 1);
      lid.translate(cx, b.y1 - 0.15, cz);
      sink.add('plain', lid, undefined, { tint: 0xb8893c, gain: 1.15 });
      break;
    }
    case 'statue': {
      // Seated colossus: throne, body, head with nemes headdress.
      sink.box('sandstone', b.x0, b.y0, b.z0, b.x1, b.y0 + h * 0.42, b.z1, { tint: 0x9b7a55, collide });
      sink.box('sandstone', b.x0 + w * 0.2, b.y0 + h * 0.42, b.z0 + d * 0.1, b.x1 - w * 0.2, b.y0 + h * 0.78, b.z1 - d * 0.1, { tint: 0xa8875f });
      const head = new THREE.CylinderGeometry(w * 0.18, w * 0.3, h * 0.22, 8);
      head.translate(cx, b.y0 + h * 0.89, cz);
      sink.add('sandstone', head, undefined, { tint: 0xb39066 });
      break;
    }
    case 'obelisk': {
      if (b.variant === 'pole') {
        // Carved pole: stacked painted sections.
        const sections = Math.max(3, Math.round(h / 1.4));
        const cols = [0xa8603c, 0x4d7d8c, 0xd8743f, 0x5a4a40, 0xe7b862];
        for (let i = 0; i < sections; i++) {
          const y0 = b.y0 + (h * i) / sections, y1 = b.y0 + (h * (i + 1)) / sections;
          const g = new THREE.CylinderGeometry(w * 0.5, w * 0.55, y1 - y0, 8);
          g.translate(cx, (y0 + y1) / 2, cz);
          sink.add('plain', g, undefined, { tint: cols[Math.floor(rand() * cols.length)] });
          const beak = new THREE.ConeGeometry(w * 0.18, w * 0.6, 4);
          beak.rotateX(Math.PI / 2);
          beak.translate(cx, (y0 + y1) / 2, cz + w * 0.65);
          sink.add('plain', beak, undefined, { tint: 0x2a2a2a });
        }
        // Wings on top.
        sink.box('plain', cx - w * 1.6, b.y1 - 0.5, cz - 0.08, cx + w * 1.6, b.y1 - 0.25, cz + 0.08, { tint: 0xb8643a });
        sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      } else {
        const g = new THREE.CylinderGeometry(w * 0.35, w * 0.55, h * 0.9, 4, 1);
        g.rotateY(Math.PI / 4);
        g.translate(cx, b.y0 + h * 0.45, cz);
        sink.add('sandstone', g, undefined, { tint: 0xc7a172 });
        const tip = new THREE.ConeGeometry(w * 0.35 * Math.SQRT2 * 0.5 + 0.05, h * 0.1, 4);
        tip.rotateY(Math.PI / 4);
        tip.translate(cx, b.y0 + h * 0.95, cz);
        sink.add('plain', tip, undefined, { tint: 0xd8b25a, gain: 1.2 });
        sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      }
      break;
    }
    case 'diorama': {
      // Recessed box with a painted backdrop and glass front.
      const front = b.x0; // dioramas sit on the east wall, open to the west
      sink.box('plain', b.x0, b.y0, b.z0, b.x1, b.y0 + 0.9, b.z1, { tint: 0x2b2420, collide });
      sink.box('plain', b.x0, b.y1 - 0.4, b.z0, b.x1, b.y1, b.z1, { tint: 0x2b2420 });
      sink.box('emissive', b.x1 - 0.1, b.y0 + 0.9, b.z0 + 0.1, b.x1, b.y1 - 0.4, b.z1 - 0.1, { tint: 0x9ec0d8 });
      sink.box('plain', b.x0 + 0.4, b.y0 + 0.9, b.z0 + 0.2, b.x1 - 0.2, b.y0 + 1.15, b.z1 - 0.2, { tint: 0x7a6a3c });
      for (let i = 0; i < 4; i++) {
        const t = new THREE.ConeGeometry(0.4, 1.4, 5);
        t.translate(b.x0 + 1 + rand() * (w - 2), b.y0 + 1.85, b.z0 + 0.8 + rand() * (d - 1.6));
        sink.add('foliage', t, undefined, { tint: 0x8fae74 });
      }
      const glass = new THREE.PlaneGeometry(d - 0.2, h - 1.3);
      glass.rotateY(-Math.PI / 2);
      glass.translate(front, b.y0 + 0.9 + (h - 1.3) / 2, (b.z0 + b.z1) / 2);
      sink.add('glass', glass, undefined, { tint: 0xd8eef5 });
      sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      break;
    }
    case 'case': {
      const v = vitrine(w, d, 0.9, h - 0.9);
      sink.add('wood', v.plinth, M(cx, b.y0, cz), { tint: 0x3d2c22, collide });
      sink.add('plain', v.frame, M(cx, b.y0, cz), { tint: 0x8a6a3a, gain: 1.3 });
      sink.add('glass', v.glass, M(cx, b.y0, cz), { tint: 0xd8eef5 });
      const obj = new THREE.IcosahedronGeometry(0.3, 0);
      obj.scale(1, 1.6, 1);
      obj.translate(cx, b.y0 + 1.35, cz);
      sink.add('plain', obj, undefined, { tint: [0x8a4b2a, 0xc2a26a, 0x5d7a6a][Math.floor(rand() * 3)], gain: 1.2 });
      sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      break;
    }
    case 'desk': {
      if (b.id === 'infoDesk') {
        const desk = new THREE.CylinderGeometry(w / 2, w / 2, h, 8);
        desk.translate(cx, b.y0 + h / 2, cz);
        sink.add('wood', desk, undefined, { tint: 0x6b4630, collide });
        const top = new THREE.CylinderGeometry(w / 2 + 0.12, w / 2 + 0.12, 0.08, 8);
        top.translate(cx, b.y1 + 0.04, cz);
        sink.add('marble', top, undefined, { tint: 0xf3ece0 });
        const fl = flowers();
        sink.add('plain', fl.urn, M(cx, b.y1, cz).multiply(new THREE.Matrix4().makeScale(0.7, 0.7, 0.7)), { tint: 0xc9b48a });
        sink.add('foliage', fl.leaves, M(cx, b.y1, cz).multiply(new THREE.Matrix4().makeScale(0.7, 0.7, 0.7)), { tint: 0x9ec27e });
        sink.add('plain', fl.blooms, M(cx, b.y1, cz).multiply(new THREE.Matrix4().makeScale(0.7, 0.7, 0.7)), { tint: 0xf2c6d0, gain: 1.2 });
      } else {
        solid('wood', 0x4a3a2c);
        sink.box('emissive', cx - 0.3, b.y1, cz - 0.05, cx + 0.3, b.y1 + 0.4, cz + 0.05, { tint: 0x7fb4d8 });
      }
      break;
    }
    case 'planter': {
      const fl = flowers();
      sink.add('stone', fl.urn, M(cx, b.y0, cz).multiply(new THREE.Matrix4().makeScale(1.3, 1.3, 1.3)), { tint: 0xd8cdb8, collide });
      sink.add('foliage', fl.leaves, M(cx, b.y0, cz).multiply(new THREE.Matrix4().makeScale(1.3, 1.3, 1.3)), { tint: 0xb9d79a });
      sink.add('plain', fl.blooms, M(cx, b.y0, cz).multiply(new THREE.Matrix4().makeScale(1.3, 1.3, 1.3)), { tint: [0xf4b6c2, 0xf7e2a1, 0xffffff][Math.floor(rand() * 3)], gain: 1.25 });
      sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y0 + 1.2, b.z1);
      break;
    }
    case 'temple': {
      if (b.variant === 'gate') {
        // Gateway: two pylons with a lintel and cavetto cornice.
        sink.box('sandstone', b.x0, b.y0, b.z0, b.x0 + 1.1, b.y1, b.z1, { tint: 0xd6b07c, collide });
        sink.box('sandstone', b.x1 - 1.1, b.y0, b.z0, b.x1, b.y1, b.z1, { tint: 0xd6b07c, collide });
        sink.box('sandstone', b.x0 - 0.2, b.y1 - 1.2, b.z0 - 0.15, b.x1 + 0.2, b.y1, b.z1 + 0.15, { tint: 0xe0bc88 });
        sink.box('sandstone', b.x0 - 0.35, b.y1, b.z0 - 0.3, b.x1 + 0.35, b.y1 + 0.35, b.z1 + 0.3, { tint: 0xe9c995 });
      } else {
        // Temple: sanctuary block with a columned front porch facing south.
        sink.box('sandstone', b.x0, b.y0, b.z0, b.x1, b.y1 - 1, b.z1 - 1.5, { tint: 0xd8b27e, collide });
        sink.box('sandstone', b.x0 - 0.3, b.y1 - 1, b.z0 - 0.3, b.x1 + 0.3, b.y1, b.z1 + 0.3, { tint: 0xe4c08c });
        for (let i = 0; i < 4; i++) {
          const x = b.x0 + 1 + i * ((w - 2) / 3);
          sink.add('sandstone', column(h - 1, 0.42, 'doric', 12), M(x, b.y0, b.z1 - 0.6), { tint: 0xdcb684, collide: false });
          sink.collideBox(x - 0.45, b.y0, b.z1 - 1.05, x + 0.45, b.y1, b.z1 - 0.15);
        }
      }
      break;
    }
    case 'pool': {
      // Stone rim and still water.
      const rim = 0.35;
      sink.box('stone', b.x0, b.y0, b.z0, b.x1, b.y1, b.z0 + rim, { tint: 0xd8cfc0, collide });
      sink.box('stone', b.x0, b.y0, b.z1 - rim, b.x1, b.y1, b.z1, { tint: 0xd8cfc0, collide });
      sink.box('stone', b.x0, b.y0, b.z0, b.x0 + rim, b.y1, b.z1, { tint: 0xd8cfc0, collide });
      sink.box('stone', b.x1 - rim, b.y0, b.z0, b.x1, b.y1, b.z1, { tint: 0xd8cfc0, collide });
      sink.box('plain', b.x0 + rim, b.y0, b.z0 + rim, b.x1 - rim, b.y0 + 0.05, b.z1 - rim, { tint: 0x1d3a48 });
      sink.box('water', b.x0 + rim, b.y1 - 0.12, b.z0 + rim, b.x1 - rim, b.y1 - 0.1, b.z1 - rim, { tint: 0x7fb3c7 });
      sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      break;
    }
    case 'sculpture': {
      if (b.variant === 'canoe') {
        const hull = new THREE.SphereGeometry(1, 16, 6);
        hull.scale(w / 2, 0.45, d / 2);
        hull.translate(cx, b.y0, cz);
        sink.add('wood', hull, undefined, { tint: 0x6e3f22 });
        for (const x of [b.x0 + 2, b.x1 - 2]) sink.box('plain', x - 0.02, b.y1, cz - 0.02, x + 0.02, 12, cz + 0.02, { tint: 0x222222 });
        break;
      }
      sink.box('stone', b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, { tint: 0xcfc6b6, collide });
      const top = b.y1;
      const marble = 0xf1ece2;
      if (b.variant === 'figure' || b.variant === 'torso') {
        const body = new THREE.CapsuleGeometry(0.28, b.variant === 'figure' ? 1.1 : 0.6, 4, 10);
        body.translate(cx, top + (b.variant === 'figure' ? 0.85 : 0.6), cz);
        sink.add('plaster', body, undefined, { tint: marble, gain: 1.1 });
        if (b.variant === 'figure') { const head = new THREE.SphereGeometry(0.17, 10, 8); head.translate(cx, top + 1.75, cz); sink.add('plaster', head, undefined, { tint: marble, gain: 1.1 }); }
      } else if (b.variant === 'horse') {
        const body = new THREE.CapsuleGeometry(0.35, 1.0, 4, 10);
        body.rotateZ(Math.PI / 2);
        body.translate(cx, top + 1.2, cz);
        const neck = new THREE.CapsuleGeometry(0.16, 0.6, 4, 8);
        neck.rotateZ(-0.6);
        neck.translate(cx + 0.75, top + 1.6, cz);
        sink.add('plain', mergeParts([body, neck]), undefined, { tint: 0x6a5a3a, gain: 1.2 });
        for (const [dx, dz] of [[-0.5, -0.2], [-0.5, 0.2], [0.5, -0.2], [0.5, 0.2]]) sink.box('plain', cx + dx - 0.05, top, cz + dz - 0.05, cx + dx + 0.05, top + 1, cz + dz + 0.05, { tint: 0x5a4a30, gain: 1.2 });
      } else if (b.variant === 'lion') {
        const body = new THREE.BoxGeometry(w * 0.8, 0.9, d * 0.35);
        body.translate(cx, top + 0.45, cz);
        const head = new THREE.SphereGeometry(0.45, 10, 8);
        head.translate(cx + w * 0.35, top + 1.0, cz);
        sink.add('sandstone', mergeParts([body, head]), undefined, { tint: 0xd9c19a });
      } else if (b.variant === 'monument') {
        // Monumental abstract arch sculpture.
        const arch = new THREE.TorusGeometry(2.2, 0.45, 8, 20, Math.PI);
        arch.translate(cx, top, cz);
        sink.add('plain', arch, undefined, { tint: 0x7a4a30, gain: 1.2 });
        sink.collideBox(cx - 2.7, top, cz - 0.5, cx - 1.7, top + 1.5, cz + 0.5);
        sink.collideBox(cx + 1.7, top, cz - 0.5, cx + 2.7, top + 1.5, cz + 0.5);
      }
      break;
    }
    case 'crate': {
      solid('wood', 0xa07a4f);
      sink.box('plain', b.x0 - 0.02, b.y0 + h * 0.45, b.z0 - 0.02, b.x1 + 0.02, b.y0 + h * 0.55, b.z1 + 0.02, { tint: 0x4a3a2a });
      break;
    }
    case 'barrier': {
      if (b.variant === 'hotdog') {
        sink.box('plain', b.x0, b.y0 + 0.3, b.z0, b.x1, b.y1, b.z1, { tint: 0xc9ccd0, gain: 1.1, collide });
        for (const x of [b.x0 + 0.2, b.x1 - 0.2]) { const wheel = new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10); wheel.rotateX(Math.PI / 2); wheel.translate(x, b.y0 + 0.28, b.z1 + 0.05); sink.add('plain', wheel, undefined, { tint: 0x222222 }); }
        sink.box('plain', cx - 0.02, b.y1, cz - 0.02, cx + 0.02, b.y1 + 1.4, cz + 0.02, { tint: 0x777777 });
        const umb = new THREE.ConeGeometry(1.2, 0.5, 8, 1, true);
        umb.translate(cx, b.y1 + 1.6, cz);
        sink.add('plain', umb, undefined, { tint: 0xe3b22f, gain: 1.2 });
        sink.add('plain', (() => { const s = new THREE.ConeGeometry(1.21, 0.5, 8, 1, true, 0, Math.PI / 4); s.translate(cx, b.y1 + 1.6, cz); return s; })(), undefined, { tint: 0x2f6fb5 });
      } else solid('plain', 0x555555);
      break;
    }
    case 'knight': {
      // Equestrian armour on a low plinth: horse (barding) and armoured rider with a raised lance.
      sink.box('stone', b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, { tint: 0x6a6258, collide });
      const top = b.y1;
      const along = d > w; // horse faces along the long axis
      const steel = 0x9aa3ad, cloth = [0x8a1f24, 0x1f3a6a, 0x2a5a2a][Math.floor(rand() * 3)];
      const rot = new THREE.Matrix4().makeRotationY(along ? 0 : Math.PI / 2);
      const at = (g: THREE.BufferGeometry) => { g.applyMatrix4(rot); g.translate(cx, top, cz); return g; };
      const body = new THREE.CapsuleGeometry(0.42, 1.3, 4, 10); body.rotateX(Math.PI / 2); body.translate(0, 1.45, 0);
      const neck = new THREE.CapsuleGeometry(0.2, 0.7, 4, 8); neck.rotateX(-0.7); neck.translate(0, 1.95, -0.95);
      const head = new THREE.BoxGeometry(0.28, 0.32, 0.6); head.translate(0, 2.3, -1.35);
      const legs = [[-0.25, -0.65], [0.25, -0.65], [-0.25, 0.65], [0.25, 0.65]].map(([lx, lz]) => { const l = new THREE.CylinderGeometry(0.08, 0.07, 1.1, 6); l.translate(lx, 0.55, lz); return l; });
      sink.add('plain', at(mergeParts([body, neck, head, ...legs])), undefined, { tint: steel, gain: 1.15 });
      const barding = new THREE.BoxGeometry(1.0, 0.5, 1.9); barding.translate(0, 1.15, 0);
      sink.add('plain', at(barding), undefined, { tint: cloth, gain: 1.1 });
      const torso = new THREE.CapsuleGeometry(0.22, 0.5, 4, 8); torso.translate(0, 2.35, 0.1);
      const helm = new THREE.CylinderGeometry(0.15, 0.17, 0.32, 8); helm.translate(0, 2.95, 0.1);
      const lance = new THREE.CylinderGeometry(0.03, 0.05, 3.6, 6); lance.rotateX(-1.25); lance.translate(0.3, 2.9, -0.9);
      const shield = new THREE.BoxGeometry(0.06, 0.6, 0.45); shield.translate(-0.35, 2.3, 0.1);
      sink.add('plain', at(mergeParts([torso, helm])), undefined, { tint: 0xc3ccd6, gain: 1.2 });
      sink.add('wood', at(lance), undefined, { tint: 0xc8a070 });
      sink.add('plain', at(shield), undefined, { tint: cloth, gain: 1.1 });
      sink.collideBox(cx - (along ? 0.55 : 1.1), top, cz - (along ? 1.1 : 0.55), cx + (along ? 0.55 : 1.1), top + 2, cz + (along ? 1.1 : 0.55));
      break;
    }
    case 'colonnade': {
      // A classical bank facade rebuilt indoors: stylobate, columns, entablature and pediment.
      const along = d > w;
      const len = along ? d : w;
      sink.box('stone', b.x0, b.y0, b.z0, b.x1, b.y0 + 0.5, b.z1, { tint: 0xeee7da, collide });
      const n = Math.max(2, Math.round(len / 4.5));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const px = along ? cx : b.x0 + t * w, pz = along ? b.z0 + t * d : cz;
        sink.add('stone', column(b.y1 - b.y0 - 1.6, 0.4, 'corinthian', 16), M(px, b.y0 + 0.5, pz), { tint: 0xf3ede2 });
        sink.collideBox(px - 0.45, b.y0, pz - 0.45, px + 0.45, b.y1, pz + 0.45);
      }
      sink.box('stone', b.x0, b.y1 - 1.1, b.z0, b.x1, b.y1, b.z1, { tint: 0xf1eadc });
      break;
    }
    case 'totem': case 'lintel': default:
      // The lobby panel totem is drawn by the UI layer; blocks here only collide.
      if (collide) sink.collideBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
  }
}
