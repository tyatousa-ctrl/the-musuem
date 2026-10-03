import * as THREE from 'three';

/**
 * Input abstraction (brief §11.1). Gameplay reads actions, never raw buttons.
 * Bindings are data: rebinding is an edit to BINDINGS below.
 */
export interface Actions {
  move: THREE.Vector2;      // x = strafe right, y = forward
  turn: number;             // smooth-turn axis, −1..1 (right positive)
  snapTurn: -1 | 0 | 1;     // edge-triggered
  lookDelta: THREE.Vector2; // desktop mouse look, radians
  sprint: boolean;
  crouch: boolean;
  grabLeft: boolean; grabRight: boolean;       // held
  useLeft: boolean; useRight: boolean;         // held
  useRightPressed: boolean;                    // edge
  shovePressed: boolean;                       // edge (desktop)
  grabLeftPressed: boolean; grabRightPressed: boolean; // edges (desktop toggles)
  menuToggle: boolean;      // edge
  uiSelect: boolean;        // edge
  perfToggle: boolean;      // edge
}

export const BINDINGS = {
  keyboard: {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'],
    grabRight: ['KeyE'], grabLeft: ['KeyQ'], shove: ['KeyF'],
    menu: ['Escape', 'Tab'], perf: ['F3', 'Backquote'],
  },
  mouse: { useRight: 0, uiSelect: 0 },
  /** xr-standard gamepad mapping: button indices and axes. */
  xr: {
    trigger: 0, squeeze: 1, thumbstickPress: 3, ax: 4, by: 5,
    stickX: 2, stickY: 3,
    /** Left Y held this long opens the menu (fallback when the menu button is not exposed). */
    menuHoldSec: 0.5,
  },
};

export class DesktopInput {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseDown = false;
  private mousePressed = false;
  private look = new THREE.Vector2();
  locked = false;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouseDown = true; this.mousePressed = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.x -= e.movementX * 0.0022;
      this.look.y -= e.movementY * 0.0022;
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
  }

  lock() { if (!this.locked) this.el.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (this.locked) document.exitPointerLock(); }

  private any(codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  private edge(codes: string[]) { return codes.some((c) => this.pressed.has(c)); }

  read(out: Actions) {
    const k = BINDINGS.keyboard;
    out.move.set((this.any(k.right) ? 1 : 0) - (this.any(k.left) ? 1 : 0), (this.any(k.forward) ? 1 : 0) - (this.any(k.back) ? 1 : 0));
    if (out.move.lengthSq() > 1) out.move.normalize();
    out.lookDelta.copy(this.look);
    this.look.set(0, 0);
    out.sprint = this.any(k.sprint);
    out.crouch = this.any(k.crouch);
    out.grabRightPressed = this.edge(k.grabRight);
    out.grabLeftPressed = this.edge(k.grabLeft);
    out.shovePressed = this.edge(k.shove);
    out.useRight = this.mouseDown;
    out.useRightPressed = this.mousePressed && this.locked;
    out.uiSelect = this.mousePressed;
    out.menuToggle = this.edge(k.menu);
    out.perfToggle = this.edge(k.perf);
    this.pressed.clear();
    this.mousePressed = false;
  }
}

export function emptyActions(): Actions {
  return {
    move: new THREE.Vector2(), turn: 0, snapTurn: 0, lookDelta: new THREE.Vector2(), sprint: false, crouch: false,
    grabLeft: false, grabRight: false, useLeft: false, useRight: false, useRightPressed: false, shovePressed: false,
    grabLeftPressed: false, grabRightPressed: false, menuToggle: false, uiSelect: false, perfToggle: false,
  };
}

/** Per-hand XR gamepad reader with edge detection and the menu-button fallback. */
export class XRInput {
  private prev = new Map<string, boolean[]>();
  private yHeld = 0;
  private yFired = false;
  private snapArmed = true;
  /** Last raw buttons/axes per hand, for the M2 button-index readout. */
  readonly raw: Record<'left' | 'right', { buttons: number[]; axes: number[] }> = { left: { buttons: [], axes: [] }, right: { buttons: [], axes: [] } };
  /** Index of a button that behaves like a menu button, if the browser exposes one. */
  menuButtonIndex: number | null = null;

  read(session: XRSession | null, dt: number, out: Actions) {
    out.move.set(0, 0); out.turn = 0; out.snapTurn = 0;
    out.grabLeft = out.grabRight = out.useLeft = out.useRight = false;
    out.menuToggle = false; out.uiSelect = false; out.sprint = false;
    if (!session) return;
    const b = BINDINGS.xr;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
      const hand = src.handedness;
      const pressed = gp.buttons.map((x) => x.pressed);
      const was = this.prev.get(hand) ?? [];
      const edge = (i: number) => !!pressed[i] && !was[i];
      this.raw[hand] = { buttons: gp.buttons.map((x) => +x.value.toFixed(2)), axes: gp.axes.map((x) => +x.toFixed(2)) };
      const ax = gp.axes[b.stickX] ?? 0, ay = gp.axes[b.stickY] ?? 0;
      if (hand === 'left') {
        out.move.set(Math.abs(ax) > 0.15 ? ax : 0, Math.abs(ay) > 0.15 ? -ay : 0);
        out.sprint = !!pressed[b.thumbstickPress];
        out.grabLeft = !!pressed[b.squeeze];
        out.useLeft = !!pressed[b.trigger];
        // Menu: a dedicated button if exposed (index > 5), else hold Y.
        for (let i = 6; i < pressed.length; i++) if (edge(i)) { this.menuButtonIndex = i; out.menuToggle = true; }
        if (pressed[b.by]) {
          this.yHeld += dt;
          if (this.yHeld >= b.menuHoldSec && !this.yFired) { out.menuToggle = true; this.yFired = true; }
        } else { this.yHeld = 0; this.yFired = false; }
        if (edge(b.trigger)) out.uiSelect = true;
      } else {
        out.turn = Math.abs(ax) > 0.2 ? ax : 0;
        if (Math.abs(ax) > 0.7 && this.snapArmed) { out.snapTurn = ax > 0 ? 1 : -1; this.snapArmed = false; }
        if (Math.abs(ax) < 0.3) this.snapArmed = true;
        out.grabRight = !!pressed[b.squeeze];
        out.useRight = !!pressed[b.trigger];
        if (edge(b.trigger)) out.uiSelect = true;
      }
      this.prev.set(hand, pressed);
    }
  }
}
