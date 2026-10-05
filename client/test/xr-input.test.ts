import { describe, expect, it } from 'vitest';
import { XRInput, emptyActions } from '../src/player/input';

/** A fake XR session with one left controller: stick axes and button 3 (stick click). */
function session(ax: number, ay: number, click: boolean) {
  const buttons = Array.from({ length: 6 }, (_, i) => ({ pressed: i === 3 && click, value: i === 3 && click ? 1 : 0 }));
  return { inputSources: [{ handedness: 'left', gamepad: { buttons, axes: [0, 0, ax, ay] } }] } as unknown as XRSession;
}

describe('VR sprint (brief §11.2)', () => {
  it('clicking the left stick turns sprint on; it stays on while moving and stops when you stop', () => {
    const x = new XRInput();
    const a = emptyActions();
    x.read(session(0, -1, false), 0.016, a);
    expect(a.sprint).toBe(false);
    x.read(session(0, -1, true), 0.016, a); // click
    expect(a.sprint).toBe(true);
    for (let i = 0; i < 60; i++) x.read(session(0, -1, false), 0.016, a); // keep pushing forward, button released
    expect(a.sprint).toBe(true);
    for (let i = 0; i < 30; i++) x.read(session(0, 0, false), 0.016, a); // let go of the stick
    expect(a.sprint).toBe(false);
  });

  it('clicking again turns sprint off', () => {
    const x = new XRInput();
    const a = emptyActions();
    x.read(session(0, -1, true), 0.016, a);
    x.read(session(0, -1, false), 0.016, a);
    x.read(session(0, -1, true), 0.016, a);
    expect(a.sprint).toBe(false);
  });
});
