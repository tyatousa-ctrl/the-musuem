import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

/**
 * Capsule vs BVH (brief §4): no physics engine for locomotion. Resolves a
 * vertical capsule standing at `feet` against the static collider and the
 * dynamic door boxes. Returns whether the capsule ended up on the ground.
 */
const seg = new THREE.Line3();
const box = new THREE.Box3();
const triPoint = new THREE.Vector3();
const capPoint = new THREE.Vector3();
const dir = new THREE.Vector3();
const before = new THREE.Vector3();
const delta = new THREE.Vector3();

export interface DynamicBox { box: THREE.Box3; active: boolean }

export function resolveCapsule(bvh: MeshBVH, feet: THREE.Vector3, radius: number, height: number, dynamic: DynamicBox[] = []): { grounded: boolean; correction: THREE.Vector3 } {
  before.copy(feet);
  for (let iter = 0; iter < 3; iter++) {
    seg.start.set(feet.x, feet.y + radius, feet.z);
    seg.end.set(feet.x, feet.y + Math.max(radius, height - radius), feet.z);
    box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end).expandByScalar(radius);
    let moved = false;
    bvh.shapecast({
      intersectsBounds: (b: THREE.Box3) => b.intersectsBox(box),
      intersectsTriangle: (tri: { closestPointToSegment(s: THREE.Line3, a: THREE.Vector3, b: THREE.Vector3): number }) => {
        const d = tri.closestPointToSegment(seg, triPoint, capPoint);
        if (d < radius) {
          const depth = radius - d;
          dir.subVectors(capPoint, triPoint);
          if (dir.lengthSq() < 1e-10) return false;
          dir.normalize();
          if (dir.y > 0.55) {
            // Walkable floor or ramp: lift straight up so the player never slides downhill.
            const lift = depth / dir.y;
            seg.start.y += lift; seg.end.y += lift;
          } else {
            seg.start.addScaledVector(dir, depth);
            seg.end.addScaledVector(dir, depth);
          }
          moved = true;
        }
        return false;
      },
    });
    for (const d of dynamic) {
      if (!d.active) continue;
      // Capsule vs AABB: push out along the shallowest horizontal axis.
      const b = d.box;
      const cx = THREE.MathUtils.clamp(seg.start.x, b.min.x, b.max.x);
      const cz = THREE.MathUtils.clamp(seg.start.z, b.min.z, b.max.z);
      if (seg.end.y + radius < b.min.y || seg.start.y - radius > b.max.y) continue;
      const dx = seg.start.x - cx, dz = seg.start.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist < radius) {
        const push = radius - dist;
        const nx = dist > 1e-5 ? dx / dist : 1, nz = dist > 1e-5 ? dz / dist : 0;
        seg.start.x += nx * push; seg.start.z += nz * push;
        seg.end.x += nx * push; seg.end.z += nz * push;
        moved = true;
      }
    }
    feet.set(seg.start.x, seg.start.y - radius, seg.start.z);
    if (!moved) break;
  }
  delta.subVectors(feet, before);
  const grounded = delta.y > Math.abs(delta.length()) * 0.3 && delta.y > 1e-5;
  return { grounded, correction: delta };
}

/** Distance from a point to the nearest collider surface (for head-in-wall fade). */
export function distanceToGeometry(bvh: MeshBVH, p: THREE.Vector3, max: number): number {
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const hit = bvh.closestPointToPoint(p, target, 0, max);
  return hit ? hit.distance : max;
}
