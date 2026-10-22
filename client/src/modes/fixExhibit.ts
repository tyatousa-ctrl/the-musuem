import * as THREE from 'three';
import type { ServerEvents } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import { fmtTime } from '../ui/menus';
import type { ClientMode } from './index';

/**
 * Fix the Exhibit on the client: the countdown in the bottom-right corner,
 * other players hidden (no copying), and a click with a gold flash when a
 * piece snaps into place. Everyone's pieces are private (see WorldObjects).
 */
let off: (() => void) | null = null;
let flashes: { m: THREE.Mesh; life: number }[] = [];
const ringGeo = new THREE.RingGeometry(0.5, 0.62, 40).rotateX(-Math.PI / 2);

export const fixExhibit: ClientMode = {
  id: 'fixExhibit',
  enter(ctx) {
    ctx.setAvatarsHidden(true);
    off = ctx.net.on('snap', (m: ServerEvents['snap']) => {
      ctx.audio.play('click', m.pos, { gain: 1.2 });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 1, depthWrite: false }));
      const floor = ctx.playerPos().y;
      ring.position.set(m.pos[0], floor + 0.03, m.pos[2]);
      ctx.scene.add(ring);
      flashes.push({ m: ring, life: 0.8 });
    });
  },
  exit(ctx) {
    off?.(); off = null;
    ctx.setAvatarsHidden(false);
    for (const f of flashes) f.m.removeFromParent();
    flashes = [];
  },
  update(_ctx, dt) {
    for (const f of flashes) {
      f.life -= dt;
      f.m.scale.setScalar(1 + (0.8 - f.life) * 1.5);
      (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.8);
    }
    flashes = flashes.filter((f) => { if (f.life > 0) return true; f.m.removeFromParent(); return false; });
  },
  hud(ctx) {
    const s = ctx.net.state;
    let placed = 0, total = 0;
    s.objects?.forEach((o: NetState) => { if (o.kind === 'piece' && o.owner === ctx.net.playerId) { total++; if (o.status === 'home') placed++; } });
    const me = ctx.net.me();
    if (me?.status === 'spectating') return ['Spectating until the next round', 'Everyone is fixing their own exhibit', ''];
    switch (s.modePhase) {
      case 'memorize': return ['MEMORISE THE ROOM', 'Where is everything?', `${total} pieces`];
      case 'blind': return ['Eyes closed…', 'Someone is moving things around', ''];
      case 'solve': return ['PUT IT ALL BACK', `${placed} of ${total} in place`, 'Within a foot, it clicks into place'];
      default: return ['Fix the Exhibit', 'Get ready to memorise the Sculpture Court', ''];
    }
  },
  corner(ctx) {
    const s = ctx.net.state;
    const left = fmtTime(s.modePhaseEndsAt - ctx.net.serverNow());
    if (s.modePhase === 'memorize') return `Memorise\n${left}`;
    if (s.modePhase === 'blind') return `Eyes closed\n${left}`;
    if (s.modePhase === 'solve') return `Fix it\n${left}`;
    return '';
  },
};
