import * as THREE from 'three';

/**
 * Perf HUD (brief §9.3): fps, frame time, draw calls, triangles, visible rooms,
 * NPC count, network RTT. DOM overlay on desktop; a canvas panel in VR.
 */
export class PerfHud {
  private el: HTMLDivElement;
  private frames = 0;
  private acc = 0;
  private worst = 0;
  fps = 0;
  ms = 0;
  rtt = 0;
  npcs = 0;
  rooms: string[] = [];
  readonly panel: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  visible: boolean;

  constructor(show: boolean) {
    this.visible = show;
    this.el = document.createElement('div');
    this.el.id = 'perf';
    this.el.style.cssText = 'position:fixed;top:8px;left:8px;font:12px/1.35 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.65);padding:6px 8px;border-radius:6px;z-index:20;white-space:pre;pointer-events:none';
    this.el.style.display = show ? 'block' : 'none';
    document.body.appendChild(this.el);
    this.canvas.width = 512; this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.panel.renderOrder = 100;
    this.panel.visible = false;
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  frame(dt: number, renderer: THREE.WebGLRenderer, inXR: boolean) {
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.acc < 0.5) return;
    this.fps = this.frames / this.acc;
    this.ms = (this.acc / this.frames) * 1000;
    const info = renderer.info.render;
    const text = [
      `fps ${this.fps.toFixed(0)}  ${this.ms.toFixed(1)} ms (worst ${(this.worst * 1000).toFixed(0)})`,
      `draws ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k`,
      `rooms ${this.rooms.length}: ${this.rooms.join(' ')}`,
      `npcs ${this.npcs}  rtt ${this.rtt.toFixed(0)} ms`,
    ].join('\n');
    this.frames = 0; this.acc = 0; this.worst = 0;
    if (!this.visible) { this.panel.visible = false; return; }
    this.el.textContent = text;
    this.panel.visible = inXR;
    if (inXR) {
      const g = this.canvas.getContext('2d')!;
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#3f3'; g.font = '26px monospace';
      text.split('\n').forEach((l, i) => g.fillText(l.slice(0, 34), 12, 44 + i * 50));
      this.tex.needsUpdate = true;
    }
  }
}
