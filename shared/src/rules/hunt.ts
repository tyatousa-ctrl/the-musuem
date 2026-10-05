/**
 * Artifact Hunt rules as pure functions (brief §16). The server mode feeds
 * events in; tests drive these directly.
 */
export type Tier = 'obvious' | 'tucked' | 'hidden';
export type Rarity = 'common' | 'rare' | 'legendary';
type V3 = [number, number, number];

/** Placement difficulty decides rarity: harder to find, worth more. */
export const RARITY_BY_TIER: Record<Tier, Rarity> = { obvious: 'common', tucked: 'rare', hidden: 'legendary' };

export interface HuntSlot { id: string; pos: V3; tier: Tier }

export interface HuntArtifact {
  id: string;
  slot: string;
  tier: Tier;
  rarity: Rarity;
  value: number;
  secured: boolean;
  securedBy: string | null;
}

export interface HuntState {
  artifacts: Record<string, HuntArtifact>;
  /** Points by scorer key: a player id (free-for-all) or 'A' / 'B' (teams). */
  scores: Record<string, number>;
  teams: boolean;
}

export interface HuntValues { common: number; rare: number; legendary: number }

/** Mix per round: mostly obvious, some tucked, a few hidden (12 → 5 / 4 / 3). */
export function tierMix(count: number): Record<Tier, number> {
  const hidden = Math.max(1, Math.round(count * 0.25));
  const tucked = Math.max(1, Math.round(count * 0.33));
  return { obvious: Math.max(0, count - hidden - tucked), tucked, hidden };
}

/** Choose this round's placements from the candidate slots (different every round). */
export function pickPlacements(slots: HuntSlot[], count: number, rand: () => number = Math.random): HuntSlot[] {
  const mix = tierMix(count);
  const out: HuntSlot[] = [];
  for (const tier of ['obvious', 'tucked', 'hidden'] as Tier[]) {
    const pool = slots.filter((s) => s.tier === tier);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    out.push(...pool.slice(0, mix[tier]));
  }
  // Top up from any tier if a tier ran short.
  if (out.length < count) {
    const rest = slots.filter((s) => !out.includes(s));
    out.push(...rest.slice(0, count - out.length));
  }
  return out;
}

export function createHuntState(placements: HuntSlot[], values: HuntValues, teams: boolean): HuntState {
  const artifacts: Record<string, HuntArtifact> = {};
  placements.forEach((s, i) => {
    const rarity = RARITY_BY_TIER[s.tier];
    const id = `artifact${i}`;
    artifacts[id] = { id, slot: s.id, tier: s.tier, rarity, value: values[rarity], secured: false, securedBy: null };
  });
  return { artifacts, scores: {}, teams };
}

/** Who gets the points for a player's delivery. */
export function scorerKey(state: HuntState, playerId: string, team: string): string {
  return state.teams && (team === 'A' || team === 'B') ? team : playerId;
}

/**
 * Deliver an artifact to the Registrar's Desk. Returns the points awarded
 * (0 if already secured or unknown). Points are credited only at delivery, so
 * late joiners get no retroactive credit.
 */
export function deliver(prev: HuntState, artifactId: string, playerId: string, team: string): { state: HuntState; points: number } {
  const a = prev.artifacts[artifactId];
  if (!a || a.secured) return { state: prev, points: 0 };
  const key = scorerKey(prev, playerId, team);
  const state: HuntState = {
    ...prev,
    artifacts: { ...prev.artifacts, [artifactId]: { ...a, secured: true, securedBy: playerId } },
    scores: { ...prev.scores, [key]: (prev.scores[key] ?? 0) + a.value },
  };
  return { state, points: a.value };
}

export function allSecured(state: HuntState): boolean {
  return Object.values(state.artifacts).every((a) => a.secured);
}

/** Highest score wins; null when nobody scored; 'tie' when the top is shared. */
export function huntWinner(state: HuntState): string | 'tie' | null {
  const entries = Object.entries(state.scores).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return 'tie';
  return entries[0][0];
}

/**
 * Warmer/colder hint for the wrist display (brief §16): 0 (freezing) … 1 (burning)
 * for the nearest unfound artifact. Weakened for higher tiers: a hidden
 * legendary only registers when you are already close.
 */
export const HINT_RANGE: Record<Tier, number> = { obvious: 40, tucked: 24, hidden: 12 };

export function hintHeat(player: V3, artifacts: { pos: V3; tier: Tier }[]): number {
  let best = 0;
  for (const a of artifacts) {
    // Vertical distance counts double: the service level is not "near" the lobby above it.
    const d = Math.hypot(a.pos[0] - player[0], (a.pos[1] - player[1]) * 2, a.pos[2] - player[2]);
    best = Math.max(best, Math.max(0, 1 - d / HINT_RANGE[a.tier]));
  }
  return best;
}

export function heatWord(heat: number): string {
  if (heat <= 0) return 'Freezing';
  if (heat < 0.25) return 'Cold';
  if (heat < 0.5) return 'Warm';
  if (heat < 0.75) return 'Hot';
  return 'Burning!';
}
