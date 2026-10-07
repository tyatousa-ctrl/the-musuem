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
  artifactHunt: {
    artifacts: 12,
    timeLimitSec: 6 * 60,
    valueCommon: 1,
    valueRare: 3,
    valueLegendary: 5,
    /** Planar radius around the Registrar's Desk that secures a carried artifact, m. */
    deliverRadius: 4.5,
  },
  crowdControl: {
    waves: 5,
    /** Most tourists in the museum at once (Quest budget; validate on device). */
    maxAgents: 40,
    /** Tourists per wave (each group member counts). */
    waveSizes: [10, 14, 18, 22, 26],
    /** Seconds between arrivals in wave 1; later waves arrive a little faster. */
    spawnIntervalSec: 2,
    /** Seconds after a wave has fully arrived before the next one starts. */
    waveGapSec: 35,
    /** Tourist walking speed, m/s (kids run). */
    walkSpeed: 1.3,
    kidSpeed: 2.1,
    /** Chance a tourist turns the wrong way at each circuit point, by wave. */
    wrongTurnChance: [0.015, 0.02, 0.025, 0.03, 0.035],
    /** Chance a tourist walks in the wrong way from the start, by wave. */
    wrongAtStartChance: [0.15, 0.2, 0.25, 0.3, 0.35],
    /** Chance a lost tourist takes a detour toward a closed area when it passes one. */
    lostDetourChance: 0.7,
    /** Touches a stubborn tourist needs. */
    stubbornTouches: 3,
    /** Seconds a redirected tourist keeps to the route before it might stray again. */
    calmSec: 20,
    /** Hand-to-body distance that counts as a touch, m. */
    touchRadius: 0.4,
    /** Player-body-to-tourist distance that counts as a bump, m. */
    bumpRadius: 0.55,
    touchCooldownSec: 0.8,
    /** A sign turns wrong-way and lost tourists around within this radius, m. */
    signRadius: 1.8,
    /** Longest rope between two stanchions, m. */
    ropeMaxLen: 2.6,
    /** Seconds an influencer stops to film in a doorway. */
    filmSec: 14,
    /** Tourists a doorway takes before it counts as jammed. */
    chokeCapacity: 5,
    /** Congestion meter per extra tourist per second in a jammed doorway (fails at 1). */
    congestionPerAgentSec: 0.006,
    congestionDrainPerSec: 0.01,
    /** Breach meter per tourist per second inside a closed area (fails at 1). */
    breachPerAgentSec: 0.012,
    breachDrainPerSec: 0.004,
    pointsRouted: 1,
    penaltyWrongExit: 1,
    penaltyBreach: 2,
    /** Score per visitor needed for 1, 2 and 3 stars. */
    starThresholds: [0.4, 0.65, 0.85],
  },
  insuranceFraud: {
    timeLimitSec: 5 * 60,
    /** Seconds held in the security office when caught. */
    securityHoldSec: 8,
    /** Share of an ultra-high-value object's value to whoever lands the final step; the rest is split by steps done. */
    ultraFinalShare: 0.6,
    /**
     * Destructibles, values in thousands of dollars. hp is in hits of damage 1;
     * tool is the least you need: 'hands', any 'tool', or a 'heavy' tool.
     * radius is the reach target around the object's centre, m.
     */
    catalogue: {
      vase: { value: 4, hp: 1, tool: 'hands', radius: 0.35 },
      urn: { value: 9, hp: 2, tool: 'hands', radius: 0.4 },
      amphora: { value: 18, hp: 2, tool: 'tool', radius: 0.4 },
      bust: { value: 26, hp: 3, tool: 'tool', radius: 0.4 },
      clock: { value: 45, hp: 4, tool: 'tool', radius: 0.5 },
      painting: { value: 70, hp: 5, tool: 'tool', radius: 0.8 },
      statue: { value: 110, hp: 9, tool: 'heavy', radius: 0.6 },
      masterpiece: { value: 160, hp: 8, tool: 'tool', radius: 0.9 },
      anchor: { value: 0, hp: 4, tool: 'tool', radius: 0.35 },
      canvas: { value: 300, hp: 18, tool: 'heavy', radius: 2.2 },
      gate: { value: 340, hp: 20, tool: 'heavy', radius: 2.2 },
      mammoth: { value: 400, hp: 24, tool: 'heavy', radius: 2.2 },
    } as Record<string, { value: number; hp: number; tool: 'hands' | 'tool' | 'heavy'; radius: number }>,
    /** Tools: damage per good hit, hits before it breaks, and the fastest it can swing (s). Crowbars pry anchors twice as fast. */
    tools: {
      mallet: { cls: 'tool', damage: 1, durability: 12, swingSec: 0.5 },
      crowbar: { cls: 'tool', damage: 1.2, durability: 10, swingSec: 0.6 },
      extinguisher: { cls: 'tool', damage: 1.3, durability: 8, swingSec: 0.6 },
      mace: { cls: 'tool', damage: 1.5, durability: 8, swingSec: 0.6 },
      axe: { cls: 'heavy', damage: 2.2, durability: 8, swingSec: 0.9 },
      sledgehammer: { cls: 'heavy', damage: 3, durability: 7, swingSec: 1.2 },
      ball: { cls: 'heavy', damage: 2.5, durability: 6, swingSec: 1.5 },
    } as Record<string, { cls: 'tool' | 'heavy'; damage: number; durability: number; swingSec: number }>,
    /** Fastest bare-hand hit rate, s. */
    handSwingSec: 0.45,
    /** Loosening an anchor is loud: security heat per anchor. */
    anchorHeat: 120,
    /** Damage from a bare hand (only 'hands' objects). */
    handDamage: 1,
    /** Carrying the two-handed sledgehammer slows you to this. */
    sledgeSpeedMul: 0.75,
    /** Seconds before a broken or lost tool reappears on its rack; each rack restocks this many times. */
    toolRespawnSec: 30,
    toolRestocks: 1,
    /** Security heat (thousands of dollars of recent damage) needed for levels 1–5. */
    heatLevels: [30, 90, 200, 360, 560],
    /** Heat lost per second once you have lain low for lieLowSec. */
    heatDecayPerSec: 18,
    lieLowSec: 6,
    /** Level 2+: everyone sees where you are. Level 3+: an alarm sounds at you this often, s. */
    alarmEverySec: 10,
    /** Level 4+: guards pursue (speed at level 4 and 5, m/s). */
    guardSpeed: 3.1,
    guardSpeedMax: 3.7,
    maxGuards: 3,
    catchRadius: 1.0,
  },
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
