import * as THREE from 'three';

/**
 * A big countdown in the bottom-right corner of your view (modes with a short
 * clock, like Fix the Exhibit). Desktop: a screen element. VR: a small card
 * fixed to the headset, low and to the right so it never blocks the room.
 */
export class CornerTimer {
  private el: HTMLDivElement;
  private canvas = document.createElement('canvas');
  private sprite: THREE.Sprite;
  private text = '';

  constructor(camera: THREE.Camera) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;right:20px;bottom:18px;z-index:9;color:#f3ead9;font:bold 44px/1.1 Georgia,serif;text-align:right;text-shadow:0 2px 8px #000;pointer-events:none;display:none';
    document.body.appendChild(this.el);
    this.canvas.width = 256; this.canvas.height = 128;
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
    this.sprite.renderOrder = 998;
    this.sprite.scale.set(0.12, 0.06, 1);
    this.sprite.position.set(0.16, -0.12, -0.45);
    this.sprite.visible = false;
    camera.add(this.sprite);
  }

  /** text: two lines "label\nvalue", or '' to hide. */
  update(text: string, xr: boolean) {
    this.el.style.display = text && !xr ? 'block' : 'none';
    this.sprite.visible = !!text && xr;
    if (text === this.text) return;
    this.text = text;
    const [label, value] = text.split('\n');
    this.el.innerHTML = text ? `<div style="font-size:16px;font-weight:400;opacity:.8">${label ?? ''}</div>${value ?? ''}` : '';
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 128);
    if (!text) return;
    g.fillStyle = 'rgba(20,16,12,0.75)'; g.beginPath(); g.roundRect(4, 4, 248, 120, 18); g.fill();
    g.fillStyle = '#f3ead9'; g.textAlign = 'center';
    g.font = '24px Georgia, serif'; g.fillText(label ?? '', 128, 38);
    g.font = 'bold 60px Georgia, serif'; g.fillText(value ?? '', 128, 102);
    (this.sprite.material.map as THREE.Texture).needsUpdate = true;
  }
}
