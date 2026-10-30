import * as THREE from 'three';
import { museum, roomAt } from '@museum/shared';

/**
 * Culling for things that move (brief §9): the static museum is culled room by
 * room through portals; objects, breakables and doors follow the same rule, so
 * a vase three rooms away costs no draw call. Also a distance limit.
 */
export class DynamicCull {
  /** Rooms visible from the camera's room (last frame's portal culling). */
  visible = new Set<string>();
  readonly viewer = new THREE.Vector3();

  set(rooms: string[], viewer: THREE.Vector3) {
    this.visible = new Set(rooms);
    this.viewer.copy(viewer);
  }

  /** Should something at this point, at most `maxDist` away, be drawn? */
  shows(x: number, y: number, z: number, maxDist = 40): boolean {
    if ((x - this.viewer.x) ** 2 + (y - this.viewer.y) ** 2 + (z - this.viewer.z) ** 2 > maxDist * maxDist) return false;
    if (!this.visible.size) return true;
    const room = roomAt(museum, x, y + 0.3, z);
    return !room || this.visible.has(room.id);
  }
}
