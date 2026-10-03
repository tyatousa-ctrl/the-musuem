import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { adjacency, roomAt, type MuseumMap, type RoomId } from '@museum/shared';
import { buildRoom, type BuildCtx } from './build/rooms';
import { buildExterior, type ExteriorDynamic } from './build/exterior';
import { labelAtlas, loadArtCatalogue, type Painting } from './paintings';
import { setArtTextures } from './sink';
import { shaftTexture, skyTexture } from './textures';

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
  for (const p of map.portals) if (p.kind === 'grand' || p.kind === 'arch' || p.kind === 'opening' || p.width >= 4) {
    big.get(p.a)!.add(p.b); big.get(p.b)!.add(p.a);
  }
  const vis = new Map<RoomId, Set<RoomId>>();
  for (const r of map.rooms) {
    const s = new Set<RoomId>([r.id, ...adj.get(r.id)!]);
    for (const n of big.get(r.id)!) for (const m of big.get(n)!) s.add(m);
    vis.set(r.id, s);
  }
  // Gallery enfilades read best with two rooms visible down the line.
  for (const r of map.rooms) if (r.id.startsWith('gallery')) {
    for (const n of [...adj.get(r.id)!]) for (const m of adj.get(n)!) if (m.startsWith('gallery')) vis.get(r.id)!.add(m);
  }
  return vis;
}

const EXTERIOR_VISIBLE_FROM = new Set(['exterior', 'lobby', 'northCourt', 'southCourt']);

export async function buildWorld(map: MuseumMap, onProgress?: (label: string) => void): Promise<World> {
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

  return {
    scene, rooms, collider, colliderMesh, sky,
    cull(pos) {
      const room = roomAt(map, pos.x, pos.y - 1.2, pos.z)?.id ?? lastRoom ?? 'exterior';
      lastRoom = room;
      const visible = new Set(vis.get(room) ?? []);
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
