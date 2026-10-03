import * as THREE from 'three';
import type { MuseumMap } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import type { DynamicBox } from '../player/collision';

/**
 * Server-owned doors (brief §20). The Egypt false door is a sandstone slab that
 * pivots open; while closed it blocks the passage with a dynamic collision box.
 */
export class Doors {
  readonly group = new THREE.Group();
  readonly boxes: DynamicBox[] = [];
  private doors: { id: string; pivot: THREE.Group; box: DynamicBox; open: number; pos: THREE.Vector3 }[] = [];

  constructor(map: MuseumMap) {
    this.group.name = 'doors';
    const mat = new THREE.MeshLambertMaterial({ color: 0xc4a47c });
    const relief = new THREE.MeshLambertMaterial({ color: 0x8a6a46 });
    for (const d of map.doors) {
      const p = map.portals.find((x) => x.id === d.portal)!;
      const pivot = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(p.width, p.height, 0.25), mat);
      slab.position.set(0, p.height / 2, 0);
      // The "false door" niche relief so the observant can spot it.
      const band = new THREE.Mesh(new THREE.BoxGeometry(p.width * 0.7, p.height * 0.8, 0.04), relief);
      band.position.set(0, p.height / 2, 0.14);
      const band2 = band.clone(); band2.position.z = -0.14;
      slab.add(band, band2);
      pivot.add(slab);
      // Pivot about the centre axis (a rotating false door).
      pivot.position.set(p.x, p.y, p.z);
      if (p.axis === 'z') pivot.rotation.y = Math.PI / 2;
      this.group.add(pivot);
      const half = p.axis === 'x' ? new THREE.Vector3(p.width / 2, 0, 0.3) : new THREE.Vector3(0.3, 0, p.width / 2);
      const box: DynamicBox = { box: new THREE.Box3(new THREE.Vector3(p.x - half.x, p.y, p.z - half.z), new THREE.Vector3(p.x + half.x, p.y + p.height, p.z + half.z)), active: !d.defaultOpen };
      this.boxes.push(box);
      this.doors.push({ id: d.id, pivot, box, open: d.defaultOpen ? 1 : 0, pos: new THREE.Vector3(p.x, p.y + 1.2, p.z) });
    }
  }

  update(state: NetState, dt: number) {
    for (const d of this.doors) {
      const open = !!state?.doors?.get(d.id)?.open;
      d.open += ((open ? 1 : 0) - d.open) * Math.min(1, dt * 3);
      d.pivot.children[0].rotation.y = d.open * Math.PI / 2;
      d.box.active = d.open < 0.5;
    }
  }

  /** Door within reach of a point. */
  near(p: THREE.Vector3, reach = 1.8): string | null {
    for (const d of this.doors) if (d.pos.distanceTo(p) < reach) return d.id;
    return null;
  }

  position(id: string) { return this.doors.find((d) => d.id === id)?.pos; }
}
