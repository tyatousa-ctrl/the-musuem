import type express from 'express';
import { matchMaker } from 'colyseus';

const ADJ = ['amber', 'marble', 'gilded', 'quiet', 'velvet', 'bronze', 'jade', 'ivory', 'cobalt', 'crimson', 'golden', 'secret', 'sleepy', 'grand', 'hidden', 'dusty'];
const NOUN = ['falcon', 'sphinx', 'mammoth', 'canvas', 'pharaoh', 'griffin', 'statue', 'mosaic', 'raptor', 'scarab', 'obelisk', 'gallery', 'curator', 'lantern', 'atrium', 'relic'];

/** Short, readable party slug, e.g. "jade-sphinx-417". */
export function makeSlug(rand = Math.random): string {
  const pick = (a: string[]) => a[Math.floor(rand() * a.length)];
  return `${pick(ADJ)}-${pick(NOUN)}-${100 + Math.floor(rand() * 900)}`;
}

/** CLIENT_ORIGIN: comma-separated origins or bare hosts. Empty = allow any (local dev). */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => (/^https?:\/\//.test(s) ? s : `https://${s}`));
}

export function mountRoutes(app: express.Application, clientOrigin: string | undefined) {
  const allowed = parseOrigins(clientOrigin);
  if (allowed.length) {
    // Colyseus answers CORS for matchmaking and for these routes; restrict it to the client.
    matchMaker.controller.getCorsHeaders = (headers: Headers) => {
      const origin = headers.get('origin');
      return { 'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0] };
    };
  }

  app.get('/health', (_req, res) => { res.json({ ok: true, time: Date.now() }); });

  // "Create party" returns a slug; the room itself is created by the first join (brief §12.1).
  app.post('/api/party', (_req, res) => { res.json({ slug: makeSlug() }); });
}
