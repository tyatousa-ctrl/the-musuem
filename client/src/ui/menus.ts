import * as THREE from 'three';
import { MODE_CATALOG, tunables, type ModeId } from '@museum/shared';
import { Panel } from './panel';
import type { Net, NetState } from '../multiplayer/net';
import type { AudioEngine } from '../audio/audio';
import type { Player } from '../player/player';
import { savePref } from '../core/identity';

const GOLD = '#c9a24f', CREAM = '#f3ead9', DIM = 'rgba(243,234,217,0.6)';

export function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function inviteLink(slug: string) { return `${location.origin}/party/${slug}`; }

// ─── Personal menu (brief §13.1) ────────────────────────────────────────────
export class PersonalMenu {
  readonly panel = new Panel(0.62, 0.98, 700);
  open = false;
  private confirmLeave = false;
  private anchor = new THREE.Vector3();

  /** Hooks for the map and the host's End round button (set by the game). */
  hooks = { openMap: () => {}, isHost: () => false, roundActive: () => false, endRound: () => {} };

  constructor(private audio: AudioEngine, private player: Player, private onLeave: () => void, private onClose: () => void) {
    this.panel.mesh.visible = false;
    this.panel.mesh.renderOrder = 50;
    this.panel.setRenderer((p) => this.draw(p));
  }

  toggle() { if (this.open) this.close(); else this.show(); }

  show() {
    this.open = true;
    this.confirmLeave = false;
    this.place();
    this.panel.mesh.visible = true;
    this.panel.dirty = true;
  }

  close() { this.open = false; this.panel.mesh.visible = false; this.onClose(); }

  /** 1.3 m in front at chest height, tilted toward the player; never closer than 0.75 m. */
  private place() {
    const cam = this.player.camera;
    const head = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const dist = this.player.inXR ? 1.3 : 0.95;
    this.anchor.copy(head).addScaledVector(fwd, dist);
    this.anchor.y = head.y - (this.player.inXR ? 0.35 : 0.1);
    this.panel.mesh.position.copy(this.anchor);
    this.panel.mesh.lookAt(head.x, head.y, head.z);
  }

  update() {
    if (!this.open) return;
    // Re-place if the player walks away.
    const head = this.player.camera.getWorldPosition(new THREE.Vector3());
    const d = head.distanceTo(this.anchor);
    if (d > 2.4 || d < 0.75) this.place();
    this.panel.update();
  }

  private draw(p: Panel) {
    const W = p.canvas.width;
    p.background();
    p.text('Menu', W / 2, 74, 46, GOLD, 'center');
    const a = this.audio;
    let y = 110;
    const row = 78, h = 64, x = 40, w = W - 80;
    p.button('resume', 'Resume', x, y, w / 2 - 8, h, { onClick: () => this.close() });
    p.button('map', 'Map', x + w / 2 + 8, y, w / 2 - 8, h, { onClick: () => { this.close(); this.hooks.openMap(); } }); y += row;
    p.button('music', `Music: ${a.musicOn ? 'On' : 'Off'}`, x, y, w - 170, h, { active: a.musicOn, onClick: () => { a.setMusic(!a.musicOn); p.dirty = true; } });
    p.button('musicDown', '−', x + w - 160, y, 75, h, { onClick: () => { a.nudgeMusic(-0.1); p.dirty = true; } });
    p.button('musicUp', '+', x + w - 75, y, 75, h, { onClick: () => { a.nudgeMusic(0.1); p.dirty = true; } }); y += h + 26;
    p.text(`music volume ${Math.round(a.musicVol * 100)}%`, x + 16, y - 6, 20, DIM);
    y += 14;
    p.button('fx', `Effects: ${a.fxOn ? 'On' : 'Off'}`, x, y, w - 170, h, { active: a.fxOn, onClick: () => { a.setFx(!a.fxOn); p.dirty = true; } });
    p.button('fxDown', '−', x + w - 160, y, 75, h, { onClick: () => { a.nudgeFx(-0.1); p.dirty = true; } });
    p.button('fxUp', '+', x + w - 75, y, 75, h, { onClick: () => { a.nudgeFx(0.1); p.dirty = true; } }); y += h + 26;
    p.text(`effects volume ${Math.round(a.fxVol * 100)}%`, x + 16, y - 6, 20, DIM);
    y += 14;
    p.button('vignette', `Comfort vignette: ${this.player.vignetteOn ? 'On' : 'Off'}`, x, y, w, h, { active: this.player.vignetteOn, small: true, onClick: () => { this.player.vignetteOn = !this.player.vignetteOn; savePref('vignette', this.player.vignetteOn); p.dirty = true; } }); y += row;
    p.button('recenter', 'Recenter', x, y, w, h, { onClick: () => { this.player.recenter(); this.close(); } }); y += row;
    if (this.hooks.isHost() && this.hooks.roundActive()) {
      p.button('endRound', 'End round · back to lobby', x, y, w, h, { onClick: () => { this.hooks.endRound(); this.close(); } }); y += row;
    }
    if (!this.confirmLeave) p.button('leave', 'Leave party', x, y, w, h, { onClick: () => { this.confirmLeave = true; p.dirty = true; } });
    else {
      p.button('leaveYes', 'Really leave', x, y, w / 2 - 8, h, { active: true, onClick: () => this.onLeave() });
      p.button('leaveNo', 'Stay', x + w / 2 + 8, y, w / 2 - 8, h, { onClick: () => { this.confirmLeave = false; p.dirty = true; } });
    }
  }
}

// ─── Lobby totem (brief §13.2) ──────────────────────────────────────────────
export class LobbyTotem {
  readonly group = new THREE.Group();
  readonly panel = new Panel(1.5, 2.5, 520);
  private lastKey = '';
  copied = 0;

  constructor(private net: Net, private audio: AudioEngine, pos: THREE.Vector3, yaw: number) {
    // A free-standing illuminated wayfinding totem: bronze frame on a stone base.
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.6), new THREE.MeshLambertMaterial({ color: 0xd9cfbf }));
    base.position.y = 0.175;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.66, 2.72, 0.14), new THREE.MeshLambertMaterial({ color: 0x6a5434 }));
    frame.position.set(0, 1.75, -0.02);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.1), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0, 1.75, 0.09);
    this.panel.mesh.position.set(0, 1.75, 0.08);
    this.group.add(base, frame, glow, this.panel.mesh);
    this.group.position.copy(pos);
    this.group.rotation.y = yaw;
    this.panel.setRenderer((p) => this.draw(p));
  }

  update() {
    const s = this.net.state;
    if (!s) return;
    const players: string[] = [];
    s.players?.forEach((p: NetState) => players.push(`${p.id}:${p.name}:${p.status}`));
    const key = [s.hostId, s.mode, s.phase, s.ctrScoreLimit, s.ctrTimeMin, s.tourTimeMin, s.huntTimeMin, s.huntTeams, players.join(','), this.audio.musicOn, this.audio.fxOn, this.copied > Date.now()].join('|');
    if (key !== this.lastKey) { this.lastKey = key; this.panel.dirty = true; }
    this.panel.update();
  }

  private draw(p: Panel) {
    const s = this.net.state;
    const W = p.canvas.width;
    const host = this.net.isHost();
    p.background('rgba(26,22,18,0.95)');
    p.text('THE MUSEUM', W / 2, 78, 52, GOLD, 'center');
    p.text('after-hours party', W / 2, 116, 26, DIM, 'center');

    // Members.
    let y = 170;
    p.text('Party', 40, y, 32, GOLD); y += 12;
    s.players?.forEach((pl: NetState) => {
      y += 40;
      const me = pl.id === this.net.playerId;
      p.text(`${pl.id === s.hostId ? '♛ ' : '   '}${pl.name}${me ? ' (you)' : ''}${pl.status === 'reconnecting' ? ' · reconnecting' : ''}`, 50, y, 28, me ? CREAM : DIM);
    });
    y = 380;
    // Invite link.
    p.text('Invite friends', 40, y, 32, GOLD);
    const link = inviteLink(this.net.opts.slug).replace(/^https?:\/\//, '');
    p.text(link, 50, y + 42, link.length > 40 ? 22 : 26, CREAM, 'left', 'ui-monospace, monospace');
    p.button('copy', this.copied > Date.now() ? 'Copied!' : 'Copy invite link', W - 330, y - 34, 290, 52, { small: true, onClick: () => {
      void navigator.clipboard?.writeText(inviteLink(this.net.opts.slug)).catch(() => {});
      this.copied = Date.now() + 2000; this.audio.play('ui'); p.dirty = true;
    } });

    // Mode cards.
    y = 480;
    p.text(host ? 'Choose a game' : 'Game (host chooses)', 40, y, 32, GOLD);
    y += 20;
    // Compact cards so all seven games and the selected game's settings fit above Start.
    const cardH = 62;
    for (const m of MODE_CATALOG) {
      const active = s.mode === m.id;
      const enabled = host && m.available && s.phase === 'lobby';
      p.button(`mode:${m.id}`, '', 40, y, W - 80, cardH, { active, enabled: enabled || active, onClick: () => { if (enabled) { this.net.send('selectMode', { mode: m.id as ModeId }); this.audio.play('ui'); } } });
      p.text(m.name + (m.available ? '' : '  · coming soon'), 64, y + 28, 27, active ? '#1b1610' : CREAM);
      p.text(`${m.pitch}  (${m.players})`, 64, y + 52, 18, active ? '#3a2e1c' : DIM);
      y += cardH + 6;
    }

    // Settings for the selected mode.
    y += 14;
    const setting = (label: string, key: string, value: number, step: number) => {
      p.text(`${label}: ${value}`, 50, y + 38, 28, CREAM);
      p.button(`${key}-`, '−', W - 220, y, 80, 54, { enabled: host, onClick: () => this.net.send('setSetting', { key, value: value - step }) });
      p.button(`${key}+`, '+', W - 120, y, 80, 54, { enabled: host, onClick: () => this.net.send('setSetting', { key, value: value + step }) });
      y += 66;
    };
    if (s.mode === 'ctr') { setting('Captures to win', 'ctrScoreLimit', s.ctrScoreLimit, 1); setting('Time limit (min)', 'ctrTimeMin', s.ctrTimeMin, 1); }
    if (s.mode === 'tour') { p.text('No timer. End it from your menu (Tab / ☰) when you are done.', 50, y + 38, 26, CREAM); y += 56; }
    if (s.mode === 'artifactHunt') {
      setting('Time limit (min)', 'huntTimeMin', s.huntTimeMin, 1);
      p.text(`Play as: ${s.huntTeams ? 'Teams' : 'Free-for-all'}`, 50, y + 38, 28, CREAM);
      p.button('huntTeams', s.huntTeams ? 'Switch to FFA' : 'Switch to teams', W - 320, y, 280, 54, { small: true, enabled: host, onClick: () => this.net.send('setSetting', { key: 'huntTeams', value: !s.huntTeams }) });
      y += 66;
    }
    if (s.mode === 'insuranceFraud') {
      p.text(`${tunables.insuranceFraud.timeLimitSec / 60} minutes. Biggest insurance bill wins.`, 50, y + 38, 26, CREAM);
      y += 56;
    }
    if (s.mode === 'hideSeek') {
      p.text(`${tunables.hideSeek.timeLimitSec / 60} min. Hiders call out every ${tunables.hideSeek.pingEverySec / 60} min.`, 50, y + 38, 26, CREAM);
      y += 56;
    }
    if (s.mode === 'fixExhibit') {
      p.text(`Memorise ${tunables.fixExhibit.memorizeSec} s, fix it in ${tunables.fixExhibit.solveSec / 60} min. No copying!`, 50, y + 38, 26, CREAM);
      y += 56;
    }
    if (s.mode === 'crowdControl') {
      p.text('Five waves of tourists. Turn the strays around.', 50, y + 38, 26, CREAM);
      y += 56;
    }

    // Start + audio toggles at the bottom.
    const bottom = p.canvas.height - 100;
    const phaseText = s.phase === 'lobby' ? (host ? '' : 'Waiting for the host to start…') : s.phase === 'countdown' ? 'Starting…' : s.phase === 'playing' ? 'Round in progress' : 'Round over';
    if (phaseText) p.text(phaseText, W / 2, bottom - 30, 26, DIM, 'center');
    p.button('start', 'Start round', 40, bottom, W / 2 - 50, 70, { active: host && s.phase === 'lobby', enabled: host && s.phase === 'lobby', onClick: () => { this.net.send('startRound', {}); this.audio.play('ui'); } });
    p.button('music', `Music ${this.audio.musicOn ? 'on' : 'off'}`, W / 2 + 10, bottom, W / 4 - 25, 70, { small: true, active: this.audio.musicOn, onClick: () => { this.audio.setMusic(!this.audio.musicOn); p.dirty = true; } });
    p.button('fx', `FX ${this.audio.fxOn ? 'on' : 'off'}`, W * 0.75 - 5, bottom, W / 4 - 35, 70, { small: true, active: this.audio.fxOn, onClick: () => { this.audio.setFx(!this.audio.fxOn); p.dirty = true; } });
  }
}

// ─── Wrist HUD (brief §13.3) and the M2 button readout ──────────────────────
export class WristHud {
  readonly panel = new Panel(0.16, 0.09, 1600);
  private last = '';
  buttons = '';

  constructor() {
    this.panel.mesh.position.set(0, 0.035, 0.06);
    this.panel.mesh.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
  }

  update(lines: string[]) {
    const key = lines.join('|') + this.buttons;
    if (key === this.last) return;
    this.last = key;
    this.panel.setRenderer((p) => {
      p.background('rgba(20,16,12,0.9)');
      lines.forEach((l, i) => p.text(l, p.canvas.width / 2, 70 + i * 52, i === 0 ? 48 : 36, i === 0 ? GOLD : CREAM, 'center'));
      // Poke target for the menu fallback (brief §11.1): touch with the right index finger.
      p.g.fillStyle = '#c9a24f'; p.g.beginPath(); p.g.arc(p.canvas.width - 40, 40, 28, 0, Math.PI * 2); p.g.fill();
      p.g.fillStyle = '#1b1610'; for (let k = 0; k < 3; k++) p.g.fillRect(p.canvas.width - 54, 28 + k * 10, 28, 5);
      if (this.buttons) p.text(this.buttons, 14, p.canvas.height - 10, 18, '#7f7', 'left', 'monospace');
    });
    this.panel.update();
  }
}

/** Brief world-anchored announcements in VR; centred text on desktop. */
export class Announcer {
  readonly panel = new Panel(1.6, 0.28, 400);
  private until = 0;
  private dom: HTMLDivElement;

  constructor(private camera: THREE.Camera, private isXR: () => boolean) {
    this.panel.mesh.visible = false;
    this.panel.mesh.renderOrder = 60;
    (this.panel.mesh.material as THREE.MeshBasicMaterial).depthTest = false;
    this.dom = document.createElement('div');
    this.dom.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);font:600 28px Georgia,serif;color:#f3ead9;text-shadow:0 2px 8px #000;pointer-events:none;z-index:15;text-align:center;opacity:0;transition:opacity .3s';
    document.body.appendChild(this.dom);
  }

  show(text: string, tone: 'info' | 'good' | 'bad' | 'alert') {
    const color = tone === 'good' ? '#9fe6b8' : tone === 'bad' ? '#ff9f8a' : tone === 'alert' ? '#ffd166' : '#f3ead9';
    this.until = performance.now() + 2800;
    if (this.isXR()) {
      this.panel.setRenderer((p) => {
        p.background('rgba(15,12,10,0.8)', color);
        p.text(text, p.canvas.width / 2, p.canvas.height / 2 + 16, text.length > 30 ? 42 : 56, color, 'center');
      });
      this.panel.update();
      const head = this.camera.getWorldPosition(new THREE.Vector3());
      const fwd = this.camera.getWorldDirection(new THREE.Vector3());
      this.panel.mesh.position.copy(head).addScaledVector(fwd, 2.2).add(new THREE.Vector3(0, 0.35, 0));
      this.panel.mesh.lookAt(head);
      this.panel.mesh.visible = true;
    } else {
      this.dom.textContent = text;
      this.dom.style.color = color;
      this.dom.style.opacity = '1';
    }
  }

  update() {
    if (performance.now() > this.until) { this.panel.mesh.visible = false; this.dom.style.opacity = '0'; }
  }
}

/**
 * How to play, shown from the countdown into the first seconds of every round
 * (brief §13.4): a title, the goal, and the controls on desktop and in VR.
 */
export const HOW_TO: Partial<Record<ModeId, string[]>> = {
  ctr: [
    'CAPTURE THE RELIC · teams',
    "Smash the other team's glass case (two hard hits), grab their relic and carry it into your own glowing ring.",
    'You can only score while your own relic is home. Shove the carrier to make them drop it; touch your dropped relic to send it home.',
    'Desktop: click punch · E grab · F shove   ·   VR: swing to punch · grip to grab',
  ],
  artifactHunt: [
    'ARTIFACT HUNT',
    '12 artifacts are hidden around the museum: terracotta 1 point, gold 3, violet crown 5.',
    'Your HUD (wrist in VR) says Cold, Warm, Hot or Burning as you get close.',
    'Carry each one into the gold ring at the information desk.   Desktop: E grab   ·   VR: grip',
  ],
  crowdControl: [
    'CROWD CONTROL · co-op security',
    'Tourists should follow the gold floor arrows. Red marker = wrong way · amber = heading into STAFF ONLY · purple = filming.',
    "Touch them to turn them around. Turn a group's flag-holder and the whole group follows.",
    'Brass posts make velvet ropes; signs send strays back.   Desktop: click a tourist · E carry   ·   VR: touch · grip',
  ],
  insuranceFraud: [
    'INSURANCE FRAUD · biggest bill wins',
    'Everything has a price tag. Vases break bare-handed; busts and paintings need a tool; statues need a heavy tool.',
    'Guards patrol with a vision cone on the floor. Two strikes they see or hear nearby and they chase you; get caught and you are locked in the cells downstairs.',
    'Desktop: E grab a tool · click to smash   ·   VR: grip a tool and swing',
  ],
  hideSeek: [
    'HIDE AND SEEK',
    'One seeker counts with eyes closed while everyone else hides anywhere in the museum.',
    'Every 2 minutes each hider calls out "cuck-oo". Seekers: follow the sound. Hiders: move after you call!',
    'Tag a hider to make them a seeker.   Desktop: click them   ·   VR: touch them',
  ],
  fixExhibit: [
    'FIX THE EXHIBIT',
    'Memorise the room: you have 10 seconds (timer in the bottom-right corner). Then your eyes close and everything gets moved.',
    'Put every piece back in 2 minutes. Drop it within a foot of its spot and it clicks into place.',
    'Desktop: E pick up · E put down   ·   VR: grip. Only you can see your pieces.',
  ],
  tour: [
    'FREE ROAM',
    'No timer, no rules: wander every gallery at your own pace. The HUD counts the rooms you have visited.',
    'Map: press M (or the Map button) on desktop, X on the left controller in VR. Press it again to close.',
    'Upstairs: the Grand Staircase, the catwalk stairs, or the elevators (E / the panel). The host ends it from the menu.',
  ],
};
