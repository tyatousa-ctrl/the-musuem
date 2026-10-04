/** Environment and URL debug flags (brief §22). Nothing server-specific is hard-coded. */

const params = new URLSearchParams(location.search);

function defaultServerUrl() {
  // Same host as the page, Colyseus default port. Overridden by VITE_SERVER_URL on Render.
  return `${location.protocol}//${location.hostname}:2567`;
}

/** VITE_SERVER_URL may be a full URL or a bare host (Render's fromService gives a host). */
function configuredServerUrl(): string | null {
  const raw = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim().replace(/\/$/, '');
  if (!raw) return null;
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}

export const SERVER_URL: string = configuredServerUrl() ?? defaultServerUrl();

export type QualityTier = 'quest' | 'desktop' | 'desktop-high';

export const flags = {
  /** Start inside a room by id (debug). */
  room: params.get('room'),
  /** Camera bookmark id, e.g. lobby.entrance. */
  cam: params.get('cam'),
  /** Preselect a mode in the lobby (host). */
  mode: params.get('mode'),
  perf: params.has('perf'),
  spectate: params.has('spectate'),
  quality: (params.get('quality') as QualityTier | null),
  noMusic: params.has('nomusic'),
  /** Run without a server (screenshots, offline art review). */
  offline: params.has('offline'),
  /** Hide UI chrome for screenshots. */
  clean: params.has('clean'),
  /** Show the controller button-index readout (milestone 2 menu-button test). */
  buttons: params.has('buttons'),
};

export function detectTier(): QualityTier {
  if (flags.quality) return flags.quality;
  const ua = navigator.userAgent;
  if (/OculusBrowser|Quest|Pico|Android/i.test(ua)) return 'quest';
  return 'desktop';
}

/** /party/<slug> → slug, or null on the landing page. */
export function partySlugFromPath(): string | null {
  const m = location.pathname.match(/^\/party\/([a-z0-9-]{3,40})\/?$/);
  return m ? m[1] : null;
}
