import type express from 'express';

const ADJ = ['amber', 'marble', 'gilded', 'quiet', 'velvet', 'bronze', 'jade', 'ivory', 'cobalt', 'crimson', 'golden', 'secret', 'sleepy', 'grand', 'hidden', 'dusty'];
const NOUN = ['falcon', 'sphinx', 'mammoth', 'canvas', 'pharaoh', 'griffin', 'statue', 'mosaic', 'raptor', 'scarab', 'obelisk', 'gallery', 'curator', 'lantern', 'atrium', 'relic'];

/** Short, readable, unguessable-enough party slug, e.g. "jade-sphinx-417". */
export function makeSlug(rand = Math.random): string {
  const pick = (a: string[]) => a[Math.floor(rand() * a.length)];
  return `${pick(ADJ)}-${pick(NOUN)}-${100 + Math.floor(rand() * 900)}`;
}

export const SLUG_RE = /^[a-z0-9-]{3,40}$/;

export function mountRoutes(app: express.Application, allowedOrigin: string | undefined) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (!allowedOrigin || allowedOrigin.split(',').map((s) => s.trim()).includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.get('/health', (_req, res) => { res.json({ ok: true, time: Date.now() }); });

  // "Create party" returns a slug; the room itself is created by the first join (brief §12.1).
  app.post('/api/party', (_req, res) => { res.json({ slug: makeSlug() }); });
}
