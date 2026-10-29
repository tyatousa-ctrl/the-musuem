import * as THREE from 'three';
import { museum, roomAt, type Room } from '@museum/shared';

/**
 * The museum map: all three floors side by side, the floor you're on
 * highlighted, a "you are here" arrow, other players, and rooms you have
 * visited shaded. One button opens it and the same button closes it
 * (M or the on-screen Map button on desktop, X on the left controller in VR).
 * Desktop shows it as a screen overlay; VR as a card floating in front of you.
 */
export type Floor = 'upper' | 'ground' | 'service';
export const FLOORS: { id: Floor; label: string }[] = [
  { id: 'upper', label: 'Upper floor' },
  { id: 'ground', label: 'Ground floor' },
  { id: 'service', label: 'Service level' },
];

/** The front plaza is 2.4 m below the museum floor but belongs with the ground floor; service is at −6 m. */
export function floorOf(feetY: number): Floor {
  return feetY < -4 ? 'service' : feetY >= 5 ? 'upper' : 'ground';
}

const roomFloor = (r: Room): Floor | null => (r.open ? null : r.floorY < -2 ? 'service' : r.floorY >= 5 ? 'upper' : 'ground');

// Plan extents shown (the building plus the front steps), north up, east to the right.
const X0 = -62, X1 = 52, Z0 = -78, Z1 = 78;
const W = 1536, H = 900, PAD = 24, TOP = 92;
const PANEL_W = (W - PAD * 4) / 3;
const SCALE = Math.min(PANEL_W / (X1 - X0), (H - TOP - PAD - 30) / (Z1 - Z0));

export interface MapPlayer { x: number; z: number; feetY: number; yaw?: number; name: string; me?: boolean; color?: string }

export class MiniMap {
  open = false;
  readonly canvas = document.createElement('canvas');
  readonly mesh: THREE.Mesh;
  private texture: THREE.CanvasTexture;
  private el: HTMLDivElement;
  private button: HTMLButtonElement;
  private redrawIn = 0;

  constructor(scene: THREE.Object3D, onButton: () => void) {
    this.canvas.width = W; this.canvas.height = H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, (1.0 * H) / W), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }));
    this.mesh.renderOrder = 997;
    this.mesh.visible = false;
    this.mesh.name = 'minimap';
    scene.add(this.mesh);

    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:none;place-items:center;z-index:12;pointer-events:none;background:rgba(10,8,6,.35)';
    this.canvas.style.cssText = 'width:min(94vw,160vh);height:auto;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.6)';
    this.el.appendChild(this.canvas);
    document.body.appendChild(this.el);

    this.button = document.createElement('button');
    this.button.id = 'mapBtn';
    this.button.style.cssText = 'position:fixed;left:14px;top:12px;z-index:13;font:16px Georgia,serif;padding:10px 18px;border-radius:999px;border:1px solid #c9a24f;background:rgba(20,16,12,.85);color:#f3ead9;cursor:pointer;display:none';
    this.button.onclick = (e) => { e.stopPropagation(); onButton(); };
    this.button.onmousedown = (e) => e.stopPropagation();
    document.body.appendChild(this.button);
    this.label();
  }

  private label() { this.button.textContent = this.open ? '✕ Close map (M)' : '🗺 Map (M)'; }

  /** Show the on-screen button (desktop, while playing). */
  showButton(v: boolean) { this.button.style.display = v ? 'block' : 'none'; }

  toggle(xr: boolean, camera: THREE.Camera) {
    this.open = !this.open;
    this.label();
    this.redrawIn = 0;
    if (this.open && xr) {
      // Float it in front of you, a little below eye level, facing you.
      const head = camera.getWorldPosition(new THREE.Vector3());
      const dir = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      this.mesh.position.copy(head).addScaledVector(dir, 0.75).setY(head.y - 0.12);
      this.mesh.lookAt(head.x, head.y - 0.12, head.z);
    }
  }

  update(dt: number, xr: boolean, players: MapPlayer[], visited: Set<string>) {
    this.el.style.display = this.open && !xr ? 'grid' : 'none';
    this.mesh.visible = this.open && xr;
    if (!this.open) return;
    this.redrawIn -= dt;
    if (this.redrawIn > 0) return;
    this.redrawIn = 0.2;
    this.draw(players, visited);
    this.texture.needsUpdate = true;
  }

  private draw(players: MapPlayer[], visited: Set<string>) {
    const g = this.canvas.getContext('2d')!;
    const me = players.find((p) => p.me);
    const current = me ? floorOf(me.feetY) : 'ground';
    // The room you're in (a balcony or catwalk belongs to the hall below it).
    const inside = me ? roomAt(museum, me.x, me.feetY + 1, me.z) : undefined;
    const here = inside && !inside.open ? inside : undefined;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(24,20,16,0.96)';
    g.beginPath(); g.roundRect(0, 0, W, H, 28); g.fill();
    g.strokeStyle = '#c9a24f'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#f3dc9a'; g.font = 'bold 38px Georgia, serif'; g.textAlign = 'left';
    g.fillText('MUSEUM MAP', PAD + 6, 50);
    g.fillStyle = '#f3ead9'; g.font = '22px Georgia, serif';
    g.fillText(here ? `You are in ${here.name} · ${FLOORS.find((f) => f.id === current)!.label}` : `You are outside · ${FLOORS.find((f) => f.id === current)!.label}`, PAD + 300, 48);
    g.textAlign = 'right'; g.globalAlpha = 0.7; g.font = '18px Georgia, serif';
    g.fillText('N ↑   Entrance →   Press the map button again to close', W - PAD, 48);
    g.globalAlpha = 1;

    FLOORS.forEach((f, i) => {
      const ox = PAD + i * (PANEL_W + PAD), oy = TOP;
      const active = f.id === current;
      const tx = (x: number) => ox + (x - X0) * SCALE + (PANEL_W - (X1 - X0) * SCALE) / 2;
      const tz = (z: number) => oy + 40 + (z - Z0) * SCALE;
      // Panel and title; the floor you're on is highlighted.
      g.fillStyle = active ? 'rgba(201,162,79,0.18)' : 'rgba(255,255,255,0.04)';
      g.beginPath(); g.roundRect(ox, oy, PANEL_W, H - oy - PAD, 18); g.fill();
      g.lineWidth = active ? 5 : 2; g.strokeStyle = active ? '#e9c46a' : 'rgba(243,234,217,0.25)'; g.stroke();
      g.textAlign = 'center';
      g.fillStyle = active ? '#ffd56b' : 'rgba(243,234,217,0.6)';
      g.font = `${active ? 'bold ' : ''}26px Georgia, serif`;
      g.fillText(active ? `★ ${f.label.toUpperCase()} — YOU ARE HERE` : f.label, ox + PANEL_W / 2, oy + 30);
      g.globalAlpha = active ? 1 : 0.55;

      // Rooms (and the balconies, catwalks and mezzanines that make up the upper walkways).
      for (const r of museum.rooms) {
        if (roomFloor(r) !== f.id) continue;
        const isHere = active && here?.id === r.id;
        g.fillStyle = isHere ? '#c9a24f' : visited.has(r.id) ? '#6b5a40' : '#3d342a';
        g.fillRect(tx(r.x0), tz(r.z0), (r.x1 - r.x0) * SCALE, (r.z1 - r.z0) * SCALE);
        g.strokeStyle = 'rgba(243,234,217,0.55)'; g.lineWidth = 1.5;
        g.strokeRect(tx(r.x0), tz(r.z0), (r.x1 - r.x0) * SCALE, (r.z1 - r.z0) * SCALE);
      }
      if (f.id === 'upper') {
        for (const p of museum.platforms) {
          if (p.y < 5) continue;
          g.fillStyle = active && here && p.room === here.id && me && p.y >= 5 ? '#c9a24f' : '#4e4434';
          g.fillRect(tx(p.x0), tz(p.z0), (p.x1 - p.x0) * SCALE, (p.z1 - p.z0) * SCALE);
          g.strokeStyle = 'rgba(243,234,217,0.4)'; g.lineWidth = 1;
          g.strokeRect(tx(p.x0), tz(p.z0), (p.x1 - p.x0) * SCALE, (p.z1 - p.z0) * SCALE);
        }
      }
      if (f.id === 'ground') {
        // The front steps and plaza, for orientation.
        g.fillStyle = '#2c2a26';
        g.fillRect(tx(39), tz(-18), (50 - 39) * SCALE, 36 * SCALE);
        g.fillStyle = 'rgba(243,234,217,0.6)'; g.font = '13px Georgia, serif';
        g.save(); g.translate(tx(46), tz(0)); g.rotate(-Math.PI / 2); g.fillText('ENTRANCE', 0, 4); g.restore();
      }
      // Doorways: short light marks across the walls.
      g.strokeStyle = '#f3ead9'; g.lineWidth = 3;
      for (const p of museum.portals) {
        const a = museum.rooms.find((r) => r.id === p.a), b = museum.rooms.find((r) => r.id === p.b);
        const fl = Math.abs(p.y) < 0.5 ? 'ground' : p.y >= 5 ? 'upper' : 'service';
        if (fl !== f.id || p.kind === 'opening' || p.kind === 'secret' || !a || !b) continue;
        g.beginPath();
        if (p.axis === 'x') { g.moveTo(tx(p.x - p.width / 2), tz(p.z)); g.lineTo(tx(p.x + p.width / 2), tz(p.z)); }
        else { g.moveTo(tx(p.x), tz(p.z - p.width / 2)); g.lineTo(tx(p.x), tz(p.z + p.width / 2)); }
        g.stroke();
      }
      // Stairs and elevators link the floors.
      for (const s of museum.stairs) {
        const lo = Math.min(s.y0, s.y1), hi = Math.max(s.y0, s.y1);
        const onThis = (f.id === 'ground' && lo <= 0.1 && hi >= -0.1) || (f.id === 'upper' && hi >= 5) || (f.id === 'service' && lo < -2);
        if (!onThis || s.room === 'exterior') continue;
        g.fillStyle = 'rgba(111,224,180,0.55)';
        g.fillRect(tx(s.x0), tz(s.z0), (s.x1 - s.x0) * SCALE, (s.z1 - s.z0) * SCALE);
      }
      if (f.id !== 'service') {
        for (const e of museum.elevators) {
          g.fillStyle = '#6fb4e0';
          g.fillRect(tx(e.x) - 6, tz(e.z) - 6, 12, 12);
        }
      }
      // Room names on the bigger rooms.
      g.fillStyle = '#f3ead9'; g.textAlign = 'center';
      for (const r of museum.rooms) {
        if (roomFloor(r) !== f.id) continue;
        const w = (r.x1 - r.x0) * SCALE, h = (r.z1 - r.z0) * SCALE;
        if (w < 50 || h < 24) continue;
        const name = shortName(r.name);
        g.font = `${Math.min(14, Math.max(10, w / name.length * 1.6))}px Georgia, serif`;
        g.fillText(name, tx((r.x0 + r.x1) / 2), tz((r.z0 + r.z1) / 2) + 4, w - 4);
      }
      g.globalAlpha = 1;

      // Players on this floor: you as an arrow, others as dots with names.
      for (const p of players) {
        if (floorOf(p.feetY) !== f.id) continue;
        const px = tx(p.x), pz = tz(p.z);
        if (p.me) {
          const yaw = p.yaw ?? 0;
          g.save(); g.translate(px, pz); g.rotate(-yaw);
          g.fillStyle = '#ff5a3a'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
          g.beginPath(); g.moveTo(0, -15); g.lineTo(10, 11); g.lineTo(0, 5); g.lineTo(-10, 11); g.closePath(); g.fill(); g.stroke();
          g.restore();
          g.strokeStyle = 'rgba(255,90,58,0.6)'; g.lineWidth = 2;
          g.beginPath(); g.arc(px, pz, 22, 0, Math.PI * 2); g.stroke();
        } else {
          g.fillStyle = p.color ?? '#6fe0b4';
          g.beginPath(); g.arc(px, pz, 7, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#f3ead9'; g.font = '13px Georgia, serif'; g.fillText(p.name, px, pz - 11);
        }
      }
    });

    // Legend.
    const ly = H - PAD - 6;
    g.textAlign = 'left'; g.font = '16px Georgia, serif';
    const key: [string, string][] = [['#ff5a3a', 'You'], ['#6fe0b4', 'Friends'], ['#c9a24f', 'Your room'], ['#6b5a40', 'Visited'], ['rgba(111,224,180,0.55)', 'Stairs'], ['#6fb4e0', 'Elevator']];
    let lx = PAD + 16;
    for (const [c, t] of key) {
      g.fillStyle = c; g.fillRect(lx, ly - 12, 14, 14);
      g.fillStyle = '#f3ead9'; g.fillText(t, lx + 20, ly);
      lx += 30 + g.measureText(t).width + 18;
    }
  }
}

const shortName = (n: string) => n.replace(/^(Egyptian Art|European Paintings) — /, '').replace('Arts of Africa, Oceania, and the Americas', 'Africa · Oceania · Americas').replace('Modern and Contemporary Art', 'Modern Art').replace('European Paintings ', 'Paintings ');
