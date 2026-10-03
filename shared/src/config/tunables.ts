/**
 * Every gameplay number lives here (brief §24). These are starting guesses to be
 * corrected by playtesting. The desktop dev panel edits this object live on the
 * client; the server reads it at room creation.
 */
export const tunables = {
  player: {
    /** Walking speed, m/s. */
    walkSpeed: 2.6,
    /** Sprint speed, m/s. */
    sprintSpeed: 4.2,
    /** Snap-turn angle, degrees. */
    snapTurnDeg: 45,
    /** Smooth-turn speed when enabled, degrees/s. */
    smoothTurnDegPerSec: 120,
    /** Player capsule radius, m. */
    radius: 0.3,
    /** Standing eye height used for desktop and as the VR default, m. */
    eyeHeight: 1.65,
    /** Max step height the capsule climbs without a ramp, m. */
    stepHeight: 0.35,
    gravity: 18,
    /** Comfort vignette strength at full speed, 0..1. */
    vignetteStrength: 0.55,
    /** Grab sphere radius around each hand, m. */
    grabRadius: 0.18,
    /** Frames of hand history used to compute throw velocity. */
    throwHistoryFrames: 6,
    /** Max throw speed, m/s (clamped server-side too). */
    maxThrowSpeed: 14,
  },
  net: {
    /** Client pose send rate, Hz. */
    poseSendHz: 20,
    /** Remote avatars render this far in the past, ms. */
    interpolationDelayMs: 100,
    /** Server logic tick, Hz. */
    serverTickHz: 20,
    /** NPC agent tick, Hz. */
    agentTickHz: 10,
    /** Seat kept for a dropped player, s. */
    reconnectWindowSec: 60,
    /** Empty party kept alive, s. */
    emptyPartyGraceSec: 600,
    /** Max plausible head speed before the server rejects a pose, m/s. */
    maxPoseSpeed: 12,
    maxPlayers: 4,
  },
  round: {
    countdownSec: 5,
    resultsSec: 10,
  },
  combat: {
    /** Hand speed needed to damage glass with a bare punch, m/s. */
    punchGlassSpeed: 2.5,
    /** Valid hits needed to shatter a case (first cracks). */
    glassHitsToShatter: 2,
    /** Open-hand speed threshold for a shove, m/s. */
    shoveSpeed: 1.5,
    /** Daze added by a shove (KO at 1.0, ~5 shoves). */
    shoveDaze: 0.21,
    /** Daze added by a bonk at reference speed (KO at 1.0, 3 bonks). */
    bonkDaze: 0.34,
    /** Daze drained per second. */
    dazeDrainPerSec: 0.06,
    /** Shove knockback speed, m/s. */
    shoveKnockback: 3.5,
    bonkKnockback: 5,
    /** Per-attacker hit cooldown, ms. */
    hitCooldownMs: 450,
    /** Max distance between attacker head and victim for a hit claim, m. */
    maxHitReach: 1.6,
    respawnDelaySec: 4,
    shortHandedRespawnDelaySec: 3,
    spawnProtectionSec: 2,
  },
  ctr: {
    scoreLimit: 3,
    timeLimitSec: 8 * 60,
    carrierSpeedMul: 0.9,
    /** Radius of a base capture zone, m. */
    captureRadius: 3,
    /** Reach for a defender touching their dropped relic, m. */
    returnTouchRadius: 1.2,
    /** Carried relic hums and pulses (anti-stalemate). */
    carrierHum: true,
  },
  artifactHunt: { artifacts: 12, timeLimitSec: 6 * 60, valueCommon: 1, valueRare: 3, valueLegendary: 5 },
  crowdControl: { waves: 5, maxAgents: 40 },
  insuranceFraud: { timeLimitSec: 5 * 60, securityHoldSec: 8, ultraFinalShare: 0.6 },
} as const;

type Widen<T> = T extends number ? number : T extends boolean ? boolean : { -readonly [K in keyof T]: Widen<T[K]> };
export type Tunables = Widen<typeof tunables>;

/** A mutable copy, so the dev panel or a room can edit values without touching the defaults. */
export function cloneTunables(overrides?: DeepPartial<Tunables>): Tunables {
  const t = JSON.parse(JSON.stringify(tunables)) as Tunables;
  if (overrides) merge(t as unknown as Record<string, unknown>, overrides as Record<string, unknown>);
  return t;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge(into: Record<string, unknown>, from: Record<string, unknown>) {
  for (const [k, v] of Object.entries(from)) {
    if (!(k in into)) continue;
    if (v && typeof v === 'object' && typeof into[k] === 'object') merge(into[k] as Record<string, unknown>, v as Record<string, unknown>);
    else if (typeof v === typeof into[k]) into[k] = v;
  }
}
