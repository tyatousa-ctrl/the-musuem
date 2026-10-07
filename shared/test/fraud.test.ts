import { describe, expect, it } from 'vitest';
import { museum } from '../src/map/museum.js';
import { groundHeightAt } from '../src/map/ground.js';
import { roomAt } from '../src/map/graph.js';
import { cloneTunables } from '../src/config/tunables.js';
import { AgentNav, routeOnFloor } from '../src/rules/agents.js';
import {
  DESTRUCTIBLE_CENTER, canDamage, hitDamage, money, securityLevel, simulateEconomy, splitUltraCredit, type Strategy,
} from '../src/rules/fraud.js';

const cfg = cloneTunables().insuranceFraud;
const destructibles = museum.slots.filter((s) => s.kind === 'destructible');
const tools = museum.slots.filter((s) => s.kind === 'tool');

describe('Insurance Fraud map data', () => {
  it('every destructible and tool stands on a floor in its room, clear of exhibits', () => {
    const nav = new AgentNav(museum);
    for (const s of [...destructibles, ...tools]) {
      const [x, y, z] = s.pos;
      expect(roomAt(museum, x, y + 1, z)?.id, s.id).toBe(s.room);
      expect(groundHeightAt(museum, x, y + 0.5, z), s.id).toBeCloseTo(y, 1);
      if (y === 0) expect(nav.blocked(x, z, 0.2), s.id).toBe(false);
    }
  });

  it('uses every catalogue entry and tool, and each ultra has three anchors', () => {
    const used = new Set(destructibles.map((s) => s.variant));
    for (const k of Object.keys(cfg.catalogue)) expect(used.has(k), k).toBe(true);
    for (const k of Object.keys(cfg.tools)) expect(tools.some((t) => t.variant === k), k).toBe(true);
    for (const k of Object.keys(cfg.catalogue)) expect(DESTRUCTIBLE_CENTER[k], k).toBeGreaterThan(0);
    const ultras = destructibles.filter((s) => destructibles.some((a) => a.parent === s.id));
    expect(ultras.map((u) => u.variant).sort()).toEqual(['canvas', 'gate', 'mammoth']);
    for (const u of ultras) expect(destructibles.filter((a) => a.parent === u.id)).toHaveLength(3);
  });

  it('the three biggest single values are the ultras', () => {
    const top = Object.entries(cfg.catalogue).sort((a, b) => b[1].value - a[1].value).slice(0, 3).map(([k]) => k).sort();
    expect(top).toEqual(['canvas', 'gate', 'mammoth']);
  });
});

describe('Insurance Fraud rules', () => {
  it('tools gate what you can break', () => {
    expect(canDamage(cfg, null, 'vase')).toBe(true);
    expect(canDamage(cfg, null, 'bust')).toBe(false);
    expect(canDamage(cfg, 'mallet', 'bust')).toBe(true);
    expect(canDamage(cfg, 'mallet', 'statue')).toBe(false);
    expect(canDamage(cfg, 'sledgehammer', 'statue')).toBe(true);
    expect(hitDamage(cfg, 'mallet', 'statue')).toBe(0);
    expect(hitDamage(cfg, 'crowbar', 'anchor')).toBe(cfg.tools.crowbar.damage * 2);
    expect(hitDamage(cfg, null, 'vase')).toBe(cfg.handDamage);
  });

  it('security level rises with heat', () => {
    expect(securityLevel(cfg, 0)).toBe(0);
    expect(securityLevel(cfg, cfg.heatLevels[1])).toBe(2);
    expect(securityLevel(cfg, 99999)).toBe(5);
  });

  it('ultra credit: 60% to the finisher, 40% by anchors loosened', () => {
    expect(splitUltraCredit(400, 'a', {}, 0.6)).toEqual({ a: 400 });
    const s = splitUltraCredit(400, 'a', { b: 2, a: 1 }, 0.6);
    expect(s.a).toBeCloseTo(240 + 160 / 3);
    expect(s.b).toBeCloseTo((160 * 2) / 3);
    expect(Object.values(s).reduce((x, y) => x + y, 0)).toBeCloseTo(400);
  });

  it('prices read like money', () => {
    expect(money(4)).toBe('$4,000');
    expect(money(560)).toBe('$560,000');
    expect(money(1200)).toBe('$1.2M');
  });
});

describe('economy (brief §18): walking straight to the most expensive thing must not win', () => {
  for (const speed of [2.8, 3.6, 4.2]) {
    it(`greedy-highest-value does not win by a wide margin (speed ${speed} m/s)`, () => {
      const run = (s: Strategy) => simulateEconomy(museum, cfg, s, { speed });
      const greedy = run('greedy'), others = [run('nearest'), run('toolFirst')];
      const best = Math.max(...others.map((r) => r.score));
      expect(best).toBeGreaterThan(0);
      expect(greedy.score).toBeLessThanOrEqual(best * 1.25);
    });
  }
});

describe('guard navigation', () => {
  it('a guard can route from its post to every ground-floor room and walk there', () => {
    const nav = new AgentNav(museum);
    const targets: [number, number][] = [[-50, -31], [-35, 0], [-30, 40], [5, -39], [-12, 60], [30, -46], [25, 45], [-10, -60]];
    for (const [tx, tz] of targets) {
      const g = { x: 25.5, z: -8, r: 0.3 };
      const route = routeOnFloor(nav, g.x, g.z, tx, tz);
      expect(route.length, `${tx},${tz}`).toBeGreaterThan(0);
      for (let i = 0; i < 4000 && route.length; i++) {
        const [nx, nz] = route[0];
        const d = Math.hypot(nx - g.x, nz - g.z);
        if (d < 0.6) { route.shift(); continue; }
        nav.step(g, g.x + ((nx - g.x) / d) * Math.min(d, 0.3), g.z + ((nz - g.z) / d) * Math.min(d, 0.3));
      }
      expect(Math.hypot(g.x - tx, g.z - tz), `reach ${tx},${tz}`).toBeLessThan(1.5);
    }
  });
});
