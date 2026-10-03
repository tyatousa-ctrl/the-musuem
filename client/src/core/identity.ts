/** Persistent anonymous identity in localStorage (brief §12.2). No accounts. */

const FIRST = ['Curious', 'Sneaky', 'Gilded', 'Marble', 'Velvet', 'Dusty', 'Jolly', 'Quiet', 'Brave', 'Nimble', 'Sleepy', 'Lucky'];
const LAST = ['Curator', 'Docent', 'Visitor', 'Sphinx', 'Falcon', 'Raptor', 'Bust', 'Guard', 'Patron', 'Scholar', 'Mummy', 'Muse'];

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function getIdentity(): { playerId: string; name: string } {
  const s = store();
  let playerId = s?.getItem('museum.playerId') ?? '';
  let name = s?.getItem('museum.name') ?? '';
  if (!playerId) {
    playerId = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9-]/gi, '').slice(0, 36);
    try { s?.setItem('museum.playerId', playerId); } catch { /* private mode */ }
  }
  if (!name) {
    name = `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`;
    try { s?.setItem('museum.name', name); } catch { /* private mode */ }
  }
  return { playerId, name };
}

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = store()?.getItem(`museum.${key}`);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch { return fallback; }
}

export function savePref(key: string, value: unknown) {
  try { store()?.setItem(`museum.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
}
