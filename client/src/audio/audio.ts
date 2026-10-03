import * as THREE from 'three';
import type { Room } from '@museum/shared';
import { flags } from '../core/config';
import { loadPref, savePref } from '../core/identity';

/**
 * Audio (brief §10). Everything is synthesised with WebAudio so nothing needs
 * licensing; real CC0 recordings can replace any buffer later through the
 * asset manifest. Two independent buses, Music and FX, persisted locally.
 */
export type Sfx = 'crack' | 'shatter' | 'thud' | 'whoosh' | 'ko' | 'pickup' | 'drop' | 'score' | 'ui' | 'stepStone' | 'stepWood' | 'stepConcrete' | 'stepMetal' | 'bad' | 'door';

const ACOUSTICS: Record<Room['acoustic'], { decay: number; wet: number; amb: 'murmur' | 'street' | 'water' | 'hum' | 'none' }> = {
  hall: { decay: 3.2, wet: 0.45, amb: 'murmur' },
  court: { decay: 4.2, wet: 0.5, amb: 'water' },
  gallery: { decay: 1.6, wet: 0.3, amb: 'murmur' },
  tomb: { decay: 0.5, wet: 0.15, amb: 'none' },
  service: { decay: 0.9, wet: 0.35, amb: 'hum' },
  outdoor: { decay: 0.4, wet: 0.08, amb: 'street' },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private fxBus!: GainNode;
  private revIn!: GainNode;
  private convolvers: { node: ConvolverNode; gain: GainNode }[] = [];
  private activeConv = 0;
  private buffers = new Map<Sfx, AudioBuffer>();
  private ambGain!: GainNode;
  private ambSources = new Map<string, { gain: GainNode }>();
  private currentAcoustic: Room['acoustic'] | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  intensity = 0; // 0 lobby theme, 1 round tension
  musicOn = loadPref('musicOn', !flags.noMusic);
  fxOn = loadPref('fxOn', true);
  musicVol = loadPref('musicVol', 0.5);
  fxVol = loadPref('fxVol', 0.8);
  private alarms: { stop(): void }[] = [];
  private hum: { gain: GainNode; panner: PannerNode } | null = null;

  /** Call from a user gesture (Play / Enter VR). */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.fxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.fxBus.connect(this.master);
    this.revIn = ctx.createGain();
    for (let i = 0; i < 2; i++) {
      const node = ctx.createConvolver();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      this.revIn.connect(node);
      node.connect(gain);
      gain.connect(this.fxBus);
      this.convolvers.push({ node, gain });
    }
    this.ambGain = ctx.createGain();
    this.ambGain.connect(this.fxBus);
    this.applyLevels();
    this.synthesise();
    this.startAmbience();
    this.startMusic();
  }

  applyLevels() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicOn ? this.musicVol * 0.5 : 0, t, 0.2);
    this.fxBus.gain.setTargetAtTime(this.fxOn ? this.fxVol : 0, t, 0.1);
    savePref('musicOn', this.musicOn); savePref('fxOn', this.fxOn);
    savePref('musicVol', this.musicVol); savePref('fxVol', this.fxVol);
  }

  setMusic(on: boolean) { this.musicOn = on; this.applyLevels(); }
  setFx(on: boolean) { this.fxOn = on; this.applyLevels(); }
  nudgeMusic(d: number) { this.musicVol = THREE.MathUtils.clamp(this.musicVol + d, 0, 1); this.applyLevels(); }
  nudgeFx(d: number) { this.fxVol = THREE.MathUtils.clamp(this.fxVol + d, 0, 1); this.applyLevels(); }

  /** Listener follows the head. */
  updateListener(camera: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.getWorldPosition(_v);
    const f = camera.getWorldDirection(_f);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
    }
  }

  /** Crossfade reverb and ambience when entering a room with different acoustics. */
  setRoom(acoustic: Room['acoustic']) {
    if (!this.ctx || acoustic === this.currentAcoustic) return;
    this.currentAcoustic = acoustic;
    const a = ACOUSTICS[acoustic];
    const t = this.ctx.currentTime;
    const next = 1 - this.activeConv;
    this.convolvers[next].node.buffer = this.impulse(a.decay);
    this.convolvers[next].gain.gain.setTargetAtTime(a.wet, t, 0.3);
    this.convolvers[this.activeConv].gain.gain.setTargetAtTime(0, t, 0.3);
    this.activeConv = next;
    for (const [name, s] of this.ambSources) s.gain.gain.setTargetAtTime(name === a.amb ? 1 : 0, t, 0.6);
  }

  play(name: Sfx, pos?: THREE.Vector3 | [number, number, number], opts: { gain?: number; rate?: number; reverb?: number; refDistance?: number } = {}) {
    if (!this.ctx || !this.fxOn) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const g = this.ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g);
    const out = pos ? this.panner(pos, opts.refDistance ?? 2) : null;
    if (out) { g.connect(out); out.connect(this.fxBus); out.connect(this.sendGain(opts.reverb ?? 0.6)); }
    else { g.connect(this.fxBus); g.connect(this.sendGain(opts.reverb ?? 0.4)); }
    src.start();
  }

  /** Loud, positional two-tone alarm audible across neighbouring rooms. */
  alarm(pos: [number, number, number], seconds = 8) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const g = ctx.createGain();
    g.gain.value = 0.18;
    for (let i = 0; i < seconds * 2; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 880, t + i * 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    osc.connect(lp); lp.connect(g);
    const p = this.panner(pos, 12);
    g.connect(p); p.connect(this.fxBus); p.connect(this.sendGain(0.8));
    g.gain.setValueAtTime(0.18, t + seconds - 0.5);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    osc.start(); osc.stop(t + seconds);
    this.alarms.push({ stop: () => { try { osc.stop(); } catch { /* already */ } } });
  }

  stopAlarms() { this.alarms.forEach((a) => a.stop()); this.alarms = []; }

  /** The carried-relic hum (anti-stalemate). Pass null to stop. */
  setHum(pos: THREE.Vector3 | null) {
    if (!this.ctx) return;
    if (!pos) { if (this.hum) { this.hum.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); } return; }
    if (!this.hum) {
      const ctx = this.ctx;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.frequency.value = 110; o2.frequency.value = 110 * 1.5 + 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      const panner = this.panner([0, 0, 0], 4);
      o1.connect(g); o2.connect(g); g.connect(panner); panner.connect(this.fxBus);
      o1.start(); o2.start();
      this.hum = { gain: g, panner };
    }
    const t = this.ctx.currentTime;
    this.hum.gain.gain.setTargetAtTime(0.06, t, 0.2);
    this.hum.panner.positionX.setValueAtTime(pos.x, t);
    this.hum.panner.positionY.setValueAtTime(pos.y, t);
    this.hum.panner.positionZ.setValueAtTime(pos.z, t);
  }

  private panner(pos: THREE.Vector3 | [number, number, number], ref: number): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.2;
    const [x, y, z] = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    return p;
  }

  private sendGain(amount: number) {
    const g = this.ctx!.createGain();
    g.gain.value = amount;
    g.connect(this.revIn);
    return g;
  }

  // ─── Synthesis ─────────────────────────────────────────────────────────────
  private buffer(seconds: number, fn: (t: number, i: number, sr: number) => number): AudioBuffer {
    const sr = this.ctx!.sampleRate;
    const b = this.ctx!.createBuffer(1, Math.max(1, Math.floor(seconds * sr)), sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fn(i / sr, i, sr);
    return b;
  }

  private impulse(decay: number): AudioBuffer {
    const sr = this.ctx!.sampleRate, len = Math.floor(sr * Math.max(0.3, decay));
    const b = this.ctx!.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }

  private synthesise() {
    const rnd = () => Math.random() * 2 - 1;
    const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
    let lp = 0;
    this.buffers.set('crack', this.buffer(0.35, (t) => {
      const n = rnd() * env(t, 0.001, 0.05);
      const ring = Math.sin(t * 2 * Math.PI * 3200) * env(t, 0.001, 0.08) * 0.4 + Math.sin(t * 2 * Math.PI * 5100) * env(t, 0.001, 0.05) * 0.3;
      return (n * 0.8 + ring) * 0.9;
    }));
    this.buffers.set('shatter', this.buffer(1.6, (t) => {
      let s = rnd() * env(t, 0.002, 0.25) * 0.7;
      for (const f of [2700, 3900, 5300, 6900, 8100]) s += Math.sin(t * 2 * Math.PI * f * (1 + Math.sin(t * 13) * 0.01)) * env(t, 0.003, 0.3 + (f % 7) * 0.05) * 0.12 * (Math.random() < 0.3 ? 1 : 0.4);
      // Tinkling debris.
      if (Math.random() < 0.002 * Math.exp(-t * 2)) s += 0.6;
      return s;
    }));
    this.buffers.set('thud', this.buffer(0.25, (t) => { lp += (rnd() - lp) * 0.05; return (Math.sin(t * 2 * Math.PI * 90 * (1 - t)) * 0.8 + lp * 2) * env(t, 0.002, 0.06); }));
    this.buffers.set('whoosh', this.buffer(0.35, (t) => { lp += (rnd() - lp) * (0.05 + t * 0.4); return lp * 2.2 * Math.sin(Math.PI * t / 0.35); }));
    this.buffers.set('ko', this.buffer(1.1, (t) => {
      const f = 1200 * Math.exp(-t * 2.2) + 200;
      const boing = t > 0.6 ? Math.sin(2 * Math.PI * 140 * t * (1 + 0.3 * Math.sin(t * 40))) * env(t - 0.6, 0.005, 0.15) : 0;
      return Math.sin(2 * Math.PI * f * t) * 0.35 * (t < 0.6 ? 1 : 0) + boing * 0.6;
    }));
    this.buffers.set('pickup', this.buffer(0.5, (t) => (Math.sin(2 * Math.PI * 880 * t) + Math.sin(2 * Math.PI * 1320 * t) * 0.6) * env(t, 0.005, 0.15) * 0.35));
    this.buffers.set('drop', this.buffer(0.3, (t) => (Math.sin(2 * Math.PI * 160 * t) * 0.7 + rnd() * 0.3) * env(t, 0.002, 0.06)));
    this.buffers.set('score', this.buffer(1.4, (t) => {
      const notes = [523, 659, 784, 1047];
      const i = Math.min(3, Math.floor(t / 0.16));
      return (Math.sin(2 * Math.PI * notes[i] * t) * 0.5 + Math.sin(2 * Math.PI * notes[i] * 2 * t) * 0.15) * env(t - i * 0.16, 0.01, i === 3 ? 0.5 : 0.12) * 0.5;
    }));
    this.buffers.set('bad', this.buffer(0.8, (t) => Math.sin(2 * Math.PI * (300 - t * 120) * t) * env(t, 0.01, 0.25) * 0.35));
    this.buffers.set('ui', this.buffer(0.08, (t) => Math.sin(2 * Math.PI * 1600 * t) * env(t, 0.001, 0.02) * 0.3));
    this.buffers.set('door', this.buffer(0.9, (t) => { lp += (rnd() - lp) * 0.02; return (lp * 3 + Math.sin(2 * Math.PI * 70 * t) * 0.3) * env(t, 0.05, 0.3); }));
    const step = (bright: number, body: number, len: number) => this.buffer(len, (t) => { lp += (rnd() - lp) * bright; return (lp * 2 + Math.sin(2 * Math.PI * body * t) * 0.3) * env(t, 0.002, len / 4) * 0.5; });
    this.buffers.set('stepStone', step(0.35, 180, 0.12));
    this.buffers.set('stepWood', step(0.12, 120, 0.14));
    this.buffers.set('stepConcrete', step(0.25, 90, 0.1));
    this.buffers.set('stepMetal', this.buffer(0.2, (t) => (Math.sin(2 * Math.PI * 420 * t) * 0.4 + Math.sin(2 * Math.PI * 1130 * t) * 0.25 + rnd() * 0.2) * env(t, 0.001, 0.05) * 0.5));
  }

  private startAmbience() {
    const ctx = this.ctx!;
    const noise = this.buffer(4, () => Math.random() * 2 - 1);
    const make = (name: string, build: (src: AudioNode) => AudioNode, level: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      const lvl = ctx.createGain(); lvl.gain.value = level;
      build(src).connect(lvl); lvl.connect(g); g.connect(this.ambGain);
      src.start();
      this.ambSources.set(name, { gain: g });
    };
    make('murmur', (s) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 450; f.Q.value = 0.8; s.connect(f); return f; }, 0.05);
    make('street', (s) => { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; s.connect(f); return f; }, 0.18);
    make('water', (s) => { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500; s.connect(f); return f; }, 0.03);
    make('hum', (s) => { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120; s.connect(f); return f; }, 0.25);
  }

  /** Light generative music: a lobby pad + arpeggio, with a pulse layer during rounds. */
  private startMusic() {
    const ctx = this.ctx!;
    const chords = [[220, 277, 330], [196, 247, 294], [174, 220, 262], [196, 247, 330]];
    const bar = 2.4;
    this.nextNoteTime = ctx.currentTime + 0.2;
    const note = (f: number, at: number, len: number, gain: number, type: OscillatorType) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + Math.min(0.3, len / 4)); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g); g.connect(this.musicBus); o.start(at); o.stop(at + len + 0.05);
    };
    setInterval(() => {
      while (this.nextNoteTime < ctx.currentTime + 0.6) {
        const step = this.musicStep++;
        const chord = chords[Math.floor(step / 8) % chords.length];
        const t = this.nextNoteTime;
        if (step % 8 === 0) for (const f of chord) note(f / 2, t, bar * 1.05, 0.05, 'sine');
        note(chord[step % 3] * (step % 16 < 8 ? 2 : 4), t, 0.5, 0.03, 'triangle');
        if (this.intensity > 0 && step % 2 === 0) note(chord[0] / 4, t, 0.18, 0.08, 'sawtooth');
        this.nextNoteTime += bar / 8 / (this.intensity > 0 ? 1.25 : 1);
      }
    }, 150);
  }
}

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
