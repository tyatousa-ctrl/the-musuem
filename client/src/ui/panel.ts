import * as THREE from 'three';

export interface Button {
  id: string;
  x: number; y: number; w: number; h: number;
  enabled: boolean;
  onClick: () => void;
}

/**
 * A world-space canvas panel with clickable regions (brief §13: all VR UI is
 * world-space). Size in metres; canvas resolution in pixels per metre.
 */
export class Panel {
  readonly mesh: THREE.Mesh;
  readonly canvas = document.createElement('canvas');
  readonly g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  buttons: Button[] = [];
  hover: string | null = null;
  dirty = true;

  constructor(readonly widthM: number, readonly heightM: number, ppm = 420, private render: (p: Panel) => void = () => {}) {
    this.canvas.width = Math.round(widthM * ppm);
    this.canvas.height = Math.round(heightM * ppm);
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.mesh.userData.panel = this;
  }

  setRenderer(fn: (p: Panel) => void) { this.render = fn; this.dirty = true; }

  redraw() {
    this.buttons = [];
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.render(this);
    this.tex.needsUpdate = true;
    this.dirty = false;
  }

  update() { if (this.dirty) this.redraw(); }

  /** Draw and register a button. */
  button(id: string, label: string, x: number, y: number, w: number, h: number, opts: { enabled?: boolean; active?: boolean; small?: boolean; onClick: () => void }) {
    const g = this.g;
    const enabled = opts.enabled ?? true;
    const hot = this.hover === id && enabled;
    g.fillStyle = !enabled ? 'rgba(90,82,72,0.55)' : opts.active ? '#c9a24f' : hot ? '#5c4f3e' : '#3a3229';
    g.beginPath(); g.roundRect(x, y, w, h, Math.min(18, h / 2)); g.fill();
    g.strokeStyle = opts.active ? '#f3dc9a' : hot ? '#c9a24f' : 'rgba(201,162,79,0.45)';
    g.lineWidth = hot ? 4 : 2; g.stroke();
    g.fillStyle = !enabled ? 'rgba(243,234,217,0.45)' : opts.active ? '#1b1610' : '#f3ead9';
    g.font = `${opts.small ? 26 : 34}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x + w / 2, y + h / 2 + 1);
    if (!enabled) { g.font = '22px sans-serif'; g.fillText('🔒', x + w - 22, y + 22); }
    this.buttons.push({ id, x, y, w, h, enabled, onClick: opts.onClick });
  }

  text(t: string, x: number, y: number, size = 32, color = '#f3ead9', align: CanvasTextAlign = 'left', font = 'Georgia, serif') {
    const g = this.g;
    g.fillStyle = color; g.font = `${size}px ${font}`; g.textAlign = align; g.textBaseline = 'alphabetic';
    g.fillText(t, x, y);
  }

  background(color = 'rgba(24,20,16,0.92)', border = '#c9a24f') {
    const g = this.g;
    g.fillStyle = color;
    g.beginPath(); g.roundRect(4, 4, this.canvas.width - 8, this.canvas.height - 8, 28); g.fill();
    g.strokeStyle = border; g.lineWidth = 4; g.stroke();
  }

  buttonAt(uv: THREE.Vector2): Button | null {
    const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.canvas.height;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
  }

  setHover(id: string | null) { if (id !== this.hover) { this.hover = id; this.dirty = true; } }
}

const raycaster = new THREE.Raycaster();
const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();

/** Routes pointer rays (VR controllers, desktop crosshair/mouse) to panels. */
export class PanelInput {
  panels = new Set<Panel>();
  readonly rays: THREE.Line[] = [];

  constructor() {
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xf3dc9a, transparent: true, opacity: 0.7 }));
      line.scale.z = 2;
      line.visible = false;
      this.rays.push(line);
    }
  }

  /** Cast from each origin; returns the button under each ray. Clicks fire on `select[i]`. */
  update(origins: { origin: THREE.Object3D | null; select: boolean; camera?: THREE.Camera; ndc?: THREE.Vector2 }[]) {
    const hovered = new Map<Panel, string | null>();
    for (const p of this.panels) hovered.set(p, null);
    const meshes = [...this.panels].filter((p) => p.mesh.visible && isVisible(p.mesh)).map((p) => p.mesh);
    origins.forEach((o, i) => {
      if (o.ndc && o.camera) raycaster.setFromCamera(o.ndc, o.camera);
      else if (o.origin) {
        o.origin.getWorldPosition(tmpO);
        tmpD.set(0, 0, -1).applyQuaternion(o.origin.getWorldQuaternion(new THREE.Quaternion()));
        raycaster.set(tmpO, tmpD);
      } else return;
      raycaster.far = 6;
      const hit = raycaster.intersectObjects(meshes, false)[0];
      const ray = this.rays[i];
      if (ray) {
        ray.visible = !!o.origin && !o.ndc && meshes.length > 0 && !!hit;
        if (hit) ray.scale.z = hit.distance;
      }
      if (!hit?.uv) return;
      const panel = hit.object.userData.panel as Panel;
      const b = panel.buttonAt(hit.uv);
      if (b?.enabled) {
        hovered.set(panel, b.id);
        if (o.select) b.onClick();
      }
    });
    for (const [p, id] of hovered) p.setHover(id);
  }
}

function isVisible(o: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}
