import * as THREE from 'three';
import { seeded } from './textures';

/**
 * Artwork catalogue (brief §8.3). `tools/fetch-met-art.ts` writes
 * `public/assets/art/paintings.json` + atlas images from the Met Collection API.
 * Until it has been run, a procedural placeholder catalogue with the same shape
 * is generated here so the galleries are never empty.
 */
export interface Painting {
  id: string;
  title: string;
  artist: string;
  date: string;
  medium: string;
  /** Real-world size in centimetres (frames are sized from this). */
  widthCm: number;
  heightCm: number;
  /** Atlas index and UV rect [u, v, w, h]. */
  atlas: number;
  rect: [number, number, number, number];
  objectUrl?: string;
  /** Curated room group: 'european' | 'portrait' | 'egypt' | 'cultures'. */
  group: string;
}

export interface ArtCatalogue {
  paintings: Painting[];
  atlases: THREE.Texture[];
  placeholder: boolean;
}

const CELLS = 4; // 4×4 cells per 2048 atlas → 512 px each

type Style = 'landscape' | 'portrait' | 'seascape' | 'still' | 'abstract' | 'relief';

function paintCell(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: Style, rand: () => number) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const pal = [
    ['#2f3b2a', '#6d7a4a', '#c9b37a', '#e9dcb5', '#7f9cb5'],
    ['#2a1d14', '#6b3b22', '#b77a43', '#e3c18c', '#4a5a6a'],
    ['#1d2a3a', '#3f5a73', '#90a9b8', '#e8e1cf', '#b4823f'],
    ['#2b1a20', '#5c2a33', '#a8553f', '#e1b07a', '#f3e6c8'],
  ][Math.floor(rand() * 4)];
  const grad = (y0: number, y1: number, a: string, b: string) => {
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr;
  };
  switch (style) {
    case 'landscape': case 'seascape': {
      const horizon = y + h * (0.45 + rand() * 0.2);
      g.fillStyle = grad(y, horizon, pal[4], pal[3]); g.fillRect(x, y, w, horizon - y);
      if (style === 'seascape') {
        g.fillStyle = grad(horizon, y + h, '#3d5f78', '#1e3346'); g.fillRect(x, horizon, w, y + h - horizon);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        for (let i = 0; i < 40; i++) g.fillRect(x + rand() * w, horizon + rand() * (y + h - horizon), 6 + rand() * 20, 1.5);
        g.fillStyle = '#3a2a1c';
        const sx = x + w * (0.3 + rand() * 0.4);
        g.beginPath(); g.moveTo(sx - 30, horizon + 8); g.lineTo(sx + 30, horizon + 8); g.lineTo(sx + 20, horizon + 20); g.lineTo(sx - 20, horizon + 20); g.fill();
        g.fillStyle = '#efe6d2'; g.beginPath(); g.moveTo(sx, horizon - 50); g.lineTo(sx + 26, horizon + 4); g.lineTo(sx, horizon + 4); g.fill();
      } else {
        for (let k = 0; k < 3; k++) {
          g.fillStyle = pal[k];
          g.beginPath(); g.moveTo(x, y + h);
          const base = horizon + k * h * 0.12;
          for (let i = 0; i <= 10; i++) g.lineTo(x + (i / 10) * w, base - rand() * h * 0.12);
          g.lineTo(x + w, y + h); g.fill();
        }
        for (let i = 0; i < 5; i++) {
          const tx = x + rand() * w, ty = horizon + rand() * h * 0.2;
          g.fillStyle = pal[0];
          g.beginPath(); g.ellipse(tx, ty - 30, 18 + rand() * 14, 34 + rand() * 20, 0, 0, Math.PI * 2); g.fill();
          g.fillRect(tx - 2, ty - 10, 4, 30);
        }
      }
      break;
    }
    case 'portrait': {
      g.fillStyle = grad(y, y + h, pal[1], pal[0]); g.fillRect(x, y, w, h);
      const cx = x + w / 2, cy = y + h * 0.38;
      g.fillStyle = pal[0];
      g.beginPath(); g.ellipse(cx, y + h * 0.9, w * 0.38, h * 0.35, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d9b48f';
      g.beginPath(); g.ellipse(cx, cy, w * 0.13, h * 0.13, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(40,25,15,0.85)';
      g.beginPath(); g.ellipse(cx, cy - h * 0.07, w * 0.15, h * 0.09, 0, Math.PI, Math.PI * 2); g.fill();
      g.fillStyle = '#f2ead8';
      g.beginPath(); g.ellipse(cx, cy + h * 0.17, w * 0.12, h * 0.03, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'still': {
      g.fillStyle = grad(y, y + h, '#2a2018', '#14100b'); g.fillRect(x, y, w, h);
      g.fillStyle = '#5a3d25'; g.fillRect(x, y + h * 0.66, w, h * 0.34);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = [pal[2], pal[3], '#9b2d2d', '#c78d2c', '#6f7d3a'][i % 5];
        g.beginPath(); g.arc(x + w * (0.2 + rand() * 0.6), y + h * (0.55 + rand() * 0.12), 12 + rand() * 22, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'abstract': {
      g.fillStyle = pal[3]; g.fillRect(x, y, w, h);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = pal[Math.floor(rand() * 5)];
        g.globalAlpha = 0.75;
        g.fillRect(x + rand() * w * 0.8, y + rand() * h * 0.8, w * (0.15 + rand() * 0.4), h * (0.1 + rand() * 0.4));
      }
      g.globalAlpha = 1;
      break;
    }
    case 'relief': {
      g.fillStyle = '#c4a57a'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(80,50,25,0.5)';
      for (let r = 0; r < 4; r++) {
        g.fillRect(x, y + (r + 1) * h / 5, w, 2);
        for (let i = 0; i < 9; i++) {
          const fx = x + (i + 0.5) * w / 9, fy = y + r * h / 5 + h / 10;
          g.fillRect(fx - 3, fy - 14, 6, 22);
          g.beginPath(); g.arc(fx, fy - 18, 5, 0, Math.PI * 2); g.fill();
        }
      }
      break;
    }
  }
  // Varnish, craquelure and vignette so it reads as an old painting.
  const v = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,10,0,0.45)');
  g.fillStyle = v; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,230,180,0.06)'; g.fillRect(x, y, w, h);
  g.restore();
}

const TITLES = ['View of the River', 'Portrait of a Lady', 'Harbour at Dawn', 'Still Life with Lemons', 'Composition', 'Procession of Offering Bearers',
  'Evening on the Plain', 'Portrait of a Merchant', 'Ships in a Calm', 'Flowers in a Vase', 'Study in Ochre', 'Wall Relief Fragment'];
const STYLES: Style[] = ['landscape', 'portrait', 'seascape', 'still', 'abstract', 'relief'];

export function placeholderCatalogue(count = 32): ArtCatalogue {
  const perAtlas = CELLS * CELLS;
  const atlases: THREE.Texture[] = [];
  const paintings: Painting[] = [];
  const rand = seeded(1234);
  for (let a = 0; a * perAtlas < count; a++) {
    const c = document.createElement('canvas');
    c.width = c.height = 2048;
    const g = c.getContext('2d')!;
    const cell = 2048 / CELLS;
    for (let k = 0; k < perAtlas && a * perAtlas + k < count; k++) {
      const i = a * perAtlas + k;
      const style = STYLES[i % STYLES.length];
      const portraitish = style === 'portrait' || style === 'still';
      const aspect = portraitish ? 0.75 + rand() * 0.1 : 1.2 + rand() * 0.45;
      // Fit the image in its cell with a little mip padding.
      const pad = 8, cw = cell - pad * 2;
      const pw = aspect >= 1 ? cw : cw * aspect, ph = aspect >= 1 ? cw / aspect : cw;
      const px = (k % CELLS) * cell + pad + (cw - pw) / 2, py = Math.floor(k / CELLS) * cell + pad + (cw - ph) / 2;
      paintCell(g, px, py, pw, ph, style, rand);
      const big = style === 'landscape' || style === 'seascape' ? 1.6 + rand() * 1.4 : 0.6 + rand() * 0.6;
      paintings.push({
        id: `placeholder.${i}`,
        title: TITLES[i % TITLES.length],
        artist: 'Placeholder canvas',
        date: 'run npm run fetch-art',
        medium: 'Procedural pigment on canvas',
        widthCm: Math.round(big * 100 * (aspect >= 1 ? 1 : aspect)),
        heightCm: Math.round(big * 100 * (aspect >= 1 ? 1 / aspect : 1)),
        atlas: a,
        rect: [px / 2048, 1 - (py + ph) / 2048, pw / 2048, ph / 2048],
        group: style === 'relief' ? 'egypt' : style === 'portrait' ? 'portrait' : 'european',
      });
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    atlases.push(t);
  }
  return { paintings, atlases, placeholder: true };
}

/** Load the fetched Met catalogue if present, else fall back to placeholders. */
export async function loadArtCatalogue(): Promise<ArtCatalogue> {
  try {
    const res = await fetch('/assets/art/paintings.json');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { atlases: string[]; paintings: Painting[] };
    const loader = new THREE.TextureLoader();
    const atlases = await Promise.all(data.atlases.map((file) => loader.loadAsync(`/assets/art/${file}`)));
    atlases.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
    return { paintings: data.paintings, atlases, placeholder: false };
  } catch {
    console.warn('[art] paintings.json not found; using procedural placeholders (run `npm run fetch-art`).');
    return placeholderCatalogue();
  }
}

/** Wall labels rendered into one atlas: title, artist, date, medium. */
export function labelAtlas(paintings: Painting[]): { texture: THREE.Texture; rects: Map<string, [number, number, number, number]> } {
  const cols = 4, w = 256, h = 128;
  const rows = Math.ceil(paintings.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * w;
  c.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, rows) * h);
  const g = c.getContext('2d')!;
  const rects = new Map<string, [number, number, number, number]>();
  paintings.forEach((p, i) => {
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    g.fillStyle = '#f4efe6'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = '#1d1a16';
    g.font = 'bold 20px Georgia, serif';
    g.fillText(p.artist.slice(0, 26), x + 12, y + 32);
    g.font = 'italic 18px Georgia, serif';
    g.fillText(p.title.slice(0, 28), x + 12, y + 58);
    g.font = '15px Georgia, serif';
    g.fillStyle = '#4a443c';
    g.fillText(p.date.slice(0, 32), x + 12, y + 82);
    g.fillText(p.medium.slice(0, 32), x + 12, y + 104);
    rects.set(p.id, [x / c.width, 1 - (y + h) / c.height, w / c.width, h / c.height]);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, rects };
}
