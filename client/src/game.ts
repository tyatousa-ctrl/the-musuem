import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { museum, roomAt, tunables, type Hand, type ModeId, type PoseArray } from '@museum/shared';
import { detectTier, flags } from './core/config';
import { createRenderer } from './core/renderer';
import { getIdentity } from './core/identity';
import { buildWorld, type World } from './world/world';
import { radialTexture } from './world/textures';
import { BOOKMARKS } from './debug/bookmarks';
import { PerfHud } from './debug/perf';
import { DesktopInput, XRInput, emptyActions, type Actions } from './player/input';
import { Player } from './player/player';
import { Net, type NetState } from './multiplayer/net';
import { Avatars } from './multiplayer/avatars';
import { Breakables, WorldObjects } from './interaction/objects';
import { Doors } from './interaction/doors';
import { AudioEngine, type Sfx } from './audio/audio';
import { PanelInput } from './ui/panel';
import { Announcer, HOW_TO, LobbyTotem, PersonalMenu, WristHud, fmtTime } from './ui/menus';
import { DesktopOverlay } from './ui/overlay';
import { ElevatorPanels } from './ui/elevators';
import { CLIENT_MODES, lobbyHud, type ClientMode, type ClientModeCtx } from './modes';

declare global { interface Window { __museum?: { ready: boolean; game: Game } } }

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const HANDS: Hand[] = ['left', 'right'];

/**
 * The client. One instance per page; owns the world, the local player and every
 * system. Works offline (?offline) for art review, otherwise joins /party/<slug>.
 */
export class Game {
  readonly tier = detectTier();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1500);
  world!: World;
  player!: Player;
  net: Net | null = null;
  readonly audio = new AudioEngine();
  readonly perf = new PerfHud(flags.perf);
  readonly avatars = new Avatars(radialTexture('rgba(0,0,0,1)', 'rgba(0,0,0,0)'));
  readonly objects = new WorldObjects();
  readonly breakables = new Breakables();
  doors!: Doors;
  elevators!: ElevatorPanels;
  private desktop: DesktopInput;
  private xrInput = new XRInput();
  private actions: Actions = emptyActions();
  private panels = new PanelInput();
  menu!: PersonalMenu;
  totem: LobbyTotem | null = null;
  private wrist = new WristHud();
  private announcer: Announcer;
  private overlay: DesktopOverlay;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private mode: ClientMode | null = null;
  private modeCtx!: ClientModeCtx;
  private lastPhase = '';
  private prevGrip: Record<Hand, boolean> = { left: false, right: false };
  private hitCooldown: Record<Hand, number> = { left: 0, right: 0 };
  private punchAnim = 0;
  private stepAcc = 0;
  private remoteSteps = new Map<string, { x: number; z: number; acc: number }>();
  private controllers: THREE.Group[] = [];
  private playing = false;
  private spectate = flags.spectate;
  private mouseNdc = new THREE.Vector2();
  private countdownShown = false;
  private wristPokeCooldown = 0;

  constructor(readonly slug: string | null) {
    this.renderer = createRenderer(this.tier, document.getElementById('app')!);
    this.camera.rotation.order = 'YXZ';
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
    // Dynamic objects are lit; the static world is baked and unlit.
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5f50, 2.2));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    this.scene.add(this.avatars.group, this.objects.group, this.breakables.group);
    this.desktop = new DesktopInput(this.renderer.domElement);
    this.announcer = new Announcer(this.camera, () => this.renderer.xr.isPresenting);
    this.overlay = new DesktopOverlay(() => this.enterDesktop(), flags.clean || !!flags.cam);
    addEventListener('mousemove', (e) => this.mouseNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
    window.__museum = { ready: false, game: this };
  }

  async start() {
    this.overlay.status('Building the museum…');
    this.world = await buildWorld(museum, (s) => this.overlay.status(s));
    this.scene.add(this.world.scene);
    this.doors = new Doors(museum);
    this.scene.add(this.doors.group);

    this.player = new Player(this.camera, this.renderer, this.world.collider);
    this.player.dynamicBoxes = this.doors.boxes;
    this.scene.add(this.player.rig);
    this.setupHands();
    this.menu = new PersonalMenu(this.audio, this.player, () => void this.leaveParty(), () => this.onMenuClosed());
    this.scene.add(this.menu.panel.mesh, this.announcer.panel.mesh);
    this.panels.panels.add(this.menu.panel);
    this.player.camera.add(this.perf.panel);
    this.elevators = new ElevatorPanels(museum, (e, floor) => this.rideElevator(e.id, floor));
    this.scene.add(this.elevators.group);
    for (const p of this.elevators.panels) this.panels.panels.add(p);
    this.perf.panel.position.set(-0.18, -0.12, -0.5);

    const steps = museum.spawns.exterior[0];
    this.player.teleport([...steps.pos], steps.yaw);
    if (flags.room) this.spawnInRoom(flags.room);
    if (flags.cam) this.applyBookmark(flags.cam);

    if (this.slug && !flags.offline) await this.connect();
    if (flags.mode && this.net?.isHost()) this.net.send('selectMode', { mode: flags.mode as ModeId });
    else this.overlay.status('');
    this.modeCtx = { net: this.net!, audio: this.audio, objects: this.objects, scene: this.scene, playerPos: () => this.player.feet };

    // VR entry button; audio starts on the same gesture (brief §10).
    if (!flags.clean && !flags.cam) {
      const btn = VRButton.createButton(this.renderer, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      this.overlay.attachVR(btn);
    }
    this.renderer.xr.addEventListener('sessionstart', () => { this.audio.start(); this.playing = true; this.overlay.hide(); });
    this.renderer.xr.addEventListener('sessionend', () => { this.playing = false; this.overlay.show(); });
    let wasLocked = false;
    document.addEventListener('pointerlockchange', () => {
      // Esc releases pointer lock without a key event: treat that as opening the menu.
      if (wasLocked && !this.desktop.locked && this.playing && !this.renderer.xr.isPresenting && !this.menu.open) this.menu.show();
      wasLocked = this.desktop.locked;
    });

    this.renderer.setAnimationLoop(() => this.frame());
    let n = 0;
    const tick = () => { if (++n > 5) window.__museum!.ready = true; else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // ─── Setup ─────────────────────────────────────────────────────────────────
  private async connect() {
    const id = getIdentity();
    this.net = new Net({ slug: this.slug!, playerId: id.playerId, name: id.name, isVR: navigator.xr ? true : false });
    this.net.onStatus = (s, detail) => this.overlay.status(s === 'connected' ? '' : detail ?? s, s === 'full' || s === 'offline');
    await this.net.connect();
    const net = this.net;
    net.on('teleport', (m) => {
      if (m.fade) { this.player.flash(); this.audio.play('ding', undefined, { gain: 0.7 }); }
      this.player.teleport(m.pos, m.keepYaw ? this.player.yaw : m.yaw);
    });
    net.on('knockback', (m) => { this.player.knockback(m.vel); this.haptic('left', 0.6, 120); this.haptic('right', 0.6, 120); });
    net.on('announcement', (m) => { this.announcer.show(m.text, m.tone); if (m.tone === 'good') this.audio.play('score', undefined, { gain: 0.6 }); if (m.tone === 'bad') this.audio.play('bad'); });
    net.on('glassCracked', (m) => { this.audio.play('crack', m.pos, { gain: 1.2 }); this.hapticNear(m.pos, 0.8); });
    net.on('glassShattered', (m) => { this.audio.play('shatter', m.pos, { gain: 1.4, refDistance: 4 }); this.hapticNear(m.pos, 1); });
    net.on('alarm', (m) => this.audio.alarm(m.pos));
    net.on('ko', (m) => { this.audio.play('ko', m.pos); if (m.playerId === net.playerId) this.announcer.show('Seeing stars…', 'bad'); });
    net.on('hit', (m) => this.audio.play(m.kind === 'bonk' ? 'thud' : 'whoosh', m.pos));
    net.on('scored', () => this.audio.play('score'));
    net.on('grabRejected', (m) => { this.objects.rejectGrab(m.objectId); this.hands()[m.hand].heldId = ''; });
    // Lobby totem near the information desk, facing the arrivals.
    const block = museum.blocks.find((b) => b.id === 'lobbyPanel')!;
    this.totem = new LobbyTotem(net, this.audio, new THREE.Vector3((block.x0 + block.x1) / 2, 0, (block.z0 + block.z1) / 2), Math.PI / 2);
    this.scene.add(this.totem.group);
    this.panels.panels.add(this.totem.panel);
  }

  private setupHands() {
    const { left, right } = this.player.hands;
    // Desktop: simulated hands mounted on the camera.
    left.anchor.position.set(-0.24, -0.3, -0.42);
    right.anchor.position.set(0.24, -0.3, -0.42);
    this.camera.add(left.anchor, right.anchor);
    // VR: controller grip spaces, assigned by handedness when they connect.
    for (let i = 0; i < 2; i++) {
      const grip = this.renderer.xr.getControllerGrip(i);
      const ray = this.renderer.xr.getController(i);
      this.player.rig.add(grip, ray);
      this.controllers.push(ray);
      grip.addEventListener('connected', (e: { data?: XRInputSource }) => {
        const handed = e.data?.handedness;
        if (handed !== 'left' && handed !== 'right') return;
        const h = this.player.hands[handed];
        h.anchor.position.set(0, 0, 0);
        grip.add(h.anchor);
        ray.userData.hand = handed;
        ray.add(this.panels.rays[handed === 'left' ? 0 : 1]);
        if (handed === 'left') h.anchor.add(this.wrist.panel.mesh);
      });
    }
    this.renderer.xr.addEventListener('sessionend', () => {
      left.anchor.position.set(-0.24, -0.3, -0.42); right.anchor.position.set(0.24, -0.3, -0.42);
      this.camera.add(left.anchor, right.anchor);
    });
  }

  private hands() { return this.player.hands; }

  private enterDesktop() {
    this.audio.start();
    this.playing = true;
    this.desktop.lock();
    this.overlay.hide();
  }

  private onMenuClosed() { if (!this.renderer.xr.isPresenting && this.playing) this.desktop.lock(); }

  private async leaveParty() {
    await this.net?.leave();
    location.assign('/');
  }

  /** ?room=<id>: start just inside one of the room's doorways (debug). */
  private spawnInRoom(id: string) {
    const r = museum.rooms.find((x) => x.id === id);
    const p = museum.portals.find((x) => (x.a === id || x.b === id) && x.kind !== 'opening' && x.y === r?.floorY);
    if (!r || !p) { console.warn(`?room=${id}: unknown room`); return; }
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const k = 1.6 / Math.max(1e-3, Math.hypot(cx - p.x, cz - p.z));
    this.player.teleport([p.x + (cx - p.x) * k, r.floorY, p.z + (cz - p.z) * k], Math.atan2(-(cx - p.x), -(cz - p.z)));
  }

  applyBookmark(id: string) {
    const b = BOOKMARKS.find((x) => x.id === id);
    if (!b) { console.warn(`unknown bookmark ${id}`); return; }
    this.spectate = true;
    this.player.rig.position.set(b.pos[0], b.pos[1] - tunables.player.eyeHeight, b.pos[2]);
    this.player.yaw = THREE.MathUtils.degToRad(b.yaw);
    this.player.pitch = THREE.MathUtils.degToRad(b.pitch);
    this.player.rig.rotation.y = this.player.yaw;
    this.camera.rotation.set(this.player.pitch, 0, 0);
  }

  // ─── Frame ─────────────────────────────────────────────────────────────────
  private frame() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, rawDt);
    this.elapsed += dt;
    const xr = this.renderer.xr.isPresenting;
    const a = this.actions;

    if (xr) this.xrInput.read(this.renderer.xr.getSession(), dt, a);
    else this.desktop.read(a);
    if (!this.playing && !xr) { a.move.set(0, 0); a.lookDelta.set(0, 0); }
    if (a.perfToggle) this.perf.toggle();
    // Wrist button: poke the left-wrist panel with the right hand to toggle the menu.
    if (xr) {
      this.wristPokeCooldown = Math.max(0, this.wristPokeCooldown - dt);
      const tip = this.player.hands.right.pos;
      if (this.wristPokeCooldown === 0 && this.wrist.panel.mesh.getWorldPosition(tmpB).distanceTo(tip) < 0.07) {
        a.menuToggle = true;
        this.wristPokeCooldown = 0.8;
        this.haptic('right', 0.4, 40);
      }
    }
    if (a.menuToggle && (this.playing || xr)) {
      this.menu.toggle();
      if (this.menu.open && !xr) this.desktop.unlock();
    }

    const me = this.net?.me();
    const ko = me?.status === 'ko';
    this.player.setFade(ko ? 0.85 : 0);
    this.player.frozen = ko ? 0.1 : this.player.frozen;
    this.player.speedMul = this.carrying() ? tunables.ctr.carrierSpeedMul : 1;

    if (this.spectate && !xr) this.flyCamera(dt, a);
    else this.player.update(dt, a, this.menu.open);

    this.updateHands(dt, a, xr);
    if (this.playing || xr) this.interact(a, xr);
    this.sendPose(rawDt);

    const state = this.net?.state;
    this.avatars.update(state, this.net?.playerId ?? '', dt);
    this.objects.update(state, this.net?.playerId ?? '', this.player.hands, this.avatars, dt);
    this.breakables.update(state, dt);
    this.doors.update(state, dt);
    this.updatePhase(dt);

    const head = this.player.headPosition(tmpA);
    this.perf.rooms = this.world.cull(head);
    this.world.update(dt, this.elapsed, this.camera);
    this.updateAudio(dt, head);

    // UI.
    this.menu.update();
    this.elevators.update();
    this.totem?.update();
    this.announcer.update();
    this.updateHud(xr);
    this.panels.update(xr
      ? this.controllers.map((c) => ({ origin: c.userData.hand ? c : null, select: a.uiSelect && (c.userData.hand === 'right' ? this.xrInput.raw.right.buttons[0] > 0.5 : this.xrInput.raw.left.buttons[0] > 0.5) }))
      : [this.desktop.locked ? { origin: null, select: a.uiSelect, camera: this.camera, ndc: new THREE.Vector2(0, 0) } : { origin: null, select: a.uiSelect && this.menu.open, camera: this.camera, ndc: this.mouseNdc }]);

    this.renderer.render(this.scene, this.camera);
    this.perf.npcs = 0;
    this.perf.rtt = this.net?.rtt ?? 0;
    this.perf.frame(rawDt, this.renderer, xr);
  }

  private flyCamera(dt: number, a: Actions) {
    this.player.yaw += a.lookDelta.x;
    this.player.pitch = THREE.MathUtils.clamp(this.player.pitch + a.lookDelta.y, -1.5, 1.5);
    this.player.rig.rotation.y = this.player.yaw;
    this.camera.rotation.set(this.player.pitch, 0, 0);
    this.camera.getWorldDirection(tmpDir);
    const speed = a.sprint ? 14 : 5;
    this.player.rig.position.addScaledVector(tmpDir, a.move.y * speed * dt);
    tmpB.crossVectors(tmpDir, new THREE.Vector3(0, 1, 0)).normalize();
    this.player.rig.position.addScaledVector(tmpB, a.move.x * speed * dt);
  }

  // ─── Hands, grabbing, hitting ──────────────────────────────────────────────
  private updateHands(dt: number, a: Actions, xr: boolean) {
    const { left, right } = this.player.hands;
    if (!xr) {
      // Desktop punch: a quick jab of the right hand.
      this.punchAnim = Math.max(0, this.punchAnim - dt * 5);
      const jab = Math.sin(this.punchAnim * Math.PI);
      right.anchor.position.set(0.24 - jab * 0.12, -0.3 + jab * 0.12, -0.42 - jab * 0.35);
      left.anchor.visible = right.anchor.visible = !this.spectate;
    }
    left.glove.setPose(xr ? (a.grabLeft ? 1 : a.useLeft ? 0.6 : 0.15) : left.heldId ? 1 : 0.3, false);
    right.glove.setPose(xr ? (a.grabRight ? 1 : a.useRight ? 0.6 : 0.15) : right.heldId ? 1 : this.punchAnim > 0 ? 1 : 0.3, false);
    for (const h of HANDS) { this.player.hands[h].glove.update(dt); this.player.hands[h].sample(this.elapsed); }
    this.hitCooldown.left = Math.max(0, this.hitCooldown.left - dt);
    this.hitCooldown.right = Math.max(0, this.hitCooldown.right - dt);
    const me = this.net?.me();
    // Keep local held ids in sync with the server.
    if (me) for (const h of HANDS) {
      const server = h === 'left' ? me.heldLeft : me.heldRight;
      const hand = this.player.hands[h];
      if (server) hand.heldId = server;
      else if (hand.heldId && performance.now() - hand.heldPredictedAt > 1500) hand.heldId = '';
    }
  }

  private carrying() {
    const me = this.net?.me();
    return !!me && [me.heldLeft, me.heldRight].some((id: string) => id && this.net!.state.objects.get(id)?.kind === 'relic');
  }

  private interact(a: Actions, xr: boolean) {
    const net = this.net;
    if (!net || this.menu.open) return;
    const state = net.state;
    const me = net.me();
    if (!me || me.status !== 'active') return;

    if (xr) {
      for (const h of HANDS) {
        const hand = this.player.hands[h];
        const grip = h === 'left' ? a.grabLeft : a.grabRight;
        if (grip && !this.prevGrip[h] && !hand.heldId) {
          const id = this.objects.nearest(state, hand.pos, tunables.player.grabRadius + 0.12, net.playerId);
          if (id) this.grab(h, id);
          else {
            const door = this.doors.near(hand.pos, 1.0);
            if (door) { net.send('useDoor', { id: door }); this.audio.play('door', this.doors.position(door)); }
          }
        }
        if (!grip && this.prevGrip[h] && hand.heldId) this.release(h, hand.velocity);
        this.prevGrip[h] = grip;
        // Physical hits: fast hand into glass or into another player.
        if (hand.speed() > tunables.combat.shoveSpeed && this.hitCooldown[h] === 0) this.physicalHit(h, hand.speed());
      }
      return;
    }

    // Desktop.
    const head = this.player.headPosition(tmpA);
    this.camera.getWorldDirection(tmpDir);
    if (a.grabRightPressed || a.grabLeftPressed) {
      const h: Hand = a.grabLeftPressed ? 'left' : 'right';
      const hand = this.player.hands[h];
      if (hand.heldId) this.release(h, tmpB.copy(this.player.velocity).setY(0));
      else {
        const id = this.objectInFront(head, tmpDir, 2.2);
        if (id) this.grab(h, id, true);
        else {
          const door = this.doors.near(head, 2.2);
          const cab = ElevatorPanels.cabAt(museum, this.player.feet);
          if (door) { net.send('useDoor', { id: door }); this.audio.play('door', this.doors.position(door)); }
          else if (cab) this.rideElevator(cab.e.id, cab.e.stops.find((s) => s.floor !== cab.floor)!.floor);
        }
      }
    }
    if (a.useRightPressed) {
      const right = this.player.hands.right;
      this.punchAnim = 1;
      const caseId = this.breakables.inFront(head, tmpDir, 2.0);
      const target = this.playerInFront(head, tmpDir, 1.5);
      const agent = !caseId && !target ? this.agentInFront(head, tmpDir, 1.8) : null;
      if (agent) {
        // A tap on the shoulder (Crowd Control).
        this.reachTo('right', agent.pos);
        net.send('touchAgent', { id: agent.id });
      } else if (caseId) {
        this.reachTo('right', this.breakables.position(caseId)!);
        net.send('hitBreakable', { id: caseId, hand: 'right', speed: 4 });
        this.audio.play('thud', this.breakables.position(caseId)!);
      } else if (target) {
        net.send('hitPlayer', { targetId: target, hand: 'right', speed: 3.5, dir: [tmpDir.x, 0, tmpDir.z], kind: right.heldId ? 'bonk' : 'shove' });
      } else if (right.heldId) {
        this.release('right', tmpB.copy(tmpDir).multiplyScalar(9).add(new THREE.Vector3(0, 2, 0)));
      }
    }
    if (a.shovePressed) {
      const target = this.playerInFront(head, tmpDir, 1.5);
      this.punchAnim = 1;
      this.audio.play('whoosh');
      if (target) net.send('hitPlayer', { targetId: target, hand: 'right', speed: 3, dir: [tmpDir.x, 0, tmpDir.z], kind: 'shove' });
    }
  }

  private grab(h: Hand, id: string, desktopReach = false) {
    const hand = this.player.hands[h];
    if (desktopReach) { const p = this.objects.position(id, tmpB); if (p) this.reachTo(h, p); }
    hand.heldId = id;
    hand.heldPredictedAt = performance.now();
    this.objects.predictGrab(id, h);
    this.net!.send('grab', { objectId: id, hand: h });
    this.audio.play('pickup');
    this.haptic(h, 0.5, 60);
  }

  private release(h: Hand, vel: THREE.Vector3) {
    const hand = this.player.hands[h];
    this.objects.clearPrediction(hand.heldId);
    hand.heldId = '';
    this.net!.send('release', { hand: h, pos: [hand.pos.x, hand.pos.y, hand.pos.z], vel: [vel.x, vel.y, vel.z] });
  }

  /** Ride an elevator: the server moves us (it checks we are in the cab). Offline, move locally. */
  rideElevator(id: string, floor: number) {
    this.audio.play('ui');
    if (this.net) { this.net.send('elevator', { id, floor }); return; }
    const e = museum.elevators.find((x) => x.id === id);
    const to = e?.stops.find((s) => s.floor === floor);
    const from = e && ElevatorPanels.cabAt(museum, this.player.feet);
    if (!e || !to || !from || from.floor === floor) return;
    this.player.flash();
    this.audio.play('ding', undefined, { gain: 0.7 });
    const f = this.player.feet;
    this.player.teleport([f.x, to.y, f.z], this.player.yaw);
  }

  /** Desktop reach: briefly put the simulated hand at a target and send the pose now. */
  private reachTarget = new THREE.Vector3();
  private reachTo(h: Hand, p: THREE.Vector3) {
    const target = this.reachTarget.copy(p); // own vector: sendPose reuses the scratch ones
    this.player.hands[h].pos.copy(target);
    this.sendPose(1, h, target);
  }

  private physicalHit(h: Hand, speed: number) {
    const net = this.net!;
    const hand = this.player.hands[h];
    const caseId = this.breakables.hitTest(hand.pos);
    if (caseId && speed >= tunables.combat.punchGlassSpeed * (hand.heldId ? 0.7 : 1)) {
      net.send('hitBreakable', { id: caseId, hand: h, speed });
      this.audio.play('thud', hand.pos);
      this.haptic(h, 1, 80);
      this.hitCooldown[h] = 0.35;
      return;
    }
    for (const [id, av] of this.avatars.entries()) {
      av.head.getWorldPosition(tmpB);
      const torso = av.torso.position;
      if (hand.pos.distanceTo(tmpB) < 0.3 || (Math.hypot(hand.pos.x - torso.x, hand.pos.z - torso.z) < 0.32 && Math.abs(hand.pos.y - torso.y) < 0.45)) {
        const dir = hand.velocity.clone().normalize();
        net.send('hitPlayer', { targetId: id, hand: h, speed, dir: [dir.x, dir.y, dir.z], kind: hand.heldId ? 'bonk' : 'shove' });
        this.haptic(h, 0.8, 60);
        this.hitCooldown[h] = 0.45;
        return;
      }
    }
  }

  private objectInFront(origin: THREE.Vector3, dir: THREE.Vector3, range: number): string | null {
    const state = this.net?.state;
    let best: string | null = null, bestScore = Infinity;
    state?.objects?.forEach((o: { holder: string }, id: string) => {
      if (o.holder && o.holder !== this.net!.playerId) return;
      const p = this.objects.position(id, tmpB);
      if (!p) return;
      p.sub(origin);
      const along = p.dot(dir);
      if (along < 0 || along > range) return;
      const off = p.addScaledVector(dir, -along).length();
      if (off < 0.45 && along + off * 3 < bestScore) { bestScore = along + off * 3; best = id; }
    });
    return best;
  }

  /** Nearest synced NPC whose body is in front of the camera within `range`. */
  private agentInFront(origin: THREE.Vector3, dir: THREE.Vector3, range: number): { id: string; pos: THREE.Vector3 } | null {
    let best: { id: string; pos: THREE.Vector3 } | null = null, bestD = range;
    this.net?.state?.agents?.forEach((a: NetState, id: string) => {
      tmpB.set(a.x, a.y + 1.2, a.z).sub(origin);
      tmpB.y *= 0.3;
      const along = tmpB.dot(dir);
      if (along < 0 || along > bestD) return;
      if (tmpB.addScaledVector(dir, -along).length() < 0.6) { bestD = along; best = { id, pos: new THREE.Vector3(a.x, a.y + 1.2, a.z) }; }
    });
    return best;
  }

  private playerInFront(origin: THREE.Vector3, dir: THREE.Vector3, range: number): string | null {
    let best: string | null = null, bestD = range;
    for (const [id, av] of this.avatars.entries()) {
      av.head.getWorldPosition(tmpB).sub(origin);
      tmpB.y *= 0.4; // be generous vertically
      const along = tmpB.dot(dir);
      if (along < 0 || along > range) continue;
      if (tmpB.addScaledVector(dir, -along).length() < 0.6 && along < bestD) { bestD = along; best = id; }
    }
    return best;
  }

  private haptic(h: Hand, intensity: number, ms: number) {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      if (src.handedness !== h) continue;
      const act = (src.gamepad as (Gamepad & { hapticActuators?: { pulse(i: number, d: number): void }[] }) | undefined)?.hapticActuators?.[0];
      act?.pulse(intensity, ms);
    }
  }

  private hapticNear(pos: [number, number, number], intensity: number) {
    for (const h of HANDS) if (this.player.hands[h].pos.distanceTo(tmpB.set(...pos)) < 1.2) this.haptic(h, intensity, 100);
  }

  private pose: PoseArray = new Array(21).fill(0) as PoseArray;
  private sendPose(dt: number, overrideHand?: Hand, overridePos?: THREE.Vector3) {
    if (!this.net) return;
    const p = this.pose;
    this.camera.getWorldPosition(tmpB);
    const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
    p[0] = tmpB.x; p[1] = tmpB.y; p[2] = tmpB.z; p[3] = q.x; p[4] = q.y; p[5] = q.z; p[6] = q.w;
    HANDS.forEach((h, i) => {
      const hand = this.player.hands[h];
      const pos = overrideHand === h && overridePos ? overridePos : hand.pos;
      const o = 7 + i * 7;
      p[o] = pos.x; p[o + 1] = pos.y; p[o + 2] = pos.z;
      p[o + 3] = hand.quat.x; p[o + 4] = hand.quat.y; p[o + 5] = hand.quat.z; p[o + 6] = hand.quat.w;
    });
    this.net.updatePose(dt, p, this.player.feet.y, this.menu.open);
  }

  // ─── Round flow, HUD, audio ────────────────────────────────────────────────
  private updatePhase(dt: number) {
    const s = this.net?.state;
    if (!s) return;
    const key = `${s.phase}:${s.mode}`;
    if (key !== this.lastPhase) {
      const [phase] = key.split(':');
      if (phase === 'countdown' || phase === 'playing') {
        if (!this.mode || this.mode.id !== s.mode) {
          this.mode?.exit(this.modeCtx);
          this.mode = CLIENT_MODES[s.mode as ModeId] ?? null;
          this.mode?.enter(this.modeCtx);
        }
      } else if (this.mode && phase === 'lobby') {
        this.mode.exit(this.modeCtx);
        this.mode = null;
        this.audio.stopAlarms();
      }
      if (phase === 'countdown' && !this.countdownShown) {
        this.countdownShown = true;
        const lines = HOW_TO[s.mode as ModeId] ?? [];
        this.overlay.card(lines, 5000);
        // In VR the card's lines arrive as world-space announcements; desktop has the DOM card.
        if (this.renderer.xr.isPresenting) lines.forEach((l, i) => setTimeout(() => this.announcer.show(l, 'info'), i * 1700));
      }
      if (phase !== 'countdown') this.countdownShown = false;
      this.audio.intensity = phase === 'playing' ? 1 : 0;
      this.lastPhase = key;
    }
    if (this.mode) this.mode.update(this.modeCtx, dt);
  }

  private updateHud(xr: boolean) {
    const s = this.net?.state;
    const lines = !s ? ['Offline preview', '', ''] : this.mode && (s.phase === 'countdown' || s.phase === 'playing') ? this.mode.hud(this.modeCtx) : lobbyHud(this.modeCtx);
    if (flags.buttons || this.perf.visible) {
      const r = this.xrInput.raw;
      this.wrist.buttons = `L ${r.left.buttons.map((v, i) => (v > 0.5 ? i : '·')).join('')} R ${r.right.buttons.map((v, i) => (v > 0.5 ? i : '·')).join('')}${this.xrInput.menuButtonIndex !== null ? ` menu=${this.xrInput.menuButtonIndex}` : ''}`;
    }
    if (xr) this.wrist.update(lines);
    else this.overlay.hud(lines, this.desktop.locked && !this.spectate, s?.phase === 'roundEnd' ? s.result : '');
  }

  private updateAudio(dt: number, head: THREE.Vector3) {
    this.audio.updateListener(this.camera);
    const room = roomAt(museum, head.x, head.y - 1.2, head.z);
    if (room) this.audio.setRoom(room.acoustic);
    // Local footsteps by surface.
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    if (this.player.grounded && speed > 0.5 && !this.spectate) {
      this.stepAcc += speed * dt;
      if (this.stepAcc > 0.78) { this.stepAcc = 0; this.audio.play(this.surface(room?.style, head.y - 1.6), undefined, { gain: 0.35 }); }
    }
    // Remote footsteps, positional: hearing someone on the catwalk is gameplay.
    for (const [id, av] of this.avatars.entries()) {
      const s = this.remoteSteps.get(id) ?? { x: av.head.position.x, z: av.head.position.z, acc: 0 };
      const d = Math.hypot(av.head.position.x - s.x, av.head.position.z - s.z);
      s.x = av.head.position.x; s.z = av.head.position.z;
      s.acc += d < 2 ? d : 0;
      if (s.acc > 0.8) {
        s.acc = 0;
        const r = roomAt(museum, s.x, av.feetY + 0.4, s.z);
        this.audio.play(this.surface(r?.style, av.feetY), [s.x, av.feetY, s.z], { gain: 0.6 });
      }
      this.remoteSteps.set(id, s);
    }
  }

  private surface(style: string | undefined, feetY: number): Sfx {
    if (style === 'dino' && feetY > 6) return 'stepMetal';
    if (style === 'gallery' || style === 'cultures') return 'stepWood';
    if (style === 'service' || style === 'office' || style === 'stairwell') return 'stepConcrete';
    return 'stepStone';
  }

  /** Automation: one desktop left-click (punch / throw) as if pointer-locked. */
  debugClick() { this.desktop.synthClick(); }

  /** For tests and debugging. */
  debugInfo() {
    return {
      pos: this.player.feet.toArray(),
      room: roomAt(museum, this.player.feet.x, this.player.feet.y + 0.5, this.player.feet.z)?.id,
      players: this.net?.state?.players?.size ?? 0,
      avatars: this.avatars.count,
      phase: this.net?.state?.phase,
      timer: this.net?.state ? fmtTime(this.net.state.phaseEndsAt - this.net.serverNow()) : '',
    };
  }
}
