import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { texture, type TexKey } from './textures';

/**
 * Static world geometry is collected per material, given world-space UVs,
 * "baked" with a cheap analytic light model into vertex colours, merged, and
 * rendered with unlit materials (brief §9.2: unlit-plus-baked on Quest).
 */

export type MatKey =
  | 'stone' | 'plaster' | 'marble' | 'terrazzo' | 'damask' | 'sandstone' | 'block' | 'concrete'
  | 'wood' | 'asphalt' | 'facade' | 'foliage' | 'bone' | 'plain' | 'glass' | 'emissive' | 'water'
  | `canvas${number}` | 'labels';

interface MatSpec { tex?: TexKey; metres?: number; transparent?: boolean; opacity?: number; unbaked?: boolean; keepUV?: boolean; side?: THREE.Side; additive?: boolean }

const SPECS: Record<string, MatSpec> = {
  stone: { tex: 'limestone', metres: 2.4 },
  plaster: { tex: 'plaster', metres: 2 },
  marble: { tex: 'marble', metres: 2.4 },
  terrazzo: { tex: 'terrazzo', metres: 1.5 },
  damask: { tex: 'damask', metres: 1.2 },
  sandstone: { tex: 'sandstone', metres: 3 },
  block: { tex: 'block', metres: 2 },
  concrete: { tex: 'concrete', metres: 2 },
  wood: { tex: 'wood', metres: 1 },
  asphalt: { tex: 'asphalt', metres: 4 },
  facade: { tex: 'facade', metres: 12 },
  foliage: { tex: 'foliage', metres: 2 },
  bone: { tex: 'bone', metres: 1 },
  plain: {},
  glass: { transparent: true, opacity: 0.16, side: THREE.DoubleSide },
  emissive: { unbaked: true },
  water: { transparent: true, opacity: 0.82 },
  labels: { keepUV: true },
};

const matCache = new Map<string, THREE.Material>();
let canvasAtlases: THREE.Texture[] = [];
let labelTexture: THREE.Texture | null = null;

export function setArtTextures(atlases: THREE.Texture[], labels: THREE.Texture) {
  canvasAtlases = atlases;
  labelTexture = labels;
}

function specFor(key: MatKey): MatSpec {
  if (key.startsWith('canvas')) return { keepUV: true };
  return SPECS[key];
}

export function material(key: MatKey): THREE.Material {
  let m = matCache.get(key);
  if (m) return m;
  const spec = specFor(key);
  let map: THREE.Texture | null = null;
  if (spec.tex) {
    map = texture(spec.tex).clone();
    map.repeat.set(1 / spec.metres!, 1 / spec.metres!);
    map.needsUpdate = true;
  } else if (key.startsWith('canvas')) map = canvasAtlases[Number(key.slice(6))] ?? null;
  else if (key === 'labels') map = labelTexture;
  m = new THREE.MeshBasicMaterial({
    map,
    vertexColors: true,
    transparent: !!spec.transparent,
    opacity: spec.opacity ?? 1,
    side: spec.side ?? THREE.FrontSide,
    depthWrite: !spec.transparent,
  });
  m.name = key;
  matCache.set(key, m);
  return m;
}

export interface LightPool { pos: THREE.Vector3; radius: number; color: THREE.Color }

/** Per-room analytic lighting used by the bake. */
export interface RoomLight {
  sky: THREE.Color;       // light arriving from above
  ground: THREE.Color;    // bounce from below
  sunDir: THREE.Vector3;  // direction light travels
  sun: THREE.Color;
  pools: LightPool[];
  floorY: number;
  ceilY: number;
  /** How much brighter the top of the room is (skylit rooms). */
  topLift: number;
}

export interface AddOpts {
  tint?: THREE.ColorRepresentation;
  collide?: boolean;
  /** Override bake: brightness multiplier (e.g. emissive-ish brass). */
  gain?: number;
}

const tmpN = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpL = new THREE.Color();

export class Sink {
  private parts = new Map<MatKey, THREE.BufferGeometry[]>();
  readonly colliders: THREE.BufferGeometry[] = [];

  /** Add a geometry (already in local space) transformed by `matrix` into world space. */
  add(mat: MatKey, geom: THREE.BufferGeometry, matrix?: THREE.Matrix4, opts: AddOpts = {}) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const spec = specFor(mat);
    if (!spec.keepUV || !g.attributes.uv) worldUV(g);
    const tint = new THREE.Color(opts.tint ?? 0xffffff).multiplyScalar(opts.gain ?? 1);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(g);
    if (opts.collide) this.colliders.push(stripForCollision(g));
    return g;
  }

  /** Axis-aligned box from min to max corners, subdivided ~every `seg` metres for the bake. */
  box(mat: MatKey, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: AddOpts = {}, seg = 2) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 0 || h <= 0 || d <= 0) return;
    const geo = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / seg)), Math.max(1, Math.ceil(h / seg)), Math.max(1, Math.ceil(d / seg)));
    this.add(mat, geo, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), opts);
  }

  /** Collision-only box. */
  collideBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.colliders.push(stripForCollision(geo));
  }

  collideGeometry(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    this.colliders.push(stripForCollision(g));
  }

  /** Bake, merge and return one mesh per material. */
  build(light: RoomLight | null, name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      const spec = specFor(mat);
      if (light && !spec.unbaked) for (const g of list) bake(g, light);
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material(mat));
      mesh.name = `${name}:${mat}`;
      mesh.matrixAutoUpdate = false;
      if (spec.transparent) mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  }
}

function stripForCollision(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const src = g.index ? g.toNonIndexed() : g;
  out.setAttribute('position', src.attributes.position.clone());
  return out;
}

/** UVs in metres from a box projection chosen by the face normal. */
export function worldUV(g: THREE.BufferGeometry) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (nx >= nz) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Analytic "bake": hemisphere + sun + light pools + height AO, multiplied into the tint. */
export function bake(g: THREE.BufferGeometry, L: RoomLight) {
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color as THREE.BufferAttribute;
  const height = Math.max(1, L.ceilY - L.floorY);
  for (let i = 0; i < pos.count; i++) {
    tmpP.fromBufferAttribute(pos, i);
    tmpN.fromBufferAttribute(nor, i).normalize();
    const up = tmpN.y;
    // Hemisphere.
    tmpL.copy(L.ground).lerp(L.sky, 0.5 + 0.5 * up);
    // Sun.
    const sd = Math.max(0, -tmpN.dot(L.sunDir));
    tmpL.r += L.sun.r * sd; tmpL.g += L.sun.g * sd; tmpL.b += L.sun.b * sd;
    // Pools (skylight spots, exhibit spots, fluorescent tubes).
    for (const p of L.pools) {
      tmpD.subVectors(p.pos, tmpP);
      const d = tmpD.length();
      if (d > p.radius) continue;
      const f = (1 - d / p.radius) ** 2;
      const facing = 0.35 + 0.65 * Math.max(0, tmpN.dot(tmpD.normalize()));
      tmpL.r += p.color.r * f * facing; tmpL.g += p.color.g * f * facing; tmpL.b += p.color.b * f * facing;
    }
    // Height: skylit rooms glow toward the top; contact darkening near the floor.
    const h = (tmpP.y - L.floorY) / height;
    let k = 1 + L.topLift * Math.min(1, Math.max(0, h)) ** 1.5;
    if (Math.abs(up) < 0.5) k *= 0.62 + 0.38 * smooth(0, 1.4, tmpP.y - L.floorY);
    if (up < -0.5) k *= 0.8;
    tmpC.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    col.setXYZ(i, tmpC.r * tmpL.r * k, tmpC.g * tmpL.g * k, tmpC.b * tmpL.b * k);
  }
  col.needsUpdate = true;
}
