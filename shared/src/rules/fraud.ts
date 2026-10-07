import type { Tunables } from '../config/tunables.js';
import type { MuseumMap, Slot, Vec3 } from '../map/types.js';

/**
 * Insurance Fraud rules (brief §18), pure. Values are in thousands of dollars.
 * The server applies these to the shared breakables, grabbables and agents;
 * the economy simulation at the bottom keeps "walk straight to the most
 * expensive thing" from being the winning strategy (checked by a test).
 */
type Cfg = Tunables['insuranceFraud'];
export type ToolClass = 'hands' | 'tool' | 'heavy';

const RANK: Record<ToolClass, number> = { hands: 0, tool: 1, heavy: 2 };

/** The tool class a held tool variant gives you ('hands' for none). */
export function toolClass(cfg: Cfg, tool: string | null): ToolClass {
  return tool ? (cfg.tools[tool]?.cls ?? 'hands') : 'hands';
}

/** Can this (tool or bare hand) damage this destructible at all? */
export function canDamage(cfg: Cfg, tool: string | null, target: string): boolean {
  const need = cfg.catalogue[target]?.tool ?? 'heavy';
  return RANK[toolClass(cfg, tool)] >= RANK[need];
}

/** Damage from one good hit (0 when the tool is not enough). Crowbars pry anchors twice as fast. */
export function hitDamage(cfg: Cfg, tool: string | null, target: string): number {
  if (!canDamage(cfg, tool, target)) return 0;
  if (!tool) return cfg.handDamage;
  const t = cfg.tools[tool];
  return t.damage * (tool === 'crowbar' && target === 'anchor' ? 2 : 1);
}

/** Security level 0–5 from heat. */
export function securityLevel(cfg: Cfg, heat: number): number {
  return cfg.heatLevels.filter((h) => heat >= h).length;
}

/**
 * Credit for an ultra-high-value object: `finalShare` to whoever landed the
 * final step, the rest split among everyone by anchor steps done. If nobody
 * did earlier steps, the finisher takes it all.
 */
export function splitUltraCredit(value: number, finisher: string, steps: Record<string, number>, finalShare: number): Record<string, number> {
  const out: Record<string, number> = { [finisher]: 0 };
  const total = Object.values(steps).reduce((a, b) => a + b, 0);
  if (total === 0) { out[finisher] = value; return out; }
  out[finisher] += value * finalShare;
  for (const [id, n] of Object.entries(steps)) out[id] = (out[id] ?? 0) + (value * (1 - finalShare) * n) / total;
  return out;
}

/** Height of each destructible's centre above its floor (where hits aim and tags hang). */
export const DESTRUCTIBLE_CENTER: Record<string, number> = {
  vase: 1.1, urn: 1.0, amphora: 1.1, bust: 1.35, clock: 1.1, painting: 1.35, statue: 1.2,
  masterpiece: 1.5, anchor: 0.35, canvas: 2.2, gate: 2.6, mammoth: 1.9,
};

/** What players call each destructible. */
export const DESTRUCTIBLE_NAME: Record<string, string> = {
  vase: 'Ming-style vase', urn: 'funerary urn', amphora: 'Greek amphora', bust: 'marble bust', clock: 'tall-case clock',
  painting: 'oil painting', statue: 'bronze statue', masterpiece: 'Old Master painting', anchor: 'anchor',
  canvas: 'Giant Canvas', gate: 'Lion Gate', mammoth: 'Mammoth skeleton',
};

/** Plain-language price: 4 → "$4,000", 560 → "$560,000", 1200 → "$1.2M". */
export function money(k: number): string {
  if (k >= 1000) return `$${(k / 1000).toFixed(k % 1000 === 0 ? 0 : 1)}M`;
  return `$${Math.round(k * 1000).toLocaleString('en-US')}`;
}

// ─── Economy simulation (brief §18 design constraint) ─────────────────────────

export type Strategy = 'greedy' | 'nearest' | 'toolFirst';

interface SimObject { id: string; variant: string; pos: Vec3; hp: number; value: number; parent?: string; anchorsLeft: number }
interface SimTool { variant: string; pos: Vec3; taken: boolean; readyAt: number; restocks: number }

/** Rough travel distance: path detours, and climbing counts extra. */
const travel = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]) * 1.35 + Math.abs(a[1] - b[1]) * 4;

export interface EconomyResult { strategy: Strategy; score: number; caught: number; destroyed: number }

/**
 * One player alone for a round, playing a simple strategy against the
 * catalogue, the tools on their racks and the security response:
 * - greedy: the highest-value thing left (fetching whatever tool it needs);
 * - nearest: the nearest thing it can break with what it holds, else the nearest tool;
 * - toolFirst: fetch the nearest heavy tool, then best value per second of travel.
 * Guards are dispatched at level 4 from the Great Hall and catch you after
 * their travel time; being caught costs the hold, your tool, and the walk
 * back from the security office.
 */
export function simulateEconomy(map: MuseumMap, cfg: Cfg, strategy: Strategy, opts: { speed?: number; reactionSec?: number } = {}): EconomyResult {
  // Average speed (walking and sprinting), and the time to line up each swing on top of the tool's swing time.
  const speed = opts.speed ?? 3.6, reaction = opts.reactionSec ?? 0.3;
  const slots = map.slots.filter((s) => s.kind === 'destructible');
  const objs: SimObject[] = slots.map((s: Slot) => ({
    id: s.id, variant: s.variant!, pos: s.pos, hp: cfg.catalogue[s.variant!].hp, value: cfg.catalogue[s.variant!].value, parent: s.parent,
    anchorsLeft: slots.filter((a) => a.parent === s.id).length,
  }));
  const tools: SimTool[] = map.slots.filter((s) => s.kind === 'tool').map((s) => ({ variant: s.variant!, pos: s.pos, taken: false, readyAt: 0, restocks: cfg.toolRestocks }));
  const post: Vec3 = [25.5, 0, -8];
  const office: Vec3 = [29.5, -6, 3];
  let pos: Vec3 = map.spawns.lobby[0].pos;
  let t = 0, score = 0, heat = 0, lastHit = -99, caught = 0, destroyed = 0;
  let tool: string | null = null, uses = 0;
  let rack: SimTool | null = null;
  let guardsAt = Infinity; // when the guards reach us

  const live = () => objs.filter((o) => o.hp > 0);
  /** Something we could work on: an anchor, an unlocked ultra, or a regular object. */
  const workable = (o: SimObject) => o.hp > 0 && o.anchorsLeft === 0;
  const valueOf = (o: SimObject) => (o.variant === 'anchor' ? (objs.find((p) => p.id === o.parent)!.value / 3) : o.value);
  const nearestTool = (cls?: ToolClass) => tools.filter((x) => !x.taken && x.readyAt <= t && (!cls || RANK[cfg.tools[x.variant].cls] >= RANK[cls]))
    .sort((a, b) => travel(pos, a.pos) - travel(pos, b.pos))[0];

  const walk = (to: Vec3) => {
    const dt = travel(pos, to) / speed;
    // Lying low while walking.
    const idle = Math.max(0, t + dt - Math.max(lastHit + cfg.lieLowSec, t));
    heat = Math.max(0, heat - idle * cfg.heatDecayPerSec);
    t += dt;
    pos = to;
  };
  /** A broken or lost tool goes back on its rack after a while, a limited number of times. */
  const loseTool = () => {
    if (rack && rack.restocks > 0) { rack.restocks--; rack.taken = false; rack.readyAt = t + cfg.toolRespawnSec; }
    tool = null; rack = null;
  };
  const getCaught = () => {
    caught++;
    t = Math.max(t, guardsAt) + cfg.securityHoldSec;
    pos = office;
    loseTool(); heat = 0; guardsAt = Infinity;
  };
  const fetch = (x: SimTool) => {
    walk(x.pos);
    if (rack) { rack.taken = false; rack.pos = pos; rack.readyAt = t; } // put the old one down here
    x.taken = true; tool = x.variant; rack = x; uses = cfg.tools[x.variant].durability;
  };
  /** Have, or can get, a tool good enough for this target. */
  const reachable = (o: SimObject) => canDamage(cfg, tool, o.variant) || !!nearestTool(cfg.catalogue[o.variant].tool === 'hands' ? undefined : cfg.catalogue[o.variant].tool);

  while (t < cfg.timeLimitSec) {
    if (t >= guardsAt) { getCaught(); continue; }
    const candidates = live().filter(workable);
    if (!candidates.length) break;
    let target: SimObject | undefined;
    if (strategy === 'greedy') target = candidates.filter(reachable).sort((a, b) => valueOf(b) - valueOf(a))[0];
    else if (strategy === 'nearest') target = candidates.filter((o) => canDamage(cfg, tool, o.variant)).sort((a, b) => travel(pos, a.pos) - travel(pos, b.pos))[0];
    else {
      if (!tool || toolClass(cfg, tool) !== 'heavy') { const h = nearestTool('heavy'); if (h) { fetch(h); continue; } }
      target = candidates.filter((o) => canDamage(cfg, tool, o.variant))
        .sort((a, b) => valueOf(b) / (travel(pos, b.pos) / speed + 4) - valueOf(a) / (travel(pos, a.pos) / speed + 4))[0];
    }
    if (!target || !canDamage(cfg, tool, target.variant)) {
      const need = target ? cfg.catalogue[target.variant].tool : 'tool';
      const x = nearestTool(need === 'hands' ? undefined : need);
      if (!x) { t += 1; continue; } // wait for a rack to restock
      fetch(x);
      continue;
    }
    walk(target.pos);
    while (target.hp > 0 && t < cfg.timeLimitSec && t < guardsAt) {
      const dmg = hitDamage(cfg, tool, target.variant);
      if (dmg <= 0) break;
      t += (tool ? cfg.tools[tool].swingSec : cfg.handSwingSec) + reaction;
      lastHit = t;
      const before = target.hp;
      target.hp = Math.max(0, target.hp - dmg);
      if (tool && --uses <= 0) loseTool();
      // Credit: regular objects pay as you damage them; ultras pay on the final step.
      const cat = cfg.catalogue[target.variant];
      let gain = 0;
      if (target.variant === 'anchor') { if (target.hp === 0) objs.find((p) => p.id === target!.parent)!.anchorsLeft--; heat += cfg.anchorHeat; }
      else if (target.anchorsLeft === 0 && slots.some((s) => s.parent === target!.id)) { if (target.hp === 0) gain = cat.value; }
      else gain = (cat.value * (before - target.hp)) / cat.hp;
      score += gain;
      heat += gain;
      if (target.hp === 0) destroyed++;
      if (securityLevel(cfg, heat) >= 4 && guardsAt === Infinity) guardsAt = t + travel(post, pos) / cfg.guardSpeed;
      if (!tool && !canDamage(cfg, null, target.variant)) break;
    }
  }
  return { strategy, score: Math.round(score), caught, destroyed };
}
