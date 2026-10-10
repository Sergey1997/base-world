"use client";

import { useEffect, useSyncExternalStore } from "react";
import { live, type Toast, useGame } from "./store";

/**
 * Every sound in Base World is synthesised with Web Audio: no files to download, and the
 * music is generated live. The context starts on the first user gesture (browser autoplay rules).
 */

const KEY = "base-world:sound";
const BPM = 84;
const STEP = 60 / BPM / 2;
/** Dmaj9 → Bm9 → Gmaj9 → A6sus, as MIDI notes; the first entry is the bass. */
const CHORDS = [
  [50, 57, 61, 64, 66],
  [47, 54, 57, 61, 62],
  [43, 50, 54, 57, 59],
  [45, 52, 54, 59, 62],
];
const ARP = [1, 2, 3, 4, 3, 2, 4, 1];

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  reverb: ConvolverNode;
  echo: DelayNode;
  noise: AudioBuffer;
  wind: { gain: GainNode; filter: BiquadFilterNode };
  hum: { gain: GainNode; oscs: OscillatorNode[] };
}

let engine: Engine | null = null;
let enabled = typeof localStorage === "undefined" || localStorage.getItem(KEY) !== "off";
const listeners = new Set<() => void>();

export function useSoundOn() {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => enabled,
    () => true,
  );
}

export function toggleSound() {
  enabled = !enabled;
  localStorage.setItem(KEY, enabled ? "on" : "off");
  if (engine) engine.master.gain.setTargetAtTime(enabled ? 0.8 : 0, engine.ctx.currentTime, 0.08);
  listeners.forEach((l) => l());
}

function gain(ctx: AudioContext, value: number, to?: AudioNode) {
  const g = ctx.createGain();
  g.gain.value = value;
  if (to) g.connect(to);
  return g;
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function loopNoise(e: Pick<Engine, "ctx" | "noise">) {
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  src.start();
  return src;
}

function create(): Engine {
  const ctx = new AudioContext();
  const master = gain(ctx, enabled ? 0.8 : 0);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  master.connect(limiter).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, ctx.sampleRate * 2.8, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  }
  reverb.buffer = ir;
  reverb.connect(gain(ctx, 0.4, master));

  const music = gain(ctx, 0.32, master);
  const sfx = gain(ctx, 0.9, master);

  const echo = ctx.createDelay(1);
  echo.delayTime.value = STEP * 3;
  const feedback = gain(ctx, 0.36);
  echo.connect(filter(ctx, "lowpass", 2200)).connect(feedback).connect(echo);
  echo.connect(gain(ctx, 0.5, music));

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

  // City bed: deep filtered rumble, always on.
  loopNoise({ ctx, noise }).connect(filter(ctx, "lowpass", 260)).connect(gain(ctx, 0.07, master));

  const windFilter = filter(ctx, "bandpass", 500, 0.8);
  const windGain = gain(ctx, 0, sfx);
  loopNoise({ ctx, noise }).connect(windFilter).connect(windGain);

  const humGain = gain(ctx, 0, sfx);
  const humFilter = filter(ctx, "lowpass", 600, 2);
  humFilter.connect(humGain);
  const oscs = [0, 7].map((detune) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 55;
    o.detune.value = detune;
    o.connect(humFilter);
    o.start();
    return o;
  });

  const e: Engine = { ctx, master, music, sfx, reverb, echo, noise, wind: { gain: windGain, filter: windFilter }, hum: { gain: humGain, oscs } };
  startMusic(e);
  return e;
}

function startMusic(e: Engine) {
  const { ctx } = e;
  let next = ctx.currentTime + 0.1;
  let step = 0;
  setInterval(() => {
    if (ctx.state !== "running") return;
    if (next < ctx.currentTime - 0.1) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.3) {
      const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
      if (step % 16 === 0) pad(e, chord, next, 16 * STEP);
      if (step % 2 === 0 || Math.random() < 0.3) pluck(e, chord[ARP[step % 8]] + 12, next, step % 4 === 0 ? 0.07 : 0.045);
      if (Math.random() < 0.04) pluck(e, chord[1 + Math.floor(Math.random() * 4)] + 24, next + STEP / 2, 0.03);
      next += STEP;
      step++;
    }
  }, 60);
}

function pad(e: Engine, chord: number[], t: number, dur: number) {
  const { ctx } = e;
  const lp = filter(ctx, "lowpass", 500, 1.2);
  lp.frequency.setValueAtTime(450, t);
  lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
  lp.frequency.linearRampToValueAtTime(600, t + dur + 2);
  const env = gain(ctx, 0);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.045, t + 1.8);
  env.gain.setValueAtTime(0.045, t + dur);
  env.gain.linearRampToValueAtTime(0, t + dur + 2.2);
  lp.connect(env);
  env.connect(e.music);
  env.connect(e.reverb);
  for (const m of chord.slice(1)) {
    for (const detune of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(m);
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 2.3);
    }
  }
  const bass = ctx.createOscillator();
  bass.frequency.value = hz(chord[0] - 12);
  const bg = gain(ctx, 0, e.music);
  bg.gain.setValueAtTime(0, t);
  bg.gain.linearRampToValueAtTime(0.16, t + 0.8);
  bg.gain.setValueAtTime(0.16, t + dur - 0.3);
  bg.gain.linearRampToValueAtTime(0, t + dur + 0.4);
  bass.connect(bg);
  bass.start(t);
  bass.stop(t + dur + 0.5);
}

function pluck(e: Engine, m: number, t: number, vol: number) {
  const { ctx } = e;
  const env = gain(ctx, 0.0001);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  env.connect(e.music);
  env.connect(e.echo);
  env.connect(e.reverb);
  for (const [type, mult] of [
    ["triangle", 1],
    ["sine", 2],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(m) * mult;
    o.connect(env);
    o.start(t);
    o.stop(t + 0.75);
  }
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  vol: number;
  at?: number;
  wet?: boolean;
}

function tone(e: Engine, { type = "sine", from, to = from, dur, vol, at = 0, wet }: ToneOpts) {
  const t = e.ctx.currentTime + at;
  const o = e.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = gain(e.ctx, 0.0001, e.sfx);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (wet) g.connect(e.reverb);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.02);
}

interface NoiseOpts {
  type?: BiquadFilterType;
  from: number;
  to?: number;
  dur: number;
  vol: number;
  at?: number;
  Q?: number;
  wet?: boolean;
}

function hiss(e: Engine, { type = "bandpass", from, to = from, dur, vol, at = 0, Q = 1, wet }: NoiseOpts) {
  const t = e.ctx.currentTime + at;
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  const f = filter(e.ctx, type, from, Q);
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = gain(e.ctx, 0.0001, e.sfx);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (wet) g.connect(e.reverb);
  src.connect(f).connect(g);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

/** Runs `fn` only while sound is on and the context is live. */
const fx =
  <A extends unknown[]>(fn: (e: Engine, ...args: A) => void) =>
  (...args: A) => {
    if (engine && enabled && engine.ctx.state === "running") fn(engine, ...args);
  };

const chime = (e: Engine, notes: number[], gap: number, vol: number) =>
  notes.forEach((m, i) => {
    tone(e, { type: "triangle", from: hz(m), dur: 0.9, vol, at: i * gap, wet: true });
    tone(e, { from: hz(m) * 2, dur: 0.5, vol: vol * 0.4, at: i * gap, wet: true });
  });

export const sound = {
  step: fx((e) => hiss(e, { type: "lowpass", from: 900 + Math.random() * 400, to: 300, dur: 0.07, vol: 0.05 })),
  jump: fx((e) => {
    tone(e, { from: 260, to: 620, dur: 0.16, vol: 0.12 });
    hiss(e, { from: 1200, to: 3000, dur: 0.14, vol: 0.05 });
  }),
  doubleJump: fx((e) => {
    tone(e, { type: "triangle", from: 520, to: 1250, dur: 0.2, vol: 0.1, wet: true });
    tone(e, { from: 1560, dur: 0.25, vol: 0.04, at: 0.06, wet: true });
  }),
  dash: fx((e) => {
    hiss(e, { from: 3200, to: 380, dur: 0.38, vol: 0.22, Q: 1.4 });
    tone(e, { from: 140, to: 50, dur: 0.22, vol: 0.18 });
  }),
  pad: fx((e) => {
    tone(e, { from: 180, to: 880, dur: 0.45, vol: 0.14, wet: true });
    hiss(e, { from: 600, to: 4000, dur: 0.5, vol: 0.08 });
  }),
  land: fx((e, impact: number) => {
    const k = Math.min(1, impact / 30);
    tone(e, { from: 120, to: 45, dur: 0.18 + k * 0.15, vol: 0.06 + k * 0.22 });
    hiss(e, { type: "lowpass", from: 1400, to: 200, dur: 0.15 + k * 0.2, vol: 0.04 + k * 0.12 });
  }),
  mach: fx((e) => {
    tone(e, { from: 90, to: 30, dur: 0.7, vol: 0.3 });
    hiss(e, { type: "lowpass", from: 2400, to: 120, dur: 0.9, vol: 0.25, wet: true });
  }),
  ring: fx((e) => chime(e, [81, 88], 0.07, 0.08)),
  open: fx((e) => {
    tone(e, { type: "triangle", from: 660, dur: 0.08, vol: 0.06 });
    tone(e, { type: "triangle", from: 990, dur: 0.12, vol: 0.06, at: 0.06, wet: true });
  }),
  close: fx((e) => {
    tone(e, { type: "triangle", from: 880, dur: 0.07, vol: 0.05 });
    tone(e, { type: "triangle", from: 587, dur: 0.1, vol: 0.05, at: 0.05 });
  }),
  toast: fx((e, tone_: Toast["tone"]) => {
    if (tone_ === "reward") chime(e, [74, 78, 81, 86], 0.08, 0.08);
    else if (tone_ === "level") {
      chime(e, [62, 66, 69, 74, 78, 81, 86], 0.06, 0.08);
      hiss(e, { type: "highpass", from: 5000, to: 9000, dur: 1.2, vol: 0.04, at: 0.3, wet: true });
    } else if (tone_ === "quest") chime(e, [69, 76], 0.12, 0.08);
    else if (tone_ === "fail") {
      tone(e, { type: "square", from: 220, to: 200, dur: 0.16, vol: 0.04 });
      tone(e, { type: "square", from: 165, to: 150, dur: 0.24, vol: 0.04, at: 0.14 });
    } else tone(e, { type: "triangle", from: 880, dur: 0.12, vol: 0.05, wet: true });
  }),
  /** Fireworks are heard with a speed-of-sound delay, so distant bursts flash before they boom. */
  firework: fx((e, x: number, y: number, z: number) => {
    const d = Math.hypot(x - live.pos.x, y - live.pos.y, z - live.pos.z);
    if (d > 420) return;
    const k = (1 - d / 420) ** 2;
    const at = Math.min(d / 340, 1.2);
    tone(e, { from: 110, to: 35, dur: 0.9, vol: 0.32 * k, at });
    hiss(e, { type: "lowpass", from: 1800, to: 150, dur: 1.1, vol: 0.28 * k, at, wet: true });
    for (let i = 0; i < 22; i++) hiss(e, { type: "highpass", from: 3000 + Math.random() * 3000, dur: 0.03, vol: 0.06 * k, at: at + 0.35 + Math.random() * 1.3 });
  }),
  /** Called every frame: wind rises with speed and airtime, the hoverboard hums while boosting. */
  motion(speed: number, boosting: boolean, airborne: boolean) {
    if (!engine) return;
    const t = engine.ctx.currentTime;
    const v = Math.min(speed / 60, 1.5);
    engine.wind.gain.gain.setTargetAtTime(v * 0.22 + (airborne ? 0.04 : 0), t, 0.15);
    engine.wind.filter.frequency.setTargetAtTime(300 + speed * 28, t, 0.15);
    engine.hum.gain.gain.setTargetAtTime(boosting ? 0.06 : 0, t, 0.12);
    for (const o of engine.hum.oscs) o.frequency.setTargetAtTime(50 + speed * 1.4, t, 0.1);
  },
};

/** Boots audio on the first gesture and voices store events (toasts, panels, race rings). */
export function useSound() {
  useEffect(() => {
    const unlock = () => {
      engine ??= create();
      void engine.ctx.resume();
    };
    const visibility = () => {
      if (!engine) return;
      void (document.hidden ? engine.ctx.suspend() : engine.ctx.resume());
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", visibility);

    const unsubscribe = useGame.subscribe((s, prev) => {
      const fresh = s.toasts.at(-1);
      if (fresh && fresh.id !== prev.toasts.at(-1)?.id) sound.toast(fresh.tone);
      const open = !!(s.dialog || s.panel || s.logOpen || s.mapOpen);
      const wasOpen = !!(prev.dialog || prev.panel || prev.logOpen || prev.mapOpen);
      if (open !== wasOpen) (open ? sound.open : sound.close)();
      if (s.race.running && s.race.next > prev.race.next && prev.race.next > 0) sound.ring();
    });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
      void engine?.ctx.suspend();
    };
  }, []);
}
