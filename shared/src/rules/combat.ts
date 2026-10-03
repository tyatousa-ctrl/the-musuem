/** Shared combat maths (brief §19): daze meter, KO, hit validation. Pure. */

export interface CombatTunables {
  shoveSpeed: number; shoveDaze: number; bonkDaze: number; dazeDrainPerSec: number;
  shoveKnockback: number; bonkKnockback: number; hitCooldownMs: number; maxHitReach: number;
}

export interface Combatant {
  daze: number;
  ko: boolean;
  protectedUntil: number;
  lastHitAt: number; // as attacker
}

export type HitKind = 'shove' | 'bonk';

export interface HitResult {
  ok: boolean;
  reason?: string;
  daze: number;
  ko: boolean;
  knockbackSpeed: number;
}

/** Bonk damage scales with swing speed relative to 4 m/s, capped at 1.5×. */
export function hitDaze(t: CombatTunables, kind: HitKind, speed: number): number {
  if (kind === 'shove') return t.shoveDaze;
  return t.bonkDaze * Math.min(1.5, Math.max(0.6, speed / 4));
}

export function resolveHit(
  t: CombatTunables, now: number, attacker: Combatant, target: Combatant,
  kind: HitKind, speed: number, distance: number,
): HitResult {
  const fail = (reason: string): HitResult => ({ ok: false, reason, daze: target.daze, ko: false, knockbackSpeed: 0 });
  if (attacker.ko) return fail('attacker ko');
  if (target.ko) return fail('target ko');
  if (now < target.protectedUntil) return fail('spawn protection');
  if (now - attacker.lastHitAt < t.hitCooldownMs) return fail('cooldown');
  if (distance > t.maxHitReach) return fail('out of reach');
  if (speed < t.shoveSpeed) return fail('too slow');
  const daze = Math.min(1, target.daze + hitDaze(t, kind, speed));
  const base = kind === 'shove' ? t.shoveKnockback : t.bonkKnockback;
  return { ok: true, daze, ko: daze >= 1 - 1e-6, knockbackSpeed: base * Math.min(1.4, Math.max(0.7, speed / 3)) };
}

export function drainDaze(t: CombatTunables, daze: number, dtSec: number): number {
  return Math.max(0, daze - t.dazeDrainPerSec * dtSec);
}
