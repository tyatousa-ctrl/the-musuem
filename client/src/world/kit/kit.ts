import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Parametric architecture kit (brief §6.5). Every function returns geometry in
 * a local frame; room builders place it. Mouldings matter more than polygons.
 */

const V2 = (x: number, y: number) => new THREE.Vector2(x, y);

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  return mergeGeometries(clean, false)!;
}

// ─── Columns ──────────────────────────────────────────────────────────────────
/** Fluted shaft cross-section. */
function flutedShape(r: number, flutes: number): THREE.Shape {
  const s = new THREE.Shape();
  const steps = flutes * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = i % 4 === 2 ? 0.93 : i % 4 === 0 ? 1 : 0.965;
    const p = V2(Math.cos(a) * r * k, Math.sin(a) * r * k);
    if (i === 0) s.moveTo(p.x, p.y); else s.lineTo(p.x, p.y);
  }
  return s;
}

/**
 * Classical column standing at the origin. Corinthian gets a flared bell
 * capital with corner volutes; Doric a simple echinus.
 */
export function column(height: number, radius: number, order: 'corinthian' | 'doric' = 'corinthian', flutes = 20): THREE.BufferGeometry {
  const baseH = radius * 0.9, capH = order === 'corinthian' ? radius * 2.4 : radius * 0.9;
  const shaftH = height - baseH - capH;
  const parts: THREE.BufferGeometry[] = [];
  // Attic base: plinth, torus, scotia, torus.
  const base = new THREE.LatheGeometry([
    V2(0, 0), V2(radius * 1.45, 0), V2(radius * 1.45, baseH * 0.3), V2(radius * 1.38, baseH * 0.38),
    V2(radius * 1.4, baseH * 0.5), V2(radius * 1.2, baseH * 0.62), V2(radius * 1.12, baseH * 0.72),
    V2(radius * 1.2, baseH * 0.85), V2(radius * 1.05, baseH), V2(0, baseH),
  ], 20);
  parts.push(base);
  const shaft = new THREE.ExtrudeGeometry(flutedShape(radius, flutes), { depth: shaftH, bevelEnabled: false, curveSegments: 2 });
  shaft.rotateX(-Math.PI / 2);
  shaft.translate(0, baseH, 0);
  parts.push(shaft);
  const y0 = baseH + shaftH;
  if (order === 'corinthian') {
    const bell = new THREE.LatheGeometry([
      V2(radius * 1.04, 0), V2(radius * 1.08, capH * 0.08), V2(radius * 1.02, capH * 0.12),
      V2(radius * 1.12, capH * 0.45), V2(radius * 1.3, capH * 0.75), V2(radius * 1.45, capH * 0.86), V2(0, capH * 0.86),
    ], 20);
    bell.translate(0, y0, 0);
    parts.push(bell);
    // Acanthus leaf tiers suggested by small boxes around the bell.
    for (let tier = 0; tier < 2; tier++) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + tier * Math.PI / 8;
      const leaf = new THREE.BoxGeometry(radius * 0.42, capH * 0.32, radius * 0.18);
      leaf.rotateX(-0.35);
      leaf.translate(0, 0, radius * (1.12 + tier * 0.1));
      leaf.rotateY(a);
      leaf.translate(0, y0 + capH * (0.22 + tier * 0.25), 0);
      parts.push(leaf);
    }
    // Corner volutes and abacus.
    for (let i = 0; i < 4; i++) {
      const vol = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, radius * 0.25, 10);
      vol.rotateZ(Math.PI / 2);
      vol.translate(radius * 1.25, y0 + capH * 0.78, 0);
      vol.rotateY(Math.PI / 4 + (i * Math.PI) / 2);
      parts.push(vol);
    }
    const abacus = new THREE.BoxGeometry(radius * 3.1, capH * 0.14, radius * 3.1);
    abacus.translate(0, y0 + capH * 0.93, 0);
    parts.push(abacus);
  } else {
    const echinus = new THREE.LatheGeometry([V2(radius * 1.02, 0), V2(radius * 1.3, capH * 0.5), V2(0, capH * 0.5)], 20);
    echinus.translate(0, y0, 0);
    parts.push(echinus);
    const abacus = new THREE.BoxGeometry(radius * 2.8, capH * 0.5, radius * 2.8);
    abacus.translate(0, y0 + capH * 0.75, 0);
    parts.push(abacus);
  }
  return merge(parts);
}

// ─── Mouldings ────────────────────────────────────────────────────────────────
/** Profiles in (out, up) metres. Out is away from the wall face. */
export const PROFILES = {
  skirting: [[0, 0], [0.07, 0], [0.07, 0.2], [0.04, 0.24], [0.04, 0.28], [0, 0.3]] as [number, number][],
  dado: [[0, 0], [0.04, 0.02], [0.05, 0.06], [0.03, 0.1], [0, 0.12]] as [number, number][],
  cornice: [[0, 0], [0.08, 0.06], [0.1, 0.18], [0.22, 0.3], [0.3, 0.42], [0.55, 0.55], [0.6, 0.7], [0.62, 0.8], [0, 0.8]] as [number, number][],
  architrave: [[0, 0], [0.06, 0], [0.08, 0.05], [0.1, 0.18], [0.12, 0.3], [0, 0.3]] as [number, number][],
  stringCourse: [[0, 0], [0.12, 0.04], [0.18, 0.14], [0.2, 0.26], [0, 0.3]] as [number, number][],
};

/**
 * A moulding running along +x from 0 to `length`, projecting toward +z,
 * scaled by `scale`. Use in wall-local frames (u along, v up, w out).
 */
export function moulding(profile: [number, number][], length: number, scale = 1): THREE.BufferGeometry {
  const s = new THREE.Shape(profile.map(([o, h]) => V2(o * scale, h * scale)));
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, curveSegments: 1 });
  // Shape X (out) → +z, extrusion (+z) → +x.
  g.rotateY(Math.PI / 2);
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1));
  flipWinding(g);
  return g;
}

export function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) {
    const idx = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
  } else {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
        const s = attr.itemSize;
        for (let k = 0; k < s; k++) {
          const a = attr.array[(i + 1) * s + k];
          attr.array[(i + 1) * s + k] = attr.array[(i + 2) * s + k];
          attr.array[(i + 2) * s + k] = a;
        }
      }
    }
  }
  g.computeVertexNormals();
}

// ─── Arches, domes, vaults ────────────────────────────────────────────────────
/**
 * Spandrel infill over a round-arched opening, centred on u = 0, spanning
 * `width`, from the spring line to `top`, `depth` thick (w from -depth to 0).
 */
export function archInfill(width: number, spring: number, top: number, depth: number): THREE.BufferGeometry {
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, spring);
  s.absarc(0, spring, r, Math.PI, 0, true);
  s.lineTo(r, top);
  s.lineTo(-r, top);
  s.lineTo(-r, spring);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -depth);
  return g;
}

/** Archivolt: a moulded ring tracing an arch, for door surrounds. */
export function archivolt(r: number, spring: number, band: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, spring, r + band, Math.PI, 0, true);
  s.lineTo(r, spring);
  s.absarc(0, spring, r, 0, Math.PI, false);
  s.lineTo(-r - band, spring);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 });
  return g;
}

/** Saucer dome seen from below, with an oculus. Origin at the centre of its base ring. */
export function saucerDome(baseR: number, rise: number, oculusR: number, segs = 28): THREE.BufferGeometry {
  const R = (baseR * baseR + rise * rise) / (2 * rise);
  const thetaEnd = Math.asin(baseR / R), thetaStart = Math.asin(oculusR / R);
  const g = new THREE.SphereGeometry(R, segs, 8, 0, Math.PI * 2, thetaStart, thetaEnd - thetaStart);
  g.translate(0, rise - R, 0);
  flipWinding(g);
  return g;
}

/** Barrel vault spanning x ∈ [-w/2, w/2], running along z for `length`, seen from inside. */
export function barrelVault(width: number, rise: number, length: number, segs = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = Math.PI * (1 - t);
    pts.push(V2(Math.cos(a) * width / 2, Math.sin(a) * rise));
  }
  const pos: number[] = [];
  const zs = Math.max(1, Math.ceil(length / 3));
  for (let j = 0; j < zs; j++) {
    const z0 = (j / zs) * length - length / 2, z1 = ((j + 1) / zs) * length - length / 2;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[i + 1];
      pos.push(a.x, a.y, z0, b.x, b.y, z1, b.x, b.y, z0, a.x, a.y, z0, a.x, a.y, z1, b.x, b.y, z1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flipWinding(g); // face inward, seen from below
  return g;
}

/** Downward-facing ceiling with a grid of coffers (recessed panels framed by beams). */
export function cofferedCeiling(w: number, d: number, cell: number, beam = 0.35, depth = 0.45): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const plane = new THREE.PlaneGeometry(w, d, Math.ceil(w / 2), Math.ceil(d / 2));
  plane.rotateX(Math.PI / 2);
  plane.translate(0, depth, 0);
  parts.push(plane);
  for (let x = -w / 2; x <= w / 2 + 1e-3; x += cell) {
    const b = new THREE.BoxGeometry(beam, depth, d);
    b.translate(x, depth / 2, 0);
    parts.push(b);
  }
  for (let z = -d / 2; z <= d / 2 + 1e-3; z += cell) {
    const b = new THREE.BoxGeometry(w, depth, beam);
    b.translate(0, depth / 2, z);
    parts.push(b);
  }
  return merge(parts);
}

// ─── Stairs and railings ──────────────────────────────────────────────────────
/** Step treads for a stair in world coordinates. */
export function stairSteps(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, dir: '+x' | '-x' | '+z' | '-z', riser = 0.17, open = false): THREE.BufferGeometry {
  const rise = y1 - y0;
  const n = Math.max(2, Math.round(rise / riser));
  const parts: THREE.BufferGeometry[] = [];
  const alongX = dir === '+x' || dir === '-x';
  const run = alongX ? x1 - x0 : z1 - z0;
  const tread = run / n;
  for (let i = 0; i < n; i++) {
    const top = y0 + (rise * (i + 1)) / n;
    // Open treads (metal stairs) are thin plates; solid stairs fill down to the floor.
    const h = open ? 0.06 : top - (y0 - 0.25);
    let geo: THREE.BufferGeometry;
    if (alongX) {
      const start = dir === '+x' ? x0 + i * tread : x1 - (i + 1) * tread;
      geo = new THREE.BoxGeometry(tread + 0.02, h, z1 - z0);
      geo.translate(start + tread / 2, open ? top - 0.03 : (top + y0 - 0.25) / 2, (z0 + z1) / 2);
    } else {
      const start = dir === '+z' ? z0 + i * tread : z1 - (i + 1) * tread;
      geo = new THREE.BoxGeometry(x1 - x0, h, tread + 0.02);
      geo.translate((x0 + x1) / 2, open ? top - 0.03 : (top + y0 - 0.25) / 2, start + tread / 2);
    }
    parts.push(geo);
  }
  if (open) {
    // Two sloped stringers carry the treads.
    const len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    for (const side of [0, 1]) {
      const sg = new THREE.BoxGeometry(alongX ? len : 0.08, 0.3, alongX ? 0.08 : len);
      if (alongX) sg.rotateZ(dir === '+x' ? ang : -ang); else sg.rotateX(dir === '+z' ? -ang : ang);
      const cx = alongX ? (x0 + x1) / 2 : side ? x1 - 0.04 : x0 + 0.04;
      const cz = alongX ? (side ? z1 - 0.04 : z0 + 0.04) : (z0 + z1) / 2;
      sg.translate(cx, (y0 + y1) / 2 - 0.1, cz);
      parts.push(sg);
    }
  }
  return merge(parts);
}

/** Railing from (x0,z0,ya) to (x1,z1,yb). */
export function railing(x0: number, z0: number, ya: number, x1: number, z1: number, yb: number, style: 'balustrade' | 'metal' | 'glass', height = 1.05): { solid: THREE.BufferGeometry; glass?: THREE.BufferGeometry } {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(z1 - z0, x1 - x0);
  const slope = Math.atan2(yb - ya, len);
  const at = (t: number) => new THREE.Vector3(x0 + (x1 - x0) * t, ya + (yb - ya) * t, z0 + (z1 - z0) * t);
  const parts: THREE.BufferGeometry[] = [];
  const bar = (yOff: number, thick: number, width: number) => {
    const g = new THREE.BoxGeometry(Math.hypot(len, yb - ya), thick, width);
    g.rotateZ(slope);
    g.rotateY(-ang);
    const m = at(0.5);
    g.translate(m.x, m.y + yOff, m.z);
    parts.push(g);
  };
  let glass: THREE.BufferGeometry | undefined;
  if (style === 'balustrade') {
    bar(height - 0.06, 0.12, 0.26); // handrail
    bar(0.06, 0.12, 0.24); // base
    const n = Math.max(2, Math.round(len / 0.32));
    for (let i = 0; i <= n; i++) {
      const p = at(i / n);
      const b = new THREE.CylinderGeometry(0.045, 0.06, height - 0.18, 6);
      b.translate(p.x, p.y + height / 2, p.z);
      parts.push(b);
    }
  } else {
    bar(height, 0.05, 0.06);
    bar(height * 0.5, 0.03, 0.03);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const p = at(i / n);
      const b = new THREE.BoxGeometry(0.05, height, 0.05);
      b.translate(p.x, p.y + height / 2, p.z);
      parts.push(b);
    }
    if (style === 'glass') {
      const gl = new THREE.PlaneGeometry(Math.hypot(len, yb - ya), height * 0.9);
      gl.rotateZ(slope);
      gl.rotateY(-ang);
      const m = at(0.5);
      gl.translate(m.x, m.y + height * 0.5, m.z);
      glass = gl;
    }
  }
  return { solid: merge(parts), glass };
}

// ─── Furniture and exhibits ───────────────────────────────────────────────────
/** Museum bench: wood top on dark legs, centred at the origin, length along x. */
export function bench(length: number): { wood: THREE.BufferGeometry; legs: THREE.BufferGeometry } {
  const top = new THREE.BoxGeometry(length, 0.08, 0.55);
  top.translate(0, 0.43, 0);
  const cushion = new THREE.BoxGeometry(length - 0.1, 0.05, 0.48);
  cushion.translate(0, 0.49, 0);
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.BoxGeometry(0.08, 0.4, 0.45);
    l.translate(sx * (length / 2 - 0.15), 0.2, 0);
    legs.push(l);
  }
  return { wood: merge([top, cushion]), legs: merge(legs) };
}

/** Brass stanchion post. */
export function stanchion(): THREE.BufferGeometry {
  return new THREE.LatheGeometry([V2(0, 0), V2(0.17, 0), V2(0.17, 0.03), V2(0.04, 0.06), V2(0.025, 0.1), V2(0.025, 0.9), V2(0.05, 0.93), V2(0.04, 0.98), V2(0, 1)], 10);
}

/** Gilt picture frame of outer size w × h, `band` wide, facing +z, centred at origin. */
export function pictureFrame(w: number, h: number, band: number, depth = 0.08): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const side = (sw: number, sh: number, x: number, y: number) => {
    const g = new THREE.BoxGeometry(sw, sh, depth);
    g.translate(x, y, depth / 2);
    parts.push(g);
    const lip = new THREE.BoxGeometry(sw * (sw > sh ? 1 : 0.4), sh * (sh > sw ? 1 : 0.4), depth * 0.5);
    lip.translate(x, y, depth + depth * 0.2);
    parts.push(lip);
  };
  side(w, band, 0, h / 2 - band / 2);
  side(w, band, 0, -h / 2 + band / 2);
  side(band, h - band * 2, -w / 2 + band / 2, 0);
  side(band, h - band * 2, w / 2 - band / 2, 0);
  return merge(parts);
}

/** Canvas quad with atlas UVs, facing +z. */
export function canvasQuad(w: number, h: number, rect: [number, number, number, number]): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
  return g;
}

/** Glass vitrine: plinth, bronze edge frame and glass box. Origin at floor centre. */
export function vitrine(w: number, d: number, plinthH: number, glassH: number): { plinth: THREE.BufferGeometry; frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const plinth = new THREE.BoxGeometry(w, plinthH, d);
  plinth.translate(0, plinthH / 2, 0);
  const t = 0.025;
  const frames: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.BoxGeometry(t, glassH, t);
    post.translate((sx * w) / 2, plinthH + glassH / 2, (sz * d) / 2);
    frames.push(post);
  }
  for (const sz of [-1, 1]) { const b = new THREE.BoxGeometry(w, t, t); b.translate(0, plinthH + glassH, (sz * d) / 2); frames.push(b); }
  for (const sx of [-1, 1]) { const b = new THREE.BoxGeometry(t, t, d); b.translate((sx * w) / 2, plinthH + glassH, 0); frames.push(b); }
  const glass = new THREE.BoxGeometry(w, glassH, d);
  glass.translate(0, plinthH + glassH / 2, 0);
  return { plinth, frame: merge(frames), glass };
}

/** Potted floral arrangement: urn + foliage mass. */
export function flowers(): { urn: THREE.BufferGeometry; leaves: THREE.BufferGeometry; blooms: THREE.BufferGeometry } {
  const urn = new THREE.LatheGeometry([V2(0, 0), V2(0.35, 0), V2(0.3, 0.1), V2(0.42, 0.5), V2(0.5, 0.85), V2(0.45, 0.9), V2(0, 0.9)], 14);
  const leaves = new THREE.IcosahedronGeometry(0.95, 1);
  leaves.scale(1.1, 1.3, 1.1);
  leaves.translate(0, 1.85, 0);
  const blooms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, y = 1.4 + (i % 5) * 0.28, r = 0.75 + (i % 3) * 0.2;
    const b = new THREE.IcosahedronGeometry(0.16, 0);
    b.translate(Math.cos(a) * r, y + 0.4, Math.sin(a) * r);
    blooms.push(b);
  }
  return { urn, leaves, blooms: merge(blooms) };
}

/** Low-poly street tree: trunk + canopy. */
export function tree(h: number): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, h * 0.5, 6);
  trunk.translate(0, h * 0.25, 0);
  const canopy = new THREE.IcosahedronGeometry(h * 0.32, 1);
  canopy.scale(1, 1.15, 1);
  canopy.translate(0, h * 0.68, 0);
  return { trunk, canopy };
}

export { merge as mergeParts };
