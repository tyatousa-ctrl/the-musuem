import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Asset manifest (brief §8.1). Code asks for logical ids, never paths. An entry
 * with `file: null` (or a file that fails to load) falls back to the procedural
 * placeholder and logs a warning: the game must always boot.
 */
export interface AssetEntry { type: 'json' | 'gltf' | 'texture'; file: string | null; tier: string; licence: string; source: string; scale?: number; yOffset?: number }

class Manifest {
  private entries = new Map<string, AssetEntry>();
  private gltf = new GLTFLoader();

  async load() {
    try {
      const res = await fetch('/assets/manifest.json');
      const data = (await res.json()) as { assets: Record<string, AssetEntry> };
      for (const [id, e] of Object.entries(data.assets)) this.entries.set(id, e);
    } catch (e) {
      console.warn('[assets] manifest.json missing; everything is procedural', e);
    }
  }

  get(id: string) { return this.entries.get(id); }
  url(id: string) { const e = this.entries.get(id); return e?.file ? `/assets/${e.file}` : null; }
  /** True when a real file should replace the procedural version. */
  has(id: string) { return !!this.entries.get(id)?.file; }

  async model(id: string): Promise<THREE.Object3D | null> {
    const url = this.url(id);
    if (!url) return null;
    try {
      const g = await this.gltf.loadAsync(url);
      const e = this.entries.get(id)!;
      g.scene.scale.setScalar(e.scale ?? 1);
      g.scene.position.y += e.yOffset ?? 0;
      return g.scene;
    } catch (err) {
      console.warn(`[assets] ${id} failed to load (${url}); keeping the placeholder`, err);
      return null;
    }
  }
}

export const assets = new Manifest();
