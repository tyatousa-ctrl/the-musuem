import * as THREE from 'three';
import { BUILDING, type MuseumMap, type Room } from '@museum/shared';
import { type RoomLight, Sink } from '../sink';
import { buildPlatforms, buildStairs } from './structure';
import { buildBlock } from './exhibits';
import { archInfill, column, moulding, PROFILES, railing, tree } from '../kit/kit';
import { seeded } from '../textures';

const M = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const C = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** Facade basis: u runs south→north along the face (−z), v up, w out toward the avenue (+x). */
const FACE = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
const faceAt = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(FACE);

export const MUSEUM_NAME = 'THE MUSEUM'; // placeholder until the human picks a name (brief §25 Q4)

function bannerTexture(title: string, sub: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 896;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = bg; g.fillRect(14, 14, c.width - 28, c.height - 28);
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#fbf6ea';
  g.textAlign = 'center';
  g.font = 'bold 70px Georgia, serif';
  g.fillText(title, 0, 10);
  g.font = 'italic 28px Georgia, serif';
  g.fillText(sub, 0, 46);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function inscriptionTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8dfcd'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#7d6f5c';
  g.font = '64px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(MUSEUM_NAME.split('').join(' '), c.width / 2, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface ExteriorDynamic { group: THREE.Group; update(dt: number, t: number): void }

export function buildExterior(r: Room, map: MuseumMap): { group: THREE.Group; colliders: THREE.BufferGeometry[]; dynamic: ExteriorDynamic } {
  const sink = new Sink();
  const rand = seeded(42);
  /** Distant or flat geometry: no bake subdivision (it was most of the exterior's triangles). */
  const far = (mat: Parameters<Sink['box']>[0], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: Parameters<Sink['box']>[7] = {}) => sink.box(mat, x0, y0, z0, x1, y1, z1, opts, 1e4);
  const STONE = 0xeee4d0;

  // ── Ground: plaza, sidewalks, avenue, far side.
  sink.box('stone', 39, -2.7, -80, 62, -2.4, 80, { tint: 0xc9c1b3, collide: true }, 4);
  far('asphalt', 62, -2.75, -200, 76, -2.6, 200, { tint: 0x9a9a9a });
  far('stone', 76, -2.7, -200, 82, -2.45, 200, { tint: 0xb8b2a8 });
  far('stone', 56, -2.7, -200, 62, -2.45, -80, { tint: 0xb8b2a8 });
  far('stone', 56, -2.7, 80, 62, -2.45, 200, { tint: 0xb8b2a8 });
  far('plain', 61.8, -2.75, -200, 62.1, -2.4, 200, { tint: 0x8d8a84 });
  for (let z = -200; z < 200; z += 6) far('plain', 68.9, -2.6, z, 69.1, -2.59, z + 3, { tint: 0xd8b23a, gain: 1.4 });
  for (let z = -6; z <= 6; z += 1.2) far('plain', 62.5, -2.6, z, 75.5, -2.59, z + 0.6, { tint: 0xeeeeee, gain: 1.2 });
  // Park lawns behind the glass courts.
  far('foliage', -100, -0.3, -160, 39, -0.05, BUILDING.z0 - 0.5, { tint: 0x7fa060 });
  far('foliage', -100, -0.3, BUILDING.z1 + 0.5, 39, -0.05, 160, { tint: 0x7fa060 });
  far('foliage', -160, -0.3, -160, BUILDING.x0 - 0.5, -0.05, 160, { tint: 0x7fa060 });

  // ── Terrace, front steps, cheeks, fountains, cart.
  buildPlatforms(sink, map, r.id, 'stone', 0xe3dccf, 'stone', 0xe3dccf);
  buildStairs(sink, map, r.id, 'stone', 0xe6ddcd);
  for (const b of map.blocks.filter((x) => x.room === r.id)) buildBlock(sink, b);

  // ── Facade skin (x = 39 … 39.5), wings plain with windows, centre pavilion with three arched bays.
  const doors = map.portals.filter((p) => p.a === 'exterior' || p.b === 'exterior');
  const skin = (z0: number, z1: number, y0: number, y1: number, x1 = 39.5, tint = STONE) => sink.box('stone', 39, y0, z0, x1, y1, z1, { tint });
  // Rusticated base under the wings (visible from the plaza).
  skin(BUILDING.z0, -18, -2.4, 0, 39.9, 0xd8cfbe); skin(18, BUILDING.z1, -2.4, 0, 39.9, 0xd8cfbe);
  // Wings.
  for (const [z0, z1] of [[BUILDING.z0, -15], [15, BUILDING.z1]] as const) {
    skin(z0, z1, 0, 20);
    sink.add('stone', moulding(PROFILES.cornice, z1 - z0, 1.6), faceAt(39.5, 18.4, z1), { tint: 0xf3ebdb });
    sink.add('stone', moulding(PROFILES.stringCourse, z1 - z0, 1.5), faceAt(39.5, 6, z1), { tint: 0xe9dfcc });
    const bal = railing(39.7, z0, 20, 39.7, z1, 20, 'balustrade', 1.2);
    sink.add('stone', bal.solid, undefined, { tint: 0xece3d1 });
    for (let z = z0 + 4; z < z1 - 2; z += 6) {
      // Tall arched blind windows with dark glazing.
      sink.box('plain', 39.45, 8, z - 1.1, 39.52, 15, z + 1.1, { tint: 0x2b3038 });
      sink.add('stone', archInfill(2.2, 15, 16.4, 0.12), faceAt(39.6, 0, z), { tint: 0xe9dfcc });
      sink.box('stone', 39.5, 7.6, z - 1.5, 39.8, 8, z + 1.5, { tint: 0xe9dfcc });
      sink.box('plain', 39.45, 1.5, z - 0.9, 39.52, 4.5, z + 0.9, { tint: 0x2b3038 });
    }
  }
  // Centre pavilion: piers between and beside the three bays.
  const bayZ = doors.map((d) => d.z).sort((a, b) => a - b);
  const bayW = 4.4;
  const edges = [-15, ...bayZ.flatMap((z) => [z - bayW / 2, z + bayW / 2]), 15];
  for (let i = 0; i < edges.length; i += 2) skin(edges[i], edges[i + 1], 0, 19, 39.9);
  for (const z of bayZ) {
    // Door void is cut by the lobby wall; above it, an arched window to 15 m.
    skin(z - bayW / 2, z + bayW / 2, 6.5, 7.6, 39.9);
    sink.box('emissive', 39.3, 7.6, z - bayW / 2, 39.4, 15, z + bayW / 2, { tint: 0x7d8a96 });
    for (let k = -1; k <= 1; k++) sink.box('plain', 39.4, 7.6, z + k * 1.1 - 0.06, 39.55, 15, z + k * 1.1 + 0.06, { tint: 0x3c3a36 });
    for (const y of [10, 12.5]) sink.box('plain', 39.4, y - 0.06, z - bayW / 2, 39.55, y + 0.06, z + bayW / 2, { tint: 0x3c3a36 });
    sink.add('stone', archInfill(bayW, 15, 19, 0.6), faceAt(39.9, 0, z), { tint: STONE });
    sink.box('stone', 39.9, 14.6, z - 0.45, 40.15, 16.2, z + 0.45, { tint: 0xf2e9d8 }); // keystone
    // Door surround and bronze doors pushed open.
    sink.box('stone', 39.9, 0, z - 2.5, 40.1, 7.0, z - 2.0, { tint: 0xf3ebdc });
    sink.box('stone', 39.9, 0, z + 2.0, 40.1, 7.0, z + 2.5, { tint: 0xf3ebdc });
    sink.box('stone', 39.9, 6.5, z - 2.5, 40.2, 7.2, z + 2.5, { tint: 0xf3ebdc });
  }
  // Paired Corinthian columns on high pedestals.
  const pairs = [-12, -4, 4, 12];
  for (const pz of pairs) {
    for (const dz of [-1.2, 1.2]) {
      const z = pz + dz;
      sink.box('stone', 40.0, 0, z - 0.75, 41.5, 2.4, z + 0.75, { tint: 0xe4dac7, collide: true });
      sink.box('stone', 39.92, 2.25, z - 0.85, 41.58, 2.5, z + 0.85, { tint: 0xece2cf });
      sink.add('stone', column(12.4, 0.58, 'corinthian', 24), M(40.75, 2.5, z), { tint: 0xf3ebdc });
    }
    // Sculpture blocks above each pair (left rough, as on the real Met).
    sink.box('stone', 39.9, 17.9, pz - 1.9, 41.6, 21.4, pz + 1.9, { tint: 0xe1d6c2 });
  }
  // Entablature and attic over the pavilion, broken forward over the column pairs.
  sink.box('stone', 39.5, 14.9, -15, 40.2, 17.4, 15, { tint: 0xece3d1 });
  for (const pz of pairs) sink.box('stone', 40.2, 14.9, pz - 2.1, 41.6, 17.4, pz + 2.1, { tint: 0xefe6d4 });
  sink.add('stone', moulding(PROFILES.cornice, 30, 1.5), faceAt(40.2, 16.6, 15), { tint: 0xf4ecdc });
  sink.box('stone', 39.5, 17.4, -15, 40.1, 23, 15, { tint: 0xeae0cd });
  sink.add('stone', moulding(PROFILES.cornice, 30, 1.2), faceAt(40.1, 22.2, 15), { tint: 0xf4ecdc });

  // ── Fence colliders (invisible) around the walkable plaza.
  const f = map.exteriorFence;
  sink.collideBox(f.x1, -3, f.z0, f.x1 + 0.3, 3, f.z1);
  sink.collideBox(f.x0, -3, f.z0 - 0.3, f.x1, 3, f.z0);
  sink.collideBox(f.x0, -3, f.z1, f.x1, 3, f.z1 + 0.3);
  // Low hedges marking the fence line.
  sink.box('foliage', f.x0 + 14, -2.4, f.z0 - 0.6, f.x1, -1.6, f.z0, { tint: 0x8fb070 });
  sink.box('foliage', f.x0 + 14, -2.4, f.z1, f.x1, -1.6, f.z1 + 0.6, { tint: 0x8fb070 });

  // ── Street furniture: trees, lamps.
  const tr = (x: number, z: number, h: number) => { const t = tree(h); sink.add('wood', t.trunk, M(x, -2.4, z), { tint: 0x5a4030 }); sink.add('foliage', t.canopy, M(x, -2.4, z), { tint: 0xa8c27e }); };
  for (let z = -56; z <= 56; z += 8) if (Math.abs(z) > 20) tr(59.5, z, 8 + rand() * 2);
  for (let z = -190; z <= 190; z += 10) tr(79, z, 9 + rand() * 2);
  // Central Park: trees beyond the park-side wall and outside both glass courts.
  for (let z = -150; z <= 150; z += 9) for (let k = 0; k < 2; k++) tr(BUILDING.x0 - 6 - rand() * 50, z + rand() * 4, 9 + rand() * 6);
  for (let x = BUILDING.x0 + 4; x < 36; x += 9) { tr(x + rand() * 3, BUILDING.z0 - 6 - rand() * 14, 10 + rand() * 5); tr(x + rand() * 3, BUILDING.z1 + 6 + rand() * 14, 10 + rand() * 5); }
  for (const z of [-34, -20, 20, 34]) {
    sink.box('plain', 58.9, -2.4, z - 0.07, 59.05, 2.4, z + 0.07, { tint: 0x2c2f2c });
    const globe = new THREE.SphereGeometry(0.28, 8, 6);
    sink.add('emissive', globe, M(58.97, 2.6, z), { tint: 0xfff2d0 });
  }

  // ── Buildings across the avenue and a skyline beyond.
  for (let z = -200; z < 200;) {
    const w = 14 + rand() * 18;
    if (rand() < 0.15) { z += 12; continue; } // cross street
    const h = 22 + rand() * 30;
    const tint = [0xd9c3a8, 0xc9b49c, 0xe3d6c2, 0xb79c86, 0xd0c8bc][Math.floor(rand() * 5)];
    far('facade', 82, -2.4, z, 100, h, z + w, { tint });
    far('plain', 81.6, h - 0.6, z, 82.2, h, z + w, { tint: 0xd9d0c0 });
    far('plain', 81.8, -2.4, z, 82, 1.6, z + w, { tint: 0x3a3530 });
    z += w + 0.3;
  }
  for (let i = 0; i < 70; i++) {
    const x = 170 + rand() * 150, z = -260 + rand() * 520, w = 12 + rand() * 25, h = 40 + rand() ** 2 * 170;
    far('plain', x, -2.4, z, x + w, h, z + w * (0.6 + rand()), { tint: 0xa7b3c2 });
  }
  // Park-side skyline beyond the lawns (west).
  for (let i = 0; i < 40; i++) {
    const x = -260 - rand() * 120, z = -260 + rand() * 520, w = 15 + rand() * 25, h = 50 + rand() ** 2 * 140;
    far('plain', x, -2.4, z, x + w, h, z + w, { tint: 0xb3bdca });
  }

  const light: RoomLight = {
    sky: C(0xf4f6f8, 0.9), ground: C(0xc9c1b3, 0.55), sunDir: new THREE.Vector3(-0.65, -0.6, 0.3).normalize(),
    sun: C(0xfff0d8, 0.35), pools: [], floorY: -2.4, ceilY: 30, topLift: 0.05,
  };
  const group = sink.build(light, r.id);

  // ── Banners (own textures, outside the merged sink).
  const dyn = new THREE.Group();
  dyn.name = 'exterior:dynamic';
  const banners: [string, string, string][] = [['DINOSAURS', 'The Great Hall of Bones', '#7a1f24'], ['EGYPT', 'Tombs & Temples', '#1f4a5a'], ['MASTERS', 'European Paintings', '#5a3a1f'], ['CULTURES', 'Art of the World', '#2a4a2a']];
  pairs.forEach((pz, i) => {
    const [t, s, bg] = banners[i];
    const mat = new THREE.MeshBasicMaterial({ map: bannerTexture(t, s, bg), side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 8.6), mat);
    plane.position.set(41.3, 9.6, pz);
    plane.rotation.y = Math.PI / 2;
    dyn.add(plane);
  });
  const ins = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.3), new THREE.MeshBasicMaterial({ map: inscriptionTexture() }));
  ins.position.set(40.12, 19.9, 0);
  ins.rotation.y = Math.PI / 2;
  dyn.add(ins);

  // ── Traffic: instanced yellow cabs and buses looping along the avenue.
  const cabBody = new THREE.BoxGeometry(4.6, 0.9, 1.9); cabBody.translate(0, 0.75, 0);
  const cabTop = new THREE.BoxGeometry(2.4, 0.6, 1.7); cabTop.translate(-0.2, 1.5, 0);
  const cabMesh = new THREE.InstancedMesh(cabBody, new THREE.MeshLambertMaterial({ color: 0xf2c230 }), 14);
  const cabCabin = new THREE.InstancedMesh(cabTop, new THREE.MeshLambertMaterial({ color: 0x2b2f36 }), 14);
  const busBody = new THREE.BoxGeometry(12, 2.8, 2.5); busBody.translate(0, 1.7, 0);
  const busMesh = new THREE.InstancedMesh(busBody, new THREE.MeshLambertMaterial({ color: 0x2f5fa8 }), 3);
  const vehicles: { mesh: THREE.InstancedMesh; extra?: THREE.InstancedMesh; i: number; x: number; z: number; v: number }[] = [];
  for (let i = 0; i < 14; i++) vehicles.push({ mesh: cabMesh, extra: cabCabin, i, x: i % 2 ? 65 : 72.5, z: -200 + rand() * 400, v: (i % 2 ? 1 : -1) * (9 + rand() * 4) });
  for (let i = 0; i < 3; i++) vehicles.push({ mesh: busMesh, i, x: i % 2 ? 66 : 72, z: -200 + rand() * 400, v: (i % 2 ? 1 : -1) * 7 });
  const tmp = new THREE.Object3D();
  dyn.add(cabMesh, cabCabin, busMesh);
  for (const m of [cabMesh, cabCabin, busMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }

  // ── Fountain jets.
  const jets: THREE.Mesh[] = [];
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xe8f4f8, transparent: true, opacity: 0.65 });
  for (const z of [-26, 26]) {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.35, 3, 8, 1, true), jetMat);
    jet.position.set(55, -0.6, z);
    jets.push(jet);
    dyn.add(jet);
  }

  return {
    group,
    colliders: sink.colliders,
    dynamic: {
      group: dyn,
      update(dt, t) {
        for (const v of vehicles) {
          v.z += v.v * dt;
          if (v.z > 200) v.z -= 400; if (v.z < -200) v.z += 400;
          tmp.position.set(v.x, -2.6, v.z);
          tmp.rotation.set(0, v.v > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          tmp.updateMatrix();
          v.mesh.setMatrixAt(v.i, tmp.matrix);
          v.extra?.setMatrixAt(v.i, tmp.matrix);
        }
        cabMesh.instanceMatrix.needsUpdate = cabCabin.instanceMatrix.needsUpdate = busMesh.instanceMatrix.needsUpdate = true;
        for (const [k, j] of jets.entries()) j.scale.y = 0.9 + Math.sin(t * 3 + k) * 0.1;
      },
    },
  };
}
