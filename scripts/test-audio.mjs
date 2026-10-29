import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { SpatialAudio, synthesize, AUDIO_PROFILES } from '../src/audio.js';
import worker from '../worker/index.js';
for (const kind of Object.keys(AUDIO_PROFILES)) {
  const b = synthesize(kind);
  assert.ok(b.length > 1000);
  assert.ok(b.every(Number.isFinite));
  assert.ok(Math.max(...b) <= 1 && Math.min(...b) >= -1);
  assert.ok(b.some((x) => Math.abs(x) > 0.05));
}
class Param {
  constructor() {
    this.value = 0;
  }
  setValueAtTime(v) {
    this.value = v;
  }
  setTargetAtTime(v) {
    this.value = v;
  }
  cancelScheduledValues() {}
}
class Node {
  constructor() {
    this.connections = [];
    this.gain = new Param();
    this.playbackRate = new Param();
    this.threshold = new Param();
    this.knee = new Param();
    this.ratio = new Param();
    for (const p of ['position', 'forward', 'up'])
      for (const a of ['X', 'Y', 'Z']) this[p + a] = new Param();
  }
  connect(node) {
    this.connections.push(node);
  }
  disconnect() {
    this.disconnected = true;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onended?.();
  }
}
class Context {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.sampleRate = 24000;
    this.destination = new Node();
    this.listener = new Node();
    this.created = [];
  }
  node() {
    const n = new Node();
    this.created.push(n);
    return n;
  }
  createGain() {
    return this.node();
  }
  createPanner() {
    return this.node();
  }
  createDynamicsCompressor() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createBuffer(channels, length, rate) {
    return {
      channels,
      length,
      rate,
      copyToChannel(samples) {
        this.samples = samples;
      },
    };
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}
const audio = new SpatialAudio({ Context, volume: 0.6 });
assert.equal(audio.context, null, 'no autoplay context before interaction');
assert.equal(audio.play('shot', { x: 0, y: 0, z: 0 }), false);
assert.equal(await audio.unlock(), true);
audio.setScene('flight');
const pos = { x: 12, y: 4, z: -6 };
audio.loop('mine', 'engine', pos, { rate: 1.5 });
const voice = audio.loops.get('mine');
assert.equal(voice.panner.panningModel, 'HRTF');
assert.equal(voice.panner.distanceModel, 'inverse');
assert.equal(voice.panner.positionX.value, 12);
assert.equal(voice.panner.positionZ.value, -6);
assert.equal(voice.source.buffer.channels, 1);
assert.equal(voice.source.playbackRate.value, 1.5);
assert.equal(voice.source.connections[0], voice.gain);
assert.equal(voice.gain.connections[0], voice.panner);
assert.equal(voice.panner.connections[0], audio.master);
assert.equal(audio.master.connections[0], audio.limiter);
assert.equal(
  audio.limiter.connections[0],
  audio.context.destination,
  'no unspatialized world-audio bypass',
);
audio.listener({ x: 3, y: 6, z: 9 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
assert.equal(audio.context.listener.positionZ.value, 9);
assert.equal(audio.context.listener.forwardX.value, 1);
assert.equal(audio.context.listener.upY.value, 1);
assert.equal(audio.play('shot', pos, { key: 'a', cooldown: 0.1 }), true);
assert.equal(audio.play('shot', pos, { key: 'a', cooldown: 0.1 }), false);
audio.context.currentTime += 0.11;
assert.equal(audio.play('shot', pos, { key: 'a', cooldown: 0.1 }), true);
for (let i = 0; i < 40; i++) audio.play('impact', pos);
assert.ok(audio.voices.size - audio.loops.size <= 24, 'one-shot polyphony is bounded');
audio.keep(new Set());
assert.equal(audio.loops.size, 0);
assert.equal(voice.source.stopped, true);
assert.equal(voice.panner.disconnected, true);
audio.setScene('purgatory');
assert.equal(audio.voices.size, 0, 'scene change clears office voices');
audio.loop('x', 'engine', pos);
audio.setMuted(true);
assert.equal(audio.master.gain.value, 0);
assert.equal(audio.loops.size, 0);
assert.equal(audio.play('step', pos), false);
audio.loop('x', 'engine', pos);
assert.equal(audio.loops.size, 0);
audio.setMuted(false);
audio.setVolume(0.25);
assert.equal(audio.master.gain.value, 0.25);
audio.visibility(true);
assert.equal(audio.master.gain.value, 0);
assert.equal(audio.play('stamp', pos), false);
audio.visibility(false);
assert.equal(audio.master.gain.value, 0.25);
for (let i = 0; i < 30; i++) audio.loop(String(i), 'insect', pos);
assert.ok(audio.loops.size <= 20);
await audio.close();
assert.equal(audio.context, null);
assert.equal(await audio.unlock(), true, 'audio can reopen after page lifecycle cleanup');
const unsupported = new SpatialAudio({ Context: null });
assert.equal(await unsupported.unlock(), false);
assert.equal(unsupported.status(), 'indisponible');
assert.equal(unsupported.play('shot', pos), false);
const r = await worker.fetch(new Request('https://test.local/audio.js'), {});
assert.equal(r.status, 200);
assert.match(await r.text(), /class SpatialAudio/);
console.log(
  'PASS: finite procedural mono buffers, HRTF graph for every source, moving listener/emitters, pitch, gain/mute, gesture activation, bounded voices, cooldown, scene isolation, hidden tab, cleanup, reopen and unsupported audio fallback.',
);
const falls = new SpatialAudio({ Context });
await falls.unlock();
falls.setScene('flight');
for (let i = 0; i < 20; i++) falls.followOnce('fall:' + i, 'fall', { x: i, y: 2, z: 0 });
assert.equal(falls.following.size, 16);
const dying = falls.following.get('fall:0');
assert.equal(falls.followOnce('fall:0', 'fall', { x: 20, y: 0, z: 0 }), false);
falls.moveFollowing('fall:0', { x: 3, y: 1, z: 2 });
assert.equal(dying.panner.positionX.value, 3);
assert.equal(dying.panner.positionY.value, 1);
falls.endFollowing('fall:0');
assert.equal(dying.source.stopped, true);
assert.equal(falls.following.size, 15);
falls.setMuted(true);
assert.equal(falls.following.size, 0);
assert.equal(falls.voices.size, 0);
await falls.close();
console.log(
  'PASS: finite falling-insect one-shots follow the corpse, do not duplicate, cap polyphony and clean up on impact/mute/removal.',
);
