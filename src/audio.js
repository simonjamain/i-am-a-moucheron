// All diegetic audio passes through a world-space HRTF PannerNode.
// No media capture, downloads, or external sound services.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const profiles = {
  alarm: { duration: 3.2, level: 0.3 },
  ambience: { duration: 4, level: 0.035 },
  board: { duration: 0.55, level: 0.2 },
  exit: { duration: 0.35, level: 0.17 },
  clear: { duration: 1.1, level: 0.24 },
  defeat: { duration: 1.5, level: 0.25 },
  dollar: { duration: 0.26, level: 0.2 },
  confirm: { duration: 0.18, level: 0.16 },
  ricochet: { duration: 0.28, level: 0.19 },
  tick: { duration: 0.1, level: 0.14 },
  flak: { duration: 0.45, level: 0.38 },
  dive: { duration: 1, level: 0.22 },
  engine: { duration: 1, level: 0.16 },
  insect: { duration: 1, level: 0.12 },
  shot: { duration: 0.13, level: 0.28 },
  impact: { duration: 0.24, level: 0.35 },
  crash: { duration: 0.8, level: 0.4 },
  punch: { duration: 0.18, level: 0.24 },
  block: { duration: 0.19, level: 0.22 },
  ko: { duration: 0.4, level: 0.3 },
  step: { duration: 0.1, level: 0.11 },
  paper: { duration: 0.28, level: 0.17 },
  fall: { duration: 4, level: 0.22 },
  stamp: { duration: 0.22, level: 0.24 },
  spawn: { duration: 0.7, level: 0.18 },
  wave: { duration: 0.8, level: 0.17 },
  dash: { duration: 0.18, level: 0.13 },
};
export const AUDIO_PROFILES = profiles;
export function synthesize(kind, sampleRate = 24000) {
  const p = profiles[kind];
  if (!p) throw Error('Unknown sound');
  const samples = new Float32Array(Math.round(p.duration * sampleRate));
  let seed = 12345,
    low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate,
      u = i / samples.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += 0.08 * (noise - low);
    let v = 0,
      env = 1;
    if (kind === 'fall') {
      const f = 800 * (1 - u) ** 1.6 + 80;
      env = Math.min(1, t / 0.06) * Math.min(1, (p.duration - t) * 3);
      v =
        0.4 * Math.sin(2 * Math.PI * (800 * t - 90 * t * t)) +
        0.15 * Math.sin(2 * Math.PI * f * t) +
        low * 0.35;
    } else if (kind === 'dollar') {
      const notes = [1046.5, 1318.5, 1568, 2093],
        f = notes[Math.min(3, Math.floor(u * 4))];
      env = Math.min(1, t / 0.003) * (1 - u) ** 0.65;
      v = Math.sin(2 * Math.PI * f * t) * 0.55 + Math.sin(4 * Math.PI * f * t) * 0.14;
    } else if (kind === 'alarm') {
      const phase = 2 * Math.PI * 440 * t - (160 / 0.45) * Math.cos(2 * Math.PI * 0.45 * t);
      env = Math.min(1, t / 0.15, (p.duration - t) / 0.4);
      v = (Math.sin(phase) * 0.55 + Math.sin(phase * 2) * 0.18) * env;
    } else if (kind === 'ambience')
      v =
        low * 0.2 + Math.sin(t * 2 * Math.PI * 60) * 0.12 + Math.sin(t * 2 * Math.PI * 120) * 0.04;
    else if (kind === 'engine')
      v =
        0.3 * Math.sin(t * 80 * Math.PI * 2) +
        0.18 * Math.sin(t * 160 * Math.PI * 2) +
        low * 0.7 * (0.7 + 0.3 * Math.sin(t * 24 * Math.PI * 2));
    else if (kind === 'dive')
      v = 0.4 * Math.sin(2 * Math.PI * 420 * t) + 0.2 * Math.sin(2 * Math.PI * 840 * t) + low * 0.2;
    else if (kind === 'insect')
      v =
        0.3 * Math.sin(t * 210 * Math.PI * 2) + 0.12 * Math.sin(t * 420 * Math.PI * 2) + low * 0.25;
    else {
      env = Math.min(1, t / 0.004) * (1 - u) ** 2;
      if (['board', 'exit', 'clear', 'defeat', 'confirm', 'tick'].includes(kind)) {
        const notes =
          kind === 'clear'
            ? [440, 550, 660]
            : kind === 'defeat'
              ? [330, 260, 180]
              : kind === 'board'
                ? [330, 440, 550]
                : kind === 'exit'
                  ? [440, 330]
                  : [880];
        const f = notes[Math.min(notes.length - 1, Math.floor(u * notes.length))];
        v = Math.sin(t * 2 * Math.PI * f) * 0.45;
      } else if (kind === 'ricochet')
        v = Math.sin(2 * Math.PI * (1700 * t - 1600 * t * t)) * 0.45 + noise * 0.1;
      else if (kind === 'flak')
        v = low * 2 * Math.exp(-t * 9) + Math.sin(2 * Math.PI * 55 * t) * 0.45 * Math.exp(-t * 8);
      else if (kind === 'shot')
        v =
          noise * 0.55 * Math.exp(-t * 35) +
          Math.sin(t * (180 - 280 * t) * Math.PI * 2) * 0.4 * Math.exp(-t * 25);
      else if (kind === 'crash' || kind === 'impact' || kind === 'ko')
        v =
          low * 2.3 +
          Math.sin(t * (kind === 'crash' ? 42 : 65) * Math.PI * 2) * Math.exp(-t * 12) * 0.6;
      else if (kind === 'punch') v = Math.sin(t * (105 - 220 * t) * Math.PI * 2) * 0.6 + low * 0.8;
      else if (kind === 'block' || kind === 'stamp')
        v =
          Math.sin(t * 340 * Math.PI * 2) * Math.exp(-t * 35) * 0.35 +
          noise * 0.35 * Math.exp(-t * 28) +
          Math.sin(t * 90 * Math.PI * 2) * 0.4;
      else if (kind === 'step')
        v = low * 1.7 + Math.sin(t * 100 * Math.PI * 2) * Math.exp(-t * 40) * 0.25;
      else if (kind === 'paper') v = (noise - low) * 0.32 * (0.5 + 0.5 * Math.sin(t * 47));
      else if (kind === 'dash') v = low * 1.7 * Math.sin(Math.PI * u);
      else if (kind === 'spawn' || kind === 'wave')
        v =
          Math.sin(t * (kind === 'spawn' ? 260 + 140 * t : 220) * Math.PI * 2) * 0.3 +
          Math.sin(t * 330 * Math.PI * 2) * 0.18;
    }
    samples[i] = clamp(v * env, -0.95, 0.95);
  }
  return samples;
}
export class SpatialAudio {
  constructor({
    Context = globalThis.AudioContext || globalThis.webkitAudioContext,
    volume = 0.55,
    muted = false,
  } = {}) {
    this.Context = Context;
    this.distanceScale = 1;
    this.volume = clamp(Number(volume) || 0, 0, 1);
    this.muted = muted;
    this.context = null;
    this.loops = new Map();
    this.following = new Map();
    this.voices = new Set();
    this.buffers = new Map();
    this.scene = null;
    this.last = new Map();
    this.hidden = false;
    this.error = '';
  }
  async unlock() {
    try {
      if (!this.Context) return false;
      if (!this.context) {
        const c = (this.context = new this.Context({ latencyHint: 'interactive' }));
        this.master = c.createGain();
        this.limiter = c.createDynamicsCompressor();
        this.limiter.threshold.value = -12;
        this.limiter.knee.value = 12;
        this.limiter.ratio.value = 8;
        this.master.connect(this.limiter);
        this.limiter.connect(c.destination);
        this.applyVolume();
      }
      if (this.context.state !== 'running' && this.context.state !== 'closed')
        await this.context.resume();
      if (this.context.state === 'running') this.error = '';
      return this.context.state === 'running';
    } catch (e) {
      this.error = e.name || 'Audio';
      return false;
    }
  }
  applyVolume() {
    if (this.context)
      this.master.gain.setTargetAtTime(
        this.muted || this.hidden ? 0 : this.volume,
        this.context.currentTime,
        0.025,
      );
  }
  setVolume(v) {
    this.volume = clamp(Number(v) || 0, 0, 1);
    this.applyVolume();
  }
  setMuted(v) {
    this.muted = !!v;
    this.applyVolume();
    if (this.muted) this.clear();
  }
  visibility(hidden) {
    this.hidden = hidden;
    this.applyVolume();
    if (hidden) this.clear();
  }
  setScene(scene) {
    if (this.scene === scene) return;
    this.clear();
    this.last.clear();
    this.scene = scene;
  }
  buffer(kind) {
    if (!this.buffers.has(kind)) {
      const samples = synthesize(kind, this.context.sampleRate);
      const b = this.context.createBuffer(1, samples.length, this.context.sampleRate);
      b.copyToChannel(samples, 0);
      this.buffers.set(kind, b);
    }
    return this.buffers.get(kind);
  }
  create(kind, pos, loop, refDistance = 6) {
    const c = this.context,
      source = c.createBufferSource(),
      gain = c.createGain(),
      panner = c.createPanner();
    source.buffer = this.buffer(kind);
    source.loop = loop;
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance * this.distanceScale;
    panner.maxDistance = (this.scene === 'purgatory' ? 55 : 200) * this.distanceScale;
    panner.rolloffFactor = 1.3;
    panner.coneInnerAngle = 360;
    gain.gain.value = profiles[kind].level;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.master);
    const voice = { source, gain, panner, kind, loop };
    this.move(voice, pos, true);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    this.voices.add(voice);
    source.start();
    return voice;
  }
  move(v, p, immediate = false) {
    const now = this.context.currentTime;
    for (const [axis, key] of [
      ['X', 'x'],
      ['Y', 'y'],
      ['Z', 'z'],
    ]) {
      const param = v.panner['position' + axis],
        value = Number(p[key]) || 0;
      if (immediate) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, 0.025);
    }
  }
  listener(position, forward, up) {
    if (!this.context) return;
    const l = this.context.listener,
      t = this.context.currentTime;
    for (const [prefix, v] of [
      ['position', position],
      ['forward', forward],
      ['up', up],
    ])
      for (const axis of ['x', 'y', 'z'])
        l[prefix + axis.toUpperCase()].setTargetAtTime(v[axis], t, 0.015);
  }
  loop(key, kind, pos, { rate = 1, level = 1, ref = 8 } = {}) {
    if (!this.context || this.context.state !== 'running' || this.hidden || this.muted) return;
    let v = this.loops.get(key);
    if (!v) {
      if (this.loops.size >= 20) return;
      v = this.create(kind, pos, true, ref);
      this.loops.set(key, v);
    }
    this.move(v, pos);
    v.source.playbackRate.setTargetAtTime(clamp(rate, 0.35, 3), this.context.currentTime, 0.08);
    v.gain.gain.setTargetAtTime(profiles[kind].level * level, this.context.currentTime, 0.05);
  }
  keep(keys) {
    for (const [key, v] of this.loops)
      if (!keys.has(key)) {
        this.stop(v);
        this.loops.delete(key);
      }
  }
  play(kind, pos, { key = '', cooldown = 0, ref = 6, level = 1 } = {}) {
    if (
      !this.context ||
      this.context.state !== 'running' ||
      this.hidden ||
      this.muted ||
      !profiles[kind]
    )
      return false;
    const now = this.context.currentTime;
    if (key && now - (this.last.get(key) ?? -Infinity) < cooldown) return false;
    if (key) {
      this.last.set(key, now);
      if (this.last.size > 256) this.last.delete(this.last.keys().next().value);
    }
    if (this.voices.size - this.loops.size >= 24) return false;
    const v = this.create(kind, pos, false, ref);
    v.gain.gain.value = profiles[kind].level * level;
    return true;
  }
  followOnce(key, kind, pos, { ref = 8 } = {}) {
    if (
      this.following.has(key) ||
      !this.context ||
      this.context.state !== 'running' ||
      this.hidden ||
      this.muted ||
      this.following.size >= 16 ||
      this.voices.size - this.loops.size >= 24
    )
      return false;
    const voice = this.create(kind, pos, false, ref);
    this.following.set(key, voice);
    const ended = voice.source.onended;
    voice.source.onended = () => {
      ended();
      if (this.following.get(key) === voice) this.following.delete(key);
    };
    return true;
  }
  moveFollowing(key, pos) {
    const v = this.following.get(key);
    if (v) this.move(v, pos);
  }
  endFollowing(key) {
    const v = this.following.get(key);
    if (v) {
      this.stop(v);
      this.following.delete(key);
    }
  }
  stop(v) {
    try {
      const t = this.context.currentTime;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 0.008);
      v.source.stop(t + 0.04);
    } catch {}
  }
  clear() {
    for (const v of this.voices) this.stop(v);
    this.loops.clear();
    this.following.clear();
  }
  status() {
    return !this.Context
      ? 'indisponible'
      : this.error
        ? 'indisponible'
        : this.context?.state === 'running'
          ? 'actif'
          : 'à activer';
  }
  async close() {
    this.clear();
    const c = this.context;
    this.context = null;
    this.buffers.clear();
    this.voices.clear();
    if (c && c.state !== 'closed')
      try {
        await c.close();
      } catch {}
  }
}
