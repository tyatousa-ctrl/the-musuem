import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { adjacency, roomAt, type MuseumMap, type RoomId } from '@museum/shared';
import { buildRoom, type BuildCtx } from './build/rooms';
import { buildExterior, type ExteriorDynamic } from './build/exterior';
import { labelAtlas, loadArtCatalogue, type Painting } from './paintings';
import { setArtTextures } from './sink';
import { shaftTexture, skyTexture } from './textures';
import { assets } from '../core/assets';
import { pendingModels } from './build/exhibits';

export interface World {
  scene: THREE.Group;
  rooms: Map<RoomId, THREE.Group>;
  collider: MeshBVH;
  colliderMesh: THREE.Mesh;
  /** Update culling for the viewer position; returns visible room ids. */
  cull(pos: THREE.Vector3): RoomId[];
  update(dt: number, t: number, camera: THREE.Camera): void;
  sky: THREE.Mesh;
}

/** Room-room visibility: neighbours, plus rooms seen through chains of big openings. */
function visibilitySets(map: MuseumMap): Map<RoomId, Set<RoomId>> {
  const adj = adjacency(map);
  const big = new Map<RoomId, Set<RoomId>>();
  for (const r of map.rooms) big.set(r.id, new Set());
  // Only true archways extend visibility a second room deep; doors and stair holes show just the next room.
  for (const p of map.portals) if (p.kind === 'grand' || p.kind === 'arch') {
    big.get(p.a)!.add(p.b); big.get(p.b)!.add(p.a);
  }
  const vis = new Map<RoomId, Set<RoomId>>();
  for (const r of map.rooms) {
    const s = new Set<RoomId>([r.id, ...adj.get(r.id)!]);
    for (const n of big.get(r.id)!) for (const m of big.get(n)!) s.add(m);
    vis.set(r.id, s);
  }
  // See-through doorways (map hint) are lined up with a grand opening into room `a`: from
  // across that opening you see into `b`. One way only: from `b` the far room is behind you.
  for (const p of map.portals) if (p.seeThrough) {
    for (const r of big.get(p.a)!) vis.get(r)?.add(p.b);
  }
  // Gallery enfilades read best with two rooms visible down the line.
  for (const r of map.rooms) if (r.id.startsWith('gallery')) {
    for (const n of [...adj.get(r.id)!]) for (const m of adj.get(n)!) if (m.startsWith('gallery')) vis.get(r.id)!.add(m);
  }
  return vis;
}

const EXTERIOR_VISIBLE_FROM = new Set(['exterior', 'lobby', 'northCourt', 'southCourt']);

export async function buildWorld(map: MuseumMap, onProgress?: (label: string) => void): Promise<World> {
  await assets.load();
  onProgress?.('Hanging the paintings…');
  const art = await loadArtCatalogue();
  const labels = labelAtlas(art.paintings);
  setArtTextures(art.atlases, labels.texture);

  // Round-robin through the catalogue by curated group.
  const byGroup = new Map<string, Painting[]>();
  for (const p of art.paintings) {
    if (!byGroup.has(p.group)) byGroup.set(p.group, []);
    byGroup.get(p.group)!.push(p);
  }
  const cursors = new Map<string, number>();
  const nextPainting = (group: string) => {
    const list = byGroup.get(group) ?? art.paintings;
    const i = cursors.get(group) ?? 0;
    cursors.set(group, i + 1);
    return list[i % list.length];
  };
  const ctx: BuildCtx = { map, art, labelRects: labels.rects, nextPainting };

  const scene = new THREE.Group();
  scene.name = 'world';
  const rooms = new Map<RoomId, THREE.Group>();
  const colliders: THREE.BufferGeometry[] = [];
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.32 });
  let exteriorDyn: ExteriorDynamic | null = null;

  for (const r of map.rooms) {
    onProgress?.(`Building ${r.name}…`);
    await new Promise((res) => setTimeout(res, 0)); // keep the loading screen responsive
    if (r.id === 'exterior') {
      const ext = buildExterior(r, map);
      ext.group.add(ext.dynamic.group);
      exteriorDyn = ext.dynamic;
      rooms.set(r.id, ext.group);
      scene.add(ext.group);
      colliders.push(...ext.colliders);
      continue;
    }
    const built = buildRoom(r, ctx);
    for (const s of built.extras.shafts) {
      // Two crossed additive cards from the skylight down to the floor.
      const len = s.top.distanceTo(s.bottom);
      for (const rot of [0, Math.PI / 2]) {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(s.radius * 2, len), shaftMat);
        card.position.copy(s.top).add(s.bottom).multiplyScalar(0.5);
        card.lookAt(s.bottom);
        card.rotateX(Math.PI / 2);
        card.rotateY(rot);
        card.renderOrder = 3;
        built.group.add(card);
      }
    }
    rooms.set(r.id, built.group);
    scene.add(built.group);
    colliders.push(...built.colliders);
  }

  // Manifest models replace procedural exhibits once loaded (no code changes needed to swap).
  for (const pm of pendingModels) {
    void assets.model(pm.id).then((obj) => {
      if (!obj) return;
      obj.applyMatrix4(pm.matrix);
      rooms.get(pm.room)?.add(obj);
    });
  }

  onProgress?.('Laying the floors…');
  const merged = mergeGeometries(colliders.map((g) => { const n = new THREE.BufferGeometry(); n.setAttribute('position', g.attributes.position); return n; }), false)!;
  const collider = new MeshBVH(merged);
  const colliderMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ wireframe: true, color: 0x00ff88, transparent: true, opacity: 0.25 }));
  colliderMesh.visible = false;
  colliderMesh.name = 'collider';
  scene.add(colliderMesh);

  // Sky dome follows the camera.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10;
  sky.name = 'sky';
  scene.add(sky);

  const vis = visibilitySets(map);
  let lastRoom: RoomId | null = null;
  // Direct room-to-room doorways, for the floor-aware check in cull().
  const links = new Map<RoomId, Map<RoomId, typeof map.portals>>();
  for (const p of map.portals) {
    for (const [a, b] of [[p.a, p.b], [p.b, p.a]]) {
      if (!links.has(a)) links.set(a, new Map());
      const m = links.get(a)!;
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(p);
    }
  }
  /** Is `other` also visible through a chain of grand openings (not just its direct doorways)? */
  const chained = new Map<RoomId, Set<RoomId>>();
  for (const r of map.rooms) {
    const s = new Set<RoomId>();
    for (const p of map.portals) if ((p.kind === 'grand' || p.kind === 'arch') && (p.a === r.id || p.b === r.id)) {
      const n = p.a === r.id ? p.b : p.a;
      for (const q of map.portals) if ((q.kind === 'grand' || q.kind === 'arch') && (q.a === n || q.b === n)) s.add(q.a === n ? q.b : q.a);
    }
    chained.set(r.id, s);
  }
  const reachedOtherwise = (room: RoomId, other: RoomId) => chained.get(room)!.has(other);

  return {
    scene, rooms, collider, colliderMesh, sky,
    cull(pos) {
      const room = roomAt(map, pos.x, pos.y - 1.2, pos.z)?.id ?? lastRoom ?? 'exterior';
      lastRoom = room;
      const visible = new Set(vis.get(room) ?? []);
      // A neighbour joined only by doorways high above you (the upstairs galleries off the
      // Dinosaur Hall's catwalks, seen from the floor 8 m below) is drawn only when you're on
      // that level or close to one of those doorways: from far below you can't see into it.
      const eye = pos.y;
      for (const [other, ps] of links.get(room) ?? []) {
        if (!visible.has(other) || other === room) continue;
        const near = ps.some((p) => p.y + 1.6 - eye < 3 || Math.hypot(p.x - pos.x, p.z - pos.z) < 14); // doorways overhead only
        if (!near && !reachedOtherwise(room, other)) visible.delete(other);
      }
      if (EXTERIOR_VISIBLE_FROM.has(room)) visible.add('exterior');
      for (const [id, g] of rooms) g.visible = visible.has(id);
      sky.visible = visible.has('exterior') || room === 'northCourt' || room === 'southCourt';
      return [...visible];
    },
    update(dt, t, camera) {
      sky.position.copy(camera.getWorldPosition(new THREE.Vector3()));
      if (rooms.get('exterior')?.visible) exteriorDyn?.update(dt, t);
    },
  };
}
