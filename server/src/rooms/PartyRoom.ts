import { type Client, Room, ServerError } from 'colyseus';
import {
  cloneTunables, groundHeightAt, MODE_CATALOG, museum, roomAt,
  type ClientMessages, type JoinOptions, type ModeId, type ServerEvents, type Spawn, type Team, type Tunables,
} from '@museum/shared';
import { DoorT, PartyState, PlayerT, PoseT } from '../state/schema.js';
import { Systems, feetPos } from '../systems/index.js';
import { MODE_FACTORIES } from '../modes/index.js';
import type { ModeContext, ServerMode } from '../modes/types.js';

type Deferred = ReturnType<Room['allowReconnection']>;

/**
 * One room per party, alive across the lobby and every mode (brief §12).
 * The room is a thin shell: it validates requests and feeds the shared systems
 * and the active mode, which own the rules.
 */
export class PartyRoom extends Room<{ state: PartyState }> {
  maxClients = 8; // the 4-player cap is enforced in onAuth so a full party never spawns a twin room
  autoDispose = false;

  /** MUSEUM_TUNABLES (JSON) overrides defaults, for tests and server-side tuning. Never set by clients. */
  private tunables: Tunables = cloneTunables(process.env.MUSEUM_TUNABLES ? JSON.parse(process.env.MUSEUM_TUNABLES) : undefined);
  private systems!: Systems;
  private ctx!: ModeContext;
  private mode: ServerMode | null = null;
  private clientsByPlayer = new Map<string, Client>();
  private playerBySession = new Map<string, string>();
  private pendingReconnect = new Map<string, Deferred>();
  private teleportGrace = new Map<string, number>();
  private lastPoseAt = new Map<string, number>();
  private disposeTimer: { clear(): void } | null = null;

  onCreate(options: JoinOptions) {
    const state = new PartyState();
    state.slug = String(options.slug ?? '').slice(0, 40);
    this.setState(state);
    this.setMetadata({ slug: state.slug });
    for (const d of museum.doors) {
      const door = new DoorT();
      door.id = d.id; door.open = d.defaultOpen;
      state.doors.set(d.id, door);
    }

    this.ctx = this.makeContext();
    this.systems = new Systems(state, museum, this.tunables, () => this.ctx, () => this.mode);
    this.ctx.systems = this.systems;
    this.spawnLobbyProps();

    this.setSimulationInterval((dt) => this.tick(dt), 1000 / this.tunables.net.serverTickHz);
    this.registerMessages();
  }

  // ─── Join / leave / reconnect ─────────────────────────────────────────────
  onAuth(_client: Client, options: JoinOptions) {
    if (!options?.playerId) throw new ServerError(400, 'missing playerId');
    const existing = this.state.players.get(options.playerId);
    if (existing) return true; // rejoining their own seat
    if (this.state.players.size >= this.tunables.net.maxPlayers) throw new ServerError(409, 'party_full');
    return true;
  }

  onJoin(client: Client, options: JoinOptions) {
    this.disposeTimer?.clear();
    this.disposeTimer = null;
    const id = String(options.playerId).slice(0, 64);
    let p = this.state.players.get(id);

    if (p) {
      // Same browser came back (reload / reopened link) inside the reconnection window.
      const pending = this.pendingReconnect.get(id);
      const oldClient = this.clientsByPlayer.get(id);
      this.bindClient(id, client);
      if (pending) { this.pendingReconnect.delete(id); pending.reject(new Error('rejoined')); }
      else if (oldClient && oldClient !== client) oldClient.leave(4000); // a second tab takes over
      p.status = this.statusForJoin();
      p.name = cleanName(options.name);
      p.isVR = !!options.isVR;
      this.announceAll(`${p.name} is back.`, 'info');
      return;
    }

    p = new PlayerT();
    p.id = id;
    p.name = cleanName(options.name);
    p.joinedAt = Date.now();
    p.isVR = !!options.isVR;
    p.head = new PoseT(); p.left = new PoseT(); p.right = new PoseT();
    const steps = museum.spawns.exterior[this.state.players.size % museum.spawns.exterior.length];
    p.head.px = steps.pos[0]; p.head.py = steps.pos[1] + 1.6; p.head.pz = steps.pos[2];
    p.feetY = steps.pos[1];
    this.state.players.set(id, p);
    this.bindClient(id, client);
    if (!this.state.hostId) this.state.hostId = id;

    const midRound = this.state.phase === 'countdown' || this.state.phase === 'playing';
    if (midRound && this.mode) {
      if (this.mode.joinPolicy === 'spectateUntilNextRound') p.status = 'spectating';
      else this.mode.onPlayerJoin(this.ctx, p, true);
    } else if (this.state.phase === 'roundEnd') {
      this.teleport(p, museum.spawns.lobby[0]);
    } else {
      // Lobby: start on the front steps (brief §12.3).
      this.teleport(p, steps);
    }
    this.announceAll(`${p.name} joined the party.`, 'info');
  }

  onDrop(client: Client) {
    const id = this.playerBySession.get(client.sessionId);
    const p = id ? this.state.players.get(id) : undefined;
    if (!p || !id) return;
    p.status = 'reconnecting';
    // A carrier who drops loses the relic immediately (brief §12.2).
    this.systems.objects.dropAll(p, feetPos(p));
    try {
      this.pendingReconnect.set(id, this.allowReconnection(client, this.tunables.net.reconnectWindowSec));
    } catch {
      // Room is shutting down; nothing to hold the seat for.
    }
  }

  onReconnect(client: Client) {
    const id = this.playerBySession.get(client.sessionId);
    const p = id ? this.state.players.get(id) : undefined;
    if (!p || !id) return;
    this.pendingReconnect.delete(id);
    this.bindClient(id, client);
    p.status = this.statusForJoin();
  }

  onLeave(client: Client) {
    const id = this.playerBySession.get(client.sessionId);
    this.playerBySession.delete(client.sessionId);
    if (!id) return;
    // A newer session already owns this seat (reload / second tab).
    if (this.clientsByPlayer.get(id) !== client) return;
    const p = this.state.players.get(id);
    this.pendingReconnect.delete(id);
    this.clientsByPlayer.delete(id);
    if (!p) return;

    this.systems.objects.dropAll(p, feetPos(p));
    this.mode?.onPlayerLeave(this.ctx, p);
    this.state.players.delete(id);
    this.announceAll(`${p.name} left.`, 'info');

    if (this.state.hostId === id) {
      const next = [...this.state.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      this.state.hostId = next?.id ?? '';
      if (next) this.announceAll(`${next.name} is now the host.`, 'info');
    }
    if (this.state.players.size === 0) {
      this.disposeTimer = this.clock.setTimeout(() => this.disconnect(), this.tunables.net.emptyPartyGraceSec * 1000);
    }
  }

  private bindClient(id: string, client: Client) {
    this.clientsByPlayer.set(id, client);
    this.playerBySession.set(client.sessionId, id);
  }

  private statusForJoin(): PlayerT['status'] {
    const midRound = this.state.phase === 'countdown' || this.state.phase === 'playing';
    return midRound && this.mode?.joinPolicy === 'spectateUntilNextRound' ? 'spectating' : 'active';
  }

  // ─── Messages ─────────────────────────────────────────────────────────────
  private on<K extends keyof ClientMessages>(type: K, fn: (p: PlayerT, msg: ClientMessages[K], client: Client) => void) {
    this.onMessage(type, (client: Client, msg: ClientMessages[K]) => {
      const id = this.playerBySession.get(client.sessionId);
      const p = id ? this.state.players.get(id) : undefined;
      if (!p || msg == null || typeof msg !== 'object') return;
      try { fn(p, msg, client); } catch (e) { console.warn(`[party ${this.state.slug}] bad ${type}:`, e); }
    });
  }

  private registerMessages() {
    this.on('pose', (p, m) => this.acceptPose(p, m));
    this.on('ping', (_p, m, client) => client.send('pong', { t: Number(m.t), server: Date.now() } satisfies ServerEvents['pong']));

    this.on('grab', (p, m) => {
      const hand = m.hand === 'left' ? 'left' : 'right';
      if (!this.systems.objects.grab(p, String(m.objectId), hand)) this.sendTo(p.id, 'grabRejected', { objectId: String(m.objectId), hand });
    });
    this.on('release', (p, m) => {
      const hand = m.hand === 'left' ? 'left' : 'right';
      this.systems.objects.release(p, hand, vec(m.pos), vec(m.vel));
    });
    this.on('hitBreakable', (p, m) => {
      if (this.state.phase !== 'playing') return;
      this.systems.breakables.hit(p, String(m.id), m.hand === 'left' ? 'left' : 'right', num(m.speed));
    });
    this.on('hitPlayer', (p, m) => {
      if (this.state.phase !== 'playing') return;
      const target = this.state.players.get(String(m.targetId));
      if (target) this.systems.combat.hit(p, target, m.kind === 'bonk' ? 'bonk' : 'shove', num(m.speed), vec(m.dir));
    });
    this.on('elevator', (p, m) => {
      const e = museum.elevators.find((x) => x.id === String(m.id));
      const target = e?.stops.find((s) => s.floor === Number(m.floor));
      if (!e || !target || p.status !== 'active') return;
      // Must be standing inside the cab, at one of its stops.
      const inCab = Math.abs(p.head.px - e.x) < 1.6 && Math.abs(p.head.pz - e.z) < 1.6;
      const here = e.stops.find((s) => Math.abs(p.feetY - s.y) < 1.2);
      if (!inCab || !here || here === target) return;
      this.teleportGrace.set(p.id, Date.now() + 1500);
      p.head.py += target.y - here.y;
      p.feetY = target.y;
      this.sendTo(p.id, 'teleport', { pos: [p.head.px, target.y, p.head.pz], yaw: 0, fade: true, keepYaw: true });
    });
    this.on('touchAgent', (p, m) => {
      if (this.state.phase === 'playing') this.mode?.onRequest?.(this.ctx, p, 'touchAgent', { id: String(m.id) });
    });
    this.on('useDoor', (p, m) => {
      const door = this.state.doors.get(String(m.id));
      const def = museum.doors.find((d) => d.id === door?.id);
      const portal = def && museum.portals.find((x) => x.id === def.portal);
      if (!door || !portal) return;
      if (Math.hypot(p.head.px - portal.x, p.head.pz - portal.z) > 3) return;
      door.open = !door.open;
    });

    // Host-only party controls (enforced here, not in the UI).
    this.on('selectMode', (p, m) => {
      if (!this.isHost(p) || this.state.phase !== 'lobby') return;
      // Any mode with a server implementation; the totem only offers the ones marked available.
      const info = MODE_CATALOG.find((x) => x.id === m.mode);
      if (info && MODE_FACTORIES[info.id]) this.state.mode = info.id;
    });
    this.on('setSetting', (p, m) => {
      if (!this.isHost(p) || this.state.phase !== 'lobby') return;
      const v = Math.round(num(m.value));
      if (m.key === 'ctrScoreLimit') this.state.ctrScoreLimit = clamp(v, 1, 10);
      if (m.key === 'ctrTimeMin') this.state.ctrTimeMin = clamp(v, 2, 20);
      if (m.key === 'tourTimeMin') this.state.tourTimeMin = clamp(v, 1, 30);
      if (m.key === 'huntTimeMin') this.state.huntTimeMin = clamp(v, 2, 20);
      if (m.key === 'huntTeams') this.state.huntTeams = !!m.value;
    });
    this.on('startRound', (p) => { if (this.isHost(p) && this.state.phase === 'lobby') this.startCountdown(); });
    this.on('endRound', (p) => {
      if (!this.isHost(p) || (this.state.phase !== 'playing' && this.state.phase !== 'countdown')) return;
      this.finishRound({ summary: 'Round ended by the host.' });
    });
    this.on('leaveParty', (_p, _m, client) => client.leave(4001));
  }

  private isHost(p: PlayerT) { return this.state.hostId === p.id; }

  private acceptPose(p: PlayerT, m: ClientMessages['pose']) {
    const a = m.p;
    if (!Array.isArray(a) || a.length !== 21 || !a.every(Number.isFinite)) return;
    if (p.status === 'reconnecting') return;
    const now = Date.now();
    const graceUntil = this.teleportGrace.get(p.id) ?? 0;
    const last = this.lastPoseAt.get(p.id) ?? 0;
    const dt = Math.max(0.03, (now - last) / 1000);
    const moved = Math.hypot(a[0] - p.head.px, a[2] - p.head.pz);
    // Sanity checks (brief §4): plausible speed, inside the building or on the plaza.
    if (now > graceUntil && last && moved / dt > this.tunables.net.maxPoseSpeed) return;
    if (now > graceUntil && !roomAt(museum, a[0], a[1], a[2])) return;
    this.lastPoseAt.set(p.id, now);
    setPose(p.head, a, 0); setPose(p.left, a, 7); setPose(p.right, a, 14);
    const ground = groundHeightAt(museum, a[0], a[1] - 0.3, a[2]);
    p.feetY = Number.isFinite(m.feetY) && Math.abs(m.feetY - ground) < 1.5 ? m.feetY : ground;
    p.menuOpen = !!m.menuOpen;
  }

  // ─── Round flow: LOBBY → COUNTDOWN → PLAYING → ROUND_END → LOBBY ────────────
  private startCountdown() {
    const factory = MODE_FACTORIES[this.state.mode as ModeId];
    if (!factory) return;
    this.mode = factory();
    this.state.result = '';
    for (const p of this.state.players.values()) if (p.status === 'spectating') p.status = 'active';
    this.mode.onEnter(this.ctx);
    this.state.phase = 'countdown';
    this.state.phaseEndsAt = Date.now() + this.tunables.round.countdownSec * 1000;
  }

  private finishRound(result: { summary: string }) {
    this.state.phase = 'roundEnd';
    this.state.result = result.summary;
    this.state.phaseEndsAt = Date.now() + this.tunables.round.resultsSec * 1000;
    this.announceAll(result.summary, 'good');
  }

  private returnToLobby() {
    this.mode?.onExit(this.ctx);
    this.mode = null;
    this.state.phase = 'lobby';
    this.state.phaseEndsAt = 0;
    this.state.result = '';
    let i = 0;
    for (const p of this.state.players.values()) {
      if (p.status === 'ko' || p.status === 'spectating') { p.status = 'active'; p.daze = 0; }
      this.systems.objects.dropAll(p, feetPos(p));
      this.teleport(p, museum.spawns.lobby[i++ % museum.spawns.lobby.length]);
    }
    this.resetLobbyProps();
  }

  private tick(dtMs: number) {
    const now = Date.now();
    this.state.serverNow = now;
    this.systems.tick(dtMs);
    const phase = this.state.phase;
    if (phase === 'countdown' && now >= this.state.phaseEndsAt) {
      this.state.phase = 'playing';
      const limit = this.mode?.timeLimitSec(this.ctx) ?? 0;
      this.state.phaseEndsAt = limit > 0 ? now + limit * 1000 : 0;
    } else if (phase === 'playing' && this.mode) {
      this.mode.tick(this.ctx, dtMs);
      if (this.state.phaseEndsAt && now >= this.state.phaseEndsAt) {
        this.mode.onTimeUp?.(this.ctx);
        this.state.phaseEndsAt = 0; // sudden death runs untimed
      }
      const over = this.mode.isRoundOver(this.ctx);
      if (over) this.finishRound(over);
    } else if (phase === 'roundEnd' && now >= this.state.phaseEndsAt) {
      this.returnToLobby();
    }
  }

  // ─── Lobby props (M2 grab test objects) ───────────────────────────────────
  private spawnLobbyProps() {
    for (const slot of museum.slots.filter((s) => s.kind === 'prop')) {
      this.systems.objects.spawn(slot.id, 'prop', slot.id.includes('Vase') ? 'vase' : 'bust', slot.pos);
    }
  }

  private resetLobbyProps() {
    for (const slot of museum.slots.filter((s) => s.kind === 'prop')) this.systems.objects.place(slot.id, slot.pos, 'rest');
  }

  // ─── Context and messaging helpers ────────────────────────────────────────
  private makeContext(): ModeContext {
    return {
      state: this.state,
      map: museum,
      tunables: this.tunables,
      systems: null as unknown as Systems, // filled in onCreate
      now: () => Date.now(),
      players: () => [...this.state.players.values()],
      player: (id) => this.state.players.get(id),
      announce: (text, tone = 'info', team) => this.announce(text, tone, team),
      broadcast: (type, payload) => this.broadcast(type, payload),
      sendTo: (id, type, payload) => this.sendTo(id, type, payload),
      teleport: (p, spawn) => this.teleport(p, spawn),
    };
  }

  private sendTo<K extends keyof ServerEvents>(playerId: string, type: K, payload: ServerEvents[K]) {
    this.clientsByPlayer.get(playerId)?.send(type, payload);
  }

  private announce(text: string, tone: ServerEvents['announcement']['tone'], team?: Team) {
    for (const p of this.state.players.values()) {
      if (team && p.team !== team) continue;
      this.sendTo(p.id, 'announcement', { text, tone, team });
    }
  }

  private announceAll(text: string, tone: ServerEvents['announcement']['tone']) { this.announce(text, tone); }

  /** Move a player: the client owns its pose, so the server tells it where to go. */
  private teleport(p: PlayerT, spawn: Spawn) {
    this.teleportGrace.set(p.id, Date.now() + 1500);
    p.head.px = spawn.pos[0]; p.head.py = spawn.pos[1] + 1.6; p.head.pz = spawn.pos[2];
    p.feetY = spawn.pos[1];
    this.sendTo(p.id, 'teleport', { pos: [...spawn.pos], yaw: spawn.yaw });
  }
}

function setPose(q: PoseT, a: number[], o: number) {
  q.px = a[o]; q.py = a[o + 1]; q.pz = a[o + 2];
  q.qx = a[o + 3]; q.qy = a[o + 4]; q.qz = a[o + 5]; q.qw = a[o + 6];
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const vec = (v: unknown): [number, number, number] => (Array.isArray(v) ? [num(v[0]), num(v[1]), num(v[2])] : [0, 0, 0]);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const cleanName = (n: unknown) => String(n ?? 'Visitor').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 18) || 'Visitor';
