import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Insurance Fraud destructibles (brief §18): one merged, vertex-coloured mesh
 * per object (one draw call each), built from primitives and cached per
 * variant. The origin is the floor under the object; +z faces the viewer.
 */
type Part = THREE.BufferGeometry;

function paint(g: Part, color: number): Part {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 12) => paint(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), color);
/** A flat disc facing +z. */
const disc = (r: number, x: number, y: number, z: number, color: number) => paint(new THREE.CylinderGeometry(r, r, 0.02, 20).rotateX(Math.PI / 2).translate(x, y, z), color);
const sphere = (r: number, x: number, y: number, z: number, color: number) => paint(new THREE.SphereGeometry(r, 12, 8).translate(x, y, z), color);
const lathe = (profile: number[], step: number, y0: number, color: number) =>
  paint(new THREE.LatheGeometry(profile.map((r, i) => new THREE.Vector2(Math.max(0.001, r), y0 + i * step)), 14), color);
const merge = (parts: Part[]) => mergeGeometries(parts.map((p) => {
  // Lathe and sphere geometries carry uvs/normals; strip to position+normal+color so they merge.
  const g = p.index ? p.toNonIndexed() : p;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}))!;

const MARBLE = 0xe9e3d6, GOLD = 0xc9a24f, BRONZE = 0x7a5a2a, WOOD = 0x6b3f22, BONE = 0xe8dcc0, STEEL = 0x8a8f96, DARK = 0x2a2420;
const pedestal = () => box(0.5, 0.9, 0.5, 0, 0.45, 0, MARBLE);

function canvasArt(w: number, h: number, seed: number, z: number, y: number): Part[] {
  // A few bold colour fields so paintings read from across a room.
  const hues = [0x8a3b2a, 0x2f5aa8, 0xd9a43a, 0x3d6b45, 0x6b3f7a, 0xe8d8b0];
  const parts: Part[] = [box(w, h, 0.02, 0, y, z, hues[seed % hues.length])];
  for (let i = 0; i < 3; i++) {
    const cw = w * (0.25 + ((seed * (i + 3)) % 5) * 0.08), ch = h * (0.2 + ((seed * (i + 2)) % 4) * 0.1);
    const cx = (((seed * (i + 7)) % 9) / 9 - 0.5) * (w - cw), cy = (((seed * (i + 5)) % 7) / 7 - 0.5) * (h - ch);
    parts.push(box(cw, ch, 0.025, cx, y + cy, z + 0.003, hues[(seed + i + 1) % hues.length]));
  }
  return parts;
}

const BUILDERS: Record<string, () => Part> = {
  vase: () => merge([pedestal(), lathe([0.05, 0.11, 0.15, 0.14, 0.09, 0.06, 0.08], 0.07, 0.9, 0x2f5aa8), cyl(0.155, 0.155, 0.05, 0, 1.07, 0, 0xf0ece4)]),
  urn: () => merge([pedestal(), lathe([0.1, 0.17, 0.21, 0.2, 0.15, 0.12, 0.15], 0.07, 0.9, 0x5c7a5a), cyl(0.07, 0.07, 0.04, 0, 1.4, 0, GOLD)]),
  amphora: () => merge([pedestal(), lathe([0.03, 0.12, 0.17, 0.16, 0.11, 0.06, 0.06, 0.08], 0.065, 0.9, 0xb5653a), cyl(0.172, 0.172, 0.06, 0, 1.12, 0, 0x1a1410),
    box(0.3, 0.03, 0.03, 0, 1.28, 0, 0xb5653a)]),
  bust: () => merge([pedestal(), box(0.38, 0.22, 0.22, 0, 1.01, 0, 0xf0ece4), cyl(0.06, 0.07, 0.12, 0, 1.17, 0, 0xf0ece4), sphere(0.12, 0, 1.33, 0, 0xf0ece4)]),
  clock: () => merge([box(0.62, 2.1, 0.42, 0, 1.05, 0, WOOD), box(0.5, 0.06, 0.44, 0, 2.13, 0, GOLD), disc(0.2, 0, 1.72, 0.22, 0xf3ead9),
    box(0.02, 0.15, 0.01, 0, 1.76, 0.235, DARK), box(0.28, 0.9, 0.02, 0, 0.95, 0.215, 0x3a2414), disc(0.07, 0, 0.75, 0.23, GOLD)]),
  painting: () => merge([box(1.46, 1.16, 0.08, 0, 1.35, 0, GOLD), ...canvasArt(1.3, 1.0, 3, 0.045, 1.35), box(0.06, 0.8, 0.06, -0.5, 0.4, -0.15, DARK), box(0.06, 0.8, 0.06, 0.5, 0.4, -0.15, DARK), box(1.1, 0.05, 0.4, 0, 0.78, -0.1, DARK)]),
  masterpiece: () => merge([box(1.96, 1.56, 0.1, 0, 1.5, 0, GOLD), ...canvasArt(1.76, 1.36, 7, 0.055, 1.5), box(2.4, 0.7, 0.7, 0, 0.35, -0.2, 0x5a1a22), box(0.08, 0.06, 0.4, 0, 0.73, 0.1, GOLD)]),
  statue: () => merge([box(0.8, 0.6, 0.8, 0, 0.3, 0, 0xcfc7b6), cyl(0.18, 0.24, 0.9, 0, 1.05, 0, BRONZE), cyl(0.1, 0.12, 0.55, 0.12, 0.88, 0, BRONZE), sphere(0.15, 0, 1.68, 0, BRONZE),
    paint(new THREE.BoxGeometry(0.55, 0.1, 0.1).rotateZ(0.6).translate(-0.22, 1.5, 0), BRONZE), box(0.2, 0.25, 0.14, 0, 1.3, 0.08, BRONZE)]),
  anchor: () => merge([box(0.5, 0.06, 0.5, 0, 0.03, 0, STEEL), cyl(0.05, 0.06, 0.5, 0, 0.3, 0, STEEL), box(0.2, 0.08, 0.08, 0, 0.5, 0, 0xd8b23a)]),
  canvas: () => merge([box(6.2, 4.2, 0.16, 0, 2.6, 0, GOLD), ...canvasArt(5.8, 3.8, 11, 0.09, 2.6), box(0.12, 2.0, 1.4, -2.4, 1.0, -0.6, DARK), box(0.12, 2.0, 1.4, 2.4, 1.0, -0.6, DARK),
    box(5.2, 0.12, 0.12, 0, 0.6, -1.2, DARK)]),
  gate: () => {
    const blue = 0x2a5fa0, band = 0xd9b23a;
    const parts = [box(1.3, 5.2, 1.3, -2.4, 2.6, 0, blue), box(1.3, 5.2, 1.3, 2.4, 2.6, 0, blue), box(6.2, 1.2, 1.4, 0, 5.8, 0, blue), box(6.3, 0.15, 1.45, 0, 5.15, 0, band)];
    for (let i = 0; i < 4; i++) parts.push(box(1.34, 0.12, 1.34, -2.4, 1 + i * 1.1, 0, band), box(1.34, 0.12, 1.34, 2.4, 1 + i * 1.1, 0, band));
    // Two striding lions in relief on the pillars.
    for (const x of [-2.4, 2.4]) parts.push(box(0.9, 0.5, 0.06, x, 3.2, 0.68, band), sphere(0.2, x + 0.38, 3.45, 0.7, band));
    return merge(parts);
  },
  mammoth: () => {
    const parts: Part[] = [box(5.6, 0.4, 2.0, 0, 0.2, 0, 0x8a7a5a)]; // low plinth
    // Spine, ribs, legs, skull and tusks, in bone.
    parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, 4.0, 8).rotateZ(Math.PI / 2).translate(0, 3.05, 0), BONE));
    for (let i = 0; i < 9; i++) {
      const x = -1.6 + i * 0.4, h = 1.2 - Math.abs(i - 4) * 0.08;
      parts.push(paint(new THREE.TorusGeometry(0.75, 0.035, 5, 14, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).scale(1, h / 0.75, 1).translate(x, 3.05, 0), BONE));
    }
    for (const [x, z] of [[-1.5, -0.55], [-1.5, 0.55], [1.4, -0.55], [1.4, 0.55]]) parts.push(cyl(0.11, 0.08, 2.6, x, 1.7, z, BONE, 8), sphere(0.13, x, 3.0, z, BONE));
    parts.push(sphere(0.55, 2.55, 3.15, 0, BONE), box(0.5, 0.6, 0.6, 2.95, 2.75, 0, BONE));
    for (const z of [-0.3, 0.3]) parts.push(paint(new THREE.TorusGeometry(0.8, 0.07, 6, 12, Math.PI * 0.9).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI).translate(3.2, 2.2, z), 0xf3ecd8));
    parts.push(paint(new THREE.CylinderGeometry(0.05, 0.02, 1.4, 6).rotateZ(-1.0).translate(-2.6, 2.7, 0), BONE)); // tail
    return merge(parts);
  },
};

const cache = new Map<string, Part>();
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const rubbleMat = new THREE.MeshLambertMaterial({ color: 0x9a8f80 });

export function destructibleMesh(variant: string): THREE.Mesh {
  let g = cache.get(variant);
  if (!g) { g = (BUILDERS[variant] ?? BUILDERS.vase)(); g.computeBoundingSphere(); cache.set(variant, g); }
  return new THREE.Mesh(g, material);
}

/** A low heap of broken pieces sized to the original. */
export function rubbleMesh(variant: string): THREE.Mesh {
  const s = SIZE[variant] ?? SIZE.vase;
  const g = mergeGeometries(Array.from({ length: 6 }, (_, i) => {
    const w = 0.2 + (i % 3) * 0.12;
    return new THREE.BoxGeometry(w, 0.08 + (i % 2) * 0.06, w * 0.8).rotateY(i * 1.3)
      .translate(Math.cos(i * 2.1) * s[0] * 0.6, 0.06, Math.sin(i * 2.1) * s[1] * 0.6);
  }))!;
  return new THREE.Mesh(g, rubbleMat);
}

/** Half-extents (x, z) and height of the solid part players bump into. */
export const SIZE: Record<string, [number, number, number]> = {
  vase: [0.25, 0.25, 1.3], urn: [0.25, 0.25, 1.4], amphora: [0.25, 0.25, 1.4], bust: [0.25, 0.25, 1.5],
  clock: [0.31, 0.21, 2.15], painting: [0.6, 0.3, 1.9], masterpiece: [1.2, 0.55, 2.3], statue: [0.4, 0.4, 1.9],
  anchor: [0.25, 0.25, 0.55], canvas: [3.1, 1.3, 4.7], gate: [3.1, 0.7, 6.4], mammoth: [2.8, 1.0, 3.7],
};

/** Price tag sprite: "$26,000" on a museum label card. */
const tagCache = new Map<string, THREE.SpriteMaterial>();
export function priceTag(text: string, sub: string): THREE.Sprite {
  const key = `${text}|${sub}`;
  let mat = tagCache.get(key);
  if (!mat) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 112;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgba(250,246,236,0.95)'; x.beginPath(); x.roundRect(4, 4, 248, 104, 14); x.fill();
    x.strokeStyle = '#2a2118'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#1d5a2e'; x.font = 'bold 44px Georgia, serif'; x.textAlign = 'center'; x.fillText(text, 128, 54);
    x.fillStyle = '#4a3b2a'; x.font = 'italic 22px Georgia, serif'; x.fillText(sub, 128, 90);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
    tagCache.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(0.55, 0.24, 1);
  return s;
}
