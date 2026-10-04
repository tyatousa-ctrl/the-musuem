/**
 * Real art on the walls (brief §8.3). Pulls public-domain (CC0) works from the
 * Met Collection API, resizes them, packs 2048² atlases and writes
 * client/public/assets/art/paintings.json + atlas images + docs/CREDITS-art.md.
 *
 *   npm run fetch-art              (≈ 2–4 minutes, polite request rate)
 *
 * Only objects with isPublicDomain === true and a primary image are used.
 * Images are fetched at build time and shipped; the game never hot-links.
 * Image work runs in headless Chromium (already installed for Playwright), so
 * no native image library is needed. If `toktx` is on PATH, atlases are also
 * encoded to KTX2; otherwise JPEG atlases are shipped (see DECISIONS.md).
 *
 * NOTE: written against the documented API but not run from the build
 * environment (network policy blocked collectionapi.metmuseum.org).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const OUT = new URL('../client/public/assets/art/', import.meta.url).pathname;
const CREDITS = new URL('../docs/CREDITS-art.md', import.meta.url).pathname;
const ATLAS = 2048, CELLS = 4, CELL = ATLAS / CELLS, PAD = 8;

/** Curated groups by gallery: [group, department name, extra query, how many]. */
const PLAN: [string, string, string, number][] = [
  ['european', 'European Paintings', 'landscape', 40],
  ['european', 'European Paintings', 'still life', 10],
  ['portrait', 'European Paintings', 'portrait', 30],
  ['egypt', 'Egyptian Art', 'relief', 16],
  ['egypt', 'Egyptian Art', 'papyrus', 8],
  ['cultures', 'The Michael C. Rockefeller Wing', '*', 16],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get<T>(url: string): Promise<T> {
  // Polite: at most ~8 requests per second.
  const wait = last + 125 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404) throw new Error(`404 ${url}`);
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`failed ${url}`);
}

interface MetObject {
  objectID: number; isPublicDomain: boolean; primaryImage: string; primaryImageSmall: string;
  title: string; artistDisplayName: string; objectDate: string; medium: string; objectURL: string;
  measurements?: { elementName: string; elementMeasurements: { Height?: number; Width?: number } }[] | null;
}

const departments = await get<{ departments: { departmentId: number; displayName: string }[] }>(`${API}/departments`);
const deptId = (name: string) => departments.departments.find((d) => d.displayName === name)?.departmentId;

const chosen: (MetObject & { group: string; widthCm: number; heightCm: number })[] = [];
const seen = new Set<number>();
for (const [group, dept, q, want] of PLAN) {
  const id = deptId(dept);
  if (!id) { console.warn(`department not found: ${dept}`); continue; }
  const search = await get<{ objectIDs: number[] | null }>(`${API}/search?departmentId=${id}&hasImages=true&isHighlight=true&q=${encodeURIComponent(q)}`);
  let ids = search.objectIDs ?? [];
  if (ids.length < want) {
    const more = await get<{ objectIDs: number[] | null }>(`${API}/search?departmentId=${id}&hasImages=true&q=${encodeURIComponent(q)}`);
    ids = [...ids, ...(more.objectIDs ?? [])];
  }
  let got = 0;
  for (const oid of ids) {
    if (got >= want) break;
    if (seen.has(oid)) continue;
    seen.add(oid);
    try {
      const o = await get<MetObject>(`${API}/objects/${oid}`);
      if (!o.isPublicDomain || !(o.primaryImageSmall || o.primaryImage)) continue;
      const overall = o.measurements?.find((m) => m.elementName === 'Overall')?.elementMeasurements;
      chosen.push({ ...o, group, widthCm: overall?.Width ?? 0, heightCm: overall?.Height ?? 0 });
      got++;
      process.stdout.write(`\r${chosen.length} works`);
    } catch { /* skip */ }
  }
}
console.log(`\nselected ${chosen.length} public-domain works`);

// Download, resize and pack atlases in headless Chromium.
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const perAtlas = CELLS * CELLS;
const atlases: string[] = [];
const paintings: unknown[] = [];
for (let a = 0; a * perAtlas < chosen.length; a++) {
  const batch = chosen.slice(a * perAtlas, (a + 1) * perAtlas);
  const urls = batch.map((o) => o.primaryImageSmall || o.primaryImage);
  // Fetch bytes in Node (no CORS issues), hand them to the page as data URLs.
  const dataUrls: string[] = [];
  for (const u of urls) {
    const res = await fetch(u);
    const buf = Buffer.from(await res.arrayBuffer());
    dataUrls.push(`data:${res.headers.get('content-type') ?? 'image/jpeg'};base64,${buf.toString('base64')}`);
    await sleep(100);
  }
  const result = await page.evaluate(async ({ dataUrls, ATLAS, CELLS, CELL, PAD }) => {
    const c = document.createElement('canvas');
    c.width = c.height = ATLAS;
    const g = c.getContext('2d')!;
    g.fillStyle = '#222'; g.fillRect(0, 0, ATLAS, ATLAS);
    const rects: number[][] = [];
    for (let i = 0; i < dataUrls.length; i++) {
      const img = new Image();
      img.src = dataUrls[i];
      await img.decode();
      const max = CELL - PAD * 2;
      const k = Math.min(max / img.width, max / img.height);
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const x = (i % CELLS) * CELL + PAD + (max - w) / 2, y = Math.floor(i / CELLS) * CELL + PAD + (max - h) / 2;
      g.drawImage(img, x, y, w, h);
      // Mip padding: smear the edge pixels outward.
      g.drawImage(c, x, y, w, 1, x, y - PAD, w, PAD);
      g.drawImage(c, x, y + h - 1, w, 1, x, y + h, w, PAD);
      rects.push([x / ATLAS, 1 - (y + h) / ATLAS, w / ATLAS, h / ATLAS, img.width / img.height]);
    }
    return { jpeg: c.toDataURL('image/jpeg', 0.86), rects };
  }, { dataUrls, ATLAS, CELLS, CELL, PAD });
  const file = `atlas-${a}.jpg`;
  writeFileSync(`${OUT}${file}`, Buffer.from(result.jpeg.split(',')[1], 'base64'));
  atlases.push(file);
  batch.forEach((o, i) => {
    const [u, v, w, h, aspect] = result.rects[i];
    // Real-world size: use the catalogue dimensions when present, else a plausible size from the aspect.
    const widthCm = o.widthCm || (aspect >= 1 ? 90 : 60);
    const heightCm = o.heightCm || widthCm / aspect;
    paintings.push({
      id: `met.${o.objectID}`, title: o.title, artist: o.artistDisplayName || 'Unknown artist', date: o.objectDate, medium: o.medium,
      widthCm, heightCm, atlas: a, rect: [u, v, w, h], objectUrl: o.objectURL, group: o.group,
    });
  });
  console.log(`atlas ${a}: ${batch.length} works`);
}
await browser.close();

// Optional KTX2 encode (brief §8: KTX2 on Quest).
try {
  execFileSync('toktx', ['--version'], { stdio: 'ignore' });
  for (const f of atlases) execFileSync('toktx', ['--t2', '--encode', 'etc1s', '--genmipmap', `${OUT}${f.replace('.jpg', '.ktx2')}`, `${OUT}${f}`]);
  console.log('KTX2 atlases written alongside JPEGs');
} catch { console.log('toktx not found: shipping JPEG atlases only'); }

writeFileSync(`${OUT}paintings.json`, JSON.stringify({ source: 'The Metropolitan Museum of Art Collection API (Open Access, CC0)', atlases, paintings }, null, 1));
const lines = (paintings as { title: string; artist: string; objectUrl: string }[]).map((p) => `- *${p.title}* — ${p.artist}. ${p.objectUrl} — CC0 (Met Open Access)`);
writeFileSync(CREDITS, `# Artwork credits\n\nAll works below are public domain via The Metropolitan Museum of Art Open Access (CC0).\nThe game is not affiliated with or endorsed by the Met.\n\n${lines.join('\n')}\n`);
console.log(`wrote ${paintings.length} paintings to ${OUT}paintings.json${existsSync(CREDITS) ? ' and docs/CREDITS-art.md' : ''}`);
