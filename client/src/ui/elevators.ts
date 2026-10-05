import * as THREE from 'three';
import type { Elevator, MuseumMap } from '@museum/shared';
import { Panel } from './panel';

const CAB_HALF = 1.4;

/**
 * Button panels inside every elevator cab (one per stop). Pressing a floor asks
 * the server to move you; desktop players can also press E inside a cab.
 */
export class ElevatorPanels {
  readonly group = new THREE.Group();
  readonly panels: Panel[] = [];

  constructor(map: MuseumMap, private ride: (e: Elevator, floor: number) => void) {
    this.group.name = 'elevatorPanels';
    for (const e of map.elevators) {
      for (const stop of e.stops) {
        const panel = new Panel(0.42, 0.62, 600, (p) => {
          p.background('rgba(30,24,18,0.95)');
          p.text('ELEVATOR', p.canvas.width / 2, 58, 34, '#c9a24f', 'center');
          const others = e.stops;
          others.forEach((s, i) => {
            const here = s === stop;
            p.button(`floor${s.floor}`, here ? `${s.label}  •` : s.label, 40, 90 + i * 128, p.canvas.width - 80, 108, { active: here, enabled: !here, onClick: () => this.ride(e, s.floor) });
          });
          p.text('Floor ' + stop.label, p.canvas.width / 2, p.canvas.height - 24, 24, 'rgba(243,234,217,0.6)', 'center');
        });
        // Mount on a side wall near the opening, facing into the cab.
        const m = panel.mesh;
        if (e.facing === '+x' || e.facing === '-x') {
          const s = e.facing === '+x' ? 1 : -1;
          m.position.set(e.x + s * 0.55, stop.y + 1.35, e.z - CAB_HALF + 0.14);
        } else {
          const s = e.facing === '+z' ? 1 : -1;
          m.position.set(e.x - CAB_HALF + 0.14, stop.y + 1.35, e.z + s * 0.55);
          m.rotation.y = Math.PI / 2;
        }
        panel.redraw();
        this.panels.push(panel);
        this.group.add(m);
      }
    }
  }

  /** The cab the point is standing in, and the stop it is at. */
  static cabAt(map: MuseumMap, feet: THREE.Vector3): { e: Elevator; floor: number } | null {
    for (const e of map.elevators) {
      if (Math.abs(feet.x - e.x) > CAB_HALF || Math.abs(feet.z - e.z) > CAB_HALF) continue;
      const stop = e.stops.find((s) => Math.abs(feet.y - s.y) < 1.2);
      if (stop) return { e, floor: stop.floor };
    }
    return null;
  }

  update() { for (const p of this.panels) p.update(); }
}
