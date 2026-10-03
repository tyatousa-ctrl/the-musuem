import * as THREE from 'three';

/**
 * Procedural placeholder textures. Each is a small tile that repeats in world
 * space (UVs are in metres; `metres` is the tile's real-world size). Real CC0
 * materials from Poly Haven / ambientCG replace these through the asset manifest.
 */

type Paint = (g: CanvasRenderingContext2D, s: number, rand: () => number) => void;

export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(size: number, paint: Paint, seed = 1, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  paint(g, size, seeded(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noise(g: CanvasRenderingContext2D, s: number, rand: () => number, n: number, alpha: number, light = true) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    const r = 1 + rand() * 2.5;
    g.fillRect(rand() * s, rand() * s, r, r);
  }
}

/** Limestone ashlar: courses 0.6 m high, blocks 1.2 m long, 2.4 m tile. Joints sell the scale. */
const limestone: Paint = (g, s, rand) => {
  g.fillStyle = '#ece4d6';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 2400, 0.05, false);
  noise(g, s, rand, 1200, 0.06, true);
  const rows = 4, cols = 2;
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * s;
    // Faint per-block tone variation.
    for (let c = 0; c <= cols; c++) {
      const x = ((c + (r % 2) * 0.5) / cols) * s;
      g.fillStyle = `rgba(${rand() < 0.5 ? '120,100,80' : '255,250,240'},${0.03 + rand() * 0.04})`;
      g.fillRect(x - s / cols, y, s / cols, s / rows);
    }
    g.fillStyle = 'rgba(110,95,78,0.55)';
    g.fillRect(0, y, s, 2);
    for (let c = 0; c <= cols; c++) {
      const x = ((c + (r % 2) * 0.5) / cols) * s;
      g.fillRect(x - 1, y, 2, s / rows);
    }
  }
};

const plaster: Paint = (g, s, rand) => {
  g.fillStyle = '#f0e9dc';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 1500, 0.035, false);
  noise(g, s, rand, 800, 0.05, true);
};

/** Met-style marble floor: large cream slabs with darker borders and soft veining. */
const marble: Paint = (g, s, rand) => {
  const n = 2;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const dark = (i + j) % 2 === 1;
    g.fillStyle = dark ? '#cdbfa8' : '#efe7d8';
    g.fillRect((i * s) / n, (j * s) / n, s / n, s / n);
    // Veins.
    g.strokeStyle = dark ? 'rgba(90,70,50,0.18)' : 'rgba(120,110,95,0.16)';
    g.lineWidth = 1;
    for (let v = 0; v < 4; v++) {
      g.beginPath();
      let x = (i * s) / n + rand() * (s / n), y = (j * s) / n;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (rand() - 0.5) * 18; y += s / n / 8; g.lineTo(x, y); }
      g.stroke();
    }
  }
  noise(g, s, rand, 900, 0.04, false);
  g.fillStyle = 'rgba(80,65,50,0.35)';
  for (let i = 0; i <= n; i++) { g.fillRect((i * s) / n - 1, 0, 2, s); g.fillRect(0, (i * s) / n - 1, s, 2); }
};

const terrazzo: Paint = (g, s, rand) => {
  g.fillStyle = '#d9d2c4';
  g.fillRect(0, 0, s, s);
  const chips = ['#9a8f7e', '#f7f2e8', '#7c6f5f', '#b9a58a', '#5f584f'];
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = chips[Math.floor(rand() * chips.length)];
    const r = 1 + rand() * 3;
    g.beginPath(); g.arc(rand() * s, rand() * s, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(70,60,50,0.4)';
  g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
};

/** Damask-style wall fabric; white so per-room vertex tint gives the jewel colour. */
const damask: Paint = (g, s, rand) => {
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  const n = 4;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = ((i + 0.5 + (j % 2) * 0.5) / n) * s, cy = ((j + 0.5) / n) * s, r = s / n / 2.6;
    g.beginPath();
    g.ellipse(cx, cy, r * 0.55, r, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(cx, cy, r, r * 0.35, 0, 0, Math.PI * 2);
    g.fill();
  }
  noise(g, s, rand, 700, 0.05, false);
};

const sandstone: Paint = (g, s, rand) => {
  g.fillStyle = '#c9a77a';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 3000, 0.08, false);
  noise(g, s, rand, 1200, 0.07, true);
  g.fillStyle = 'rgba(90,60,30,0.45)';
  for (let r = 0; r < 3; r++) g.fillRect(0, (r / 3) * s, s, 2);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) g.fillRect(((c + (r % 2) * 0.5) / 2) * s, (r / 3) * s, 2, s / 3);
  // Faint carved glyph bands.
  g.fillStyle = 'rgba(80,50,25,0.22)';
  for (let i = 0; i < 26; i++) g.fillRect(rand() * s, rand() * s, 3 + rand() * 6, 6 + rand() * 10);
};

const concreteBlock: Paint = (g, s, rand) => {
  g.fillStyle = '#b8bcb6';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 2500, 0.06, false);
  g.fillStyle = 'rgba(70,75,70,0.5)';
  for (let r = 0; r < 5; r++) g.fillRect(0, (r / 5) * s, s, 2);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) g.fillRect(((c + (r % 2) * 0.5) / 2) * s, (r / 5) * s, 2, s / 5);
};

const concrete: Paint = (g, s, rand) => {
  g.fillStyle = '#9ea19c';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 3000, 0.07, false);
  noise(g, s, rand, 1000, 0.06, true);
};

const wood: Paint = (g, s, rand) => {
  g.fillStyle = '#7b5232';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(${rand() < 0.5 ? '40,22,10' : '160,110,70'},0.18)`;
    g.beginPath();
    const y = rand() * s;
    g.moveTo(0, y);
    g.bezierCurveTo(s * 0.3, y + (rand() - 0.5) * 12, s * 0.6, y + (rand() - 0.5) * 12, s, y);
    g.stroke();
  }
};

const asphalt: Paint = (g, s, rand) => {
  g.fillStyle = '#3c3d40';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 4000, 0.08, true);
};

/** Generic city facade card: brick or stone with rows of windows. */
const facade: Paint = (g, s, rand) => {
  g.fillStyle = '#8a6f5c';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 2000, 0.06, false);
  const cols = 4, rows = 4;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lit = rand() < 0.25;
    g.fillStyle = lit ? '#f3d9a0' : '#2d3440';
    const w = s / cols, h = s / rows;
    g.fillRect(c * w + w * 0.25, r * h + h * 0.2, w * 0.5, h * 0.6);
    g.fillStyle = 'rgba(230,220,200,0.6)';
    g.fillRect(c * w + w * 0.22, r * h + h * 0.8, w * 0.56, 3);
  }
};

const foliage: Paint = (g, s, rand) => {
  g.fillStyle = '#3f5e2e';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${60 + rand() * 60},${90 + rand() * 70},${30 + rand() * 30},0.6)`;
    g.beginPath(); g.arc(rand() * s, rand() * s, 2 + rand() * 5, 0, Math.PI * 2); g.fill();
  }
};

const bone: Paint = (g, s, rand) => {
  g.fillStyle = '#b9a789';
  g.fillRect(0, 0, s, s);
  noise(g, s, rand, 2000, 0.1, false);
};

export type TexKey =
  | 'limestone' | 'plaster' | 'marble' | 'terrazzo' | 'damask' | 'sandstone'
  | 'block' | 'concrete' | 'wood' | 'asphalt' | 'facade' | 'foliage' | 'bone';

const painters: Record<TexKey, [Paint, number]> = {
  limestone: [limestone, 512], plaster: [plaster, 256], marble: [marble, 512], terrazzo: [terrazzo, 256],
  damask: [damask, 256], sandstone: [sandstone, 512], block: [concreteBlock, 256], concrete: [concrete, 256],
  wood: [wood, 256], asphalt: [asphalt, 256], facade: [facade, 256], foliage: [foliage, 128], bone: [bone, 128],
};

const cache = new Map<TexKey, THREE.Texture>();
export function texture(key: TexKey): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    const [paint, size] = painters[key];
    t = canvasTexture(size, paint, key.length * 7919);
    cache.set(key, t);
  }
  return t;
}

/** Soft radial gradient used for light shafts, blob shadows and glows. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

/** Vertical gradient for light-shaft cards: bright at top, fading down. */
export function shaftTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, 'rgba(255,248,230,0.55)');
    grad.addColorStop(1, 'rgba(255,248,230,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const h = g.createLinearGradient(0, 0, s, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.5, 'rgba(0,0,0,0)');
    h.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = h;
    g.fillRect(0, 0, s, s);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Sky gradient for the sky dome. */
export function skyTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, (g, s, rand) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#5b8fc9');
    grad.addColorStop(0.42, '#a9c8e6');
    grad.addColorStop(0.5, '#efe6d6');
    grad.addColorStop(1, '#cfc6b8');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    // A few soft clouds.
    for (let i = 0; i < 14; i++) {
      const x = rand() * s, y = s * (0.12 + rand() * 0.28), r = 10 + rand() * 26;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, 'rgba(255,255,255,0.55)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
