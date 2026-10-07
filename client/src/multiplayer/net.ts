import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, tunables, type ClientMessages, type JoinOptions, type PoseArray, type ServerEvents } from '@museum/shared';
import { SERVER_URL } from '../core/config';

type Listener<K extends keyof ServerEvents> = (payload: ServerEvents[K]) => void;

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Decoded party state as the SDK exposes it (schema instances; read-only on the client). */
export type NetState = any;

/**
 * Colyseus client wrapper (brief §12). Joins the party for a slug (recreating
 * it if the server restarted), streams poses at 20 Hz, measures RTT and the
 * server clock offset, and fans out one-shot events.
 */
/** Every server event the client relays to listeners (a missing key is a type error). */
const RELAYED: Record<Exclude<keyof ServerEvents, 'pong'>, true> = {
  glassCracked: true, glassShattered: true, alarm: true, ko: true, hit: true, knockback: true,
  teleport: true, scored: true, announcement: true, grabRejected: true, crowd: true, smash: true, payout: true,
};

export class Net {
  room: Room | null = null;
  readonly client = new Client(SERVER_URL);
  rtt = 0;
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset = 0;
  status: 'connecting' | 'connected' | 'reconnecting' | 'full' | 'offline' = 'connecting';
  private listeners = new Map<string, Set<(p: unknown) => void>>();
  private poseAcc = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  onStatus: (s: Net['status'], detail?: string) => void = () => {};

  constructor(readonly opts: JoinOptions) {}

  get state(): NetState { return this.room?.state; }
  get playerId() { return this.opts.playerId; }
  serverNow() { return Date.now() + this.clockOffset; }

  async connect(): Promise<void> {
    // Render free instances sleep; keep trying with a friendly status (brief §21).
    for (let attempt = 0; ; attempt++) {
      try {
        this.setStatus('connecting', attempt ? 'Waking the museum…' : 'Opening the doors…');
        this.room = await this.client.joinOrCreate(ROOM_NAME, this.opts);
        break;
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (/party_full/.test(msg)) { this.setStatus('full', 'This party is full (4 players).'); throw e; }
        if (attempt >= 20) { this.setStatus('offline', 'Could not reach the museum server.'); throw e; }
        await new Promise((r) => setTimeout(r, Math.min(6000, 1000 + attempt * 800)));
      }
    }
    const room = this.room!;
    for (const type of Object.keys(RELAYED) as (keyof ServerEvents)[]) {
      room.onMessage(type, (p: unknown) => this.emit(type, p));
    }
    room.onMessage('pong', (p: ServerEvents['pong']) => {
      const now = Date.now();
      this.rtt = this.rtt ? this.rtt * 0.7 + (now - p.t) * 0.3 : now - p.t;
      this.clockOffset = p.server + this.rtt / 2 - now;
    });
    room.onDrop?.(() => this.setStatus('reconnecting', 'Connection lost — reconnecting…'));
    room.onReconnect?.(() => this.setStatus('connected'));
    room.onLeave(() => { if (this.status !== 'full') this.setStatus('offline', 'Disconnected from the party.'); });
    this.pingTimer = setInterval(() => this.send('ping', { t: Date.now() }), 2000);
    this.send('ping', { t: Date.now() });
    this.setStatus('connected');
  }

  private setStatus(s: Net['status'], detail?: string) { this.status = s; this.onStatus(s, detail); }

  send<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]) {
    if (this.room && this.status === 'connected') this.room.send(type, payload);
  }

  /** Subscribe to a server event; returns an unsubscribe function. */
  on<K extends keyof ServerEvents>(type: K, fn: Listener<K>): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    const f = fn as (p: unknown) => void;
    this.listeners.get(type)!.add(f);
    return () => { this.listeners.get(type)?.delete(f); };
  }

  private emit(type: string, p: unknown) { this.listeners.get(type)?.forEach((fn) => fn(p)); }

  /** Throttled pose stream. */
  updatePose(dt: number, pose: PoseArray, feetY: number, menuOpen: boolean) {
    this.poseAcc += dt;
    if (this.poseAcc < 1 / tunables.net.poseSendHz) return;
    this.poseAcc = 0;
    this.send('pose', { p: pose, feetY, menuOpen });
  }

  me(): NetState | undefined { return this.state?.players?.get(this.playerId); }
  isHost() { return !!this.state && this.state.hostId === this.playerId; }

  async leave() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    await this.room?.leave(true);
  }
}
