// Minimal Web Audio double for the audio library tests: a controllable clock,
// nodes that record connections, starts and stops, and timers driven by hand.
export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(v, t) {
    this.value = v;
    this.events.push(['set', v, t]);
  }
  setTargetAtTime(v, t) {
    this.value = v;
    this.events.push(['target', v, t]);
  }
  linearRampToValueAtTime(v, t) {
    this.value = v;
    this.events.push(['ramp', v, t]);
  }
  cancelScheduledValues() {}
}

export class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.connections = [];
    this.disconnected = false;
  }
  connect(node) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeSource extends FakeNode {
  constructor(ctx, kind) {
    super(ctx, kind);
    this.started = null;
    this.offset = 0;
    this.stopAt = null;
    this.ended = false;
    this.onended = null;
  }
  start(when = 0, offset = 0) {
    this.started = when;
    this.offset = offset;
    this.ctx.sources.push(this);
  }
  stop(when) {
    if (this.started === null) throw Error('InvalidStateError');
    this.stopAt = when === undefined ? this.ctx.currentTime : when;
    this.ctx.settle();
  }
  /** Context time at which this source ends on its own. */
  naturalEnd() {
    if (this.kind !== 'buffer' || this.loop || !this.buffer) return Infinity;
    return this.started + (this.buffer.duration - this.offset) / (this.playbackRate.value || 1);
  }
  end() {
    if (this.ended) return;
    this.ended = true;
    this.onended?.();
  }
}

export class FakeContext {
  constructor({ state = 'suspended' } = {}) {
    this.state = state;
    this.currentTime = 0;
    this.sampleRate = 24000;
    this.destination = new FakeNode(this, 'destination');
    this.listener = new FakeNode(this, 'listener');
    for (const p of ['position', 'forward', 'up'])
      for (const a of ['X', 'Y', 'Z']) this.listener[p + a] = new FakeParam();
    this.created = [];
    this.sources = [];
  }
  track(node) {
    this.created.push(node);
    return node;
  }
  createGain() {
    const node = new FakeNode(this, 'gain');
    node.gain = new FakeParam(1);
    return this.track(node);
  }
  createPanner() {
    const node = new FakeNode(this, 'panner');
    node.panningModel = 'equalpower';
    node.distanceModel = 'inverse';
    node.refDistance = 1;
    node.maxDistance = 10000;
    node.rolloffFactor = 1;
    for (const a of ['X', 'Y', 'Z']) node['position' + a] = new FakeParam();
    return this.track(node);
  }
  createDynamicsCompressor() {
    const node = new FakeNode(this, 'compressor');
    for (const p of ['threshold', 'knee', 'ratio']) node[p] = new FakeParam();
    return this.track(node);
  }
  createBufferSource() {
    const node = new FakeSource(this, 'buffer');
    node.buffer = null;
    node.loop = false;
    node.playbackRate = new FakeParam(1);
    return this.track(node);
  }
  createOscillator() {
    const node = new FakeSource(this, 'oscillator');
    node.frequency = new FakeParam(440);
    return this.track(node);
  }
  createBuffer(channels, length, sampleRate) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      copyToChannel(samples) {
        this.samples = samples;
      },
    };
  }
  async decodeAudioData(data) {
    if (!data || data.byteLength === 0) throw Error('EncodingError');
    return this.createBuffer(1, data.byteLength, 1000);
  }
  async resume() {
    if (this.state !== 'closed') this.state = 'running';
  }
  async suspend() {
    if (this.state !== 'closed') this.state = 'suspended';
  }
  async close() {
    this.state = 'closed';
  }
  /** Ends every source whose stop time or natural end has passed. */
  settle() {
    for (const s of this.sources)
      if (
        !s.ended &&
        (this.currentTime >= (s.stopAt ?? Infinity) || this.currentTime >= s.naturalEnd())
      )
        s.end();
  }
  advance(seconds) {
    this.currentTime += seconds;
    this.settle();
  }
  /** Nodes of one kind that are still connected. */
  live(kind) {
    return this.created.filter((n) => n.kind === kind && !n.disconnected);
  }
}

/** Timers driven by the test: `fire()` runs one scheduler tick, `frame()` one frame. */
export function fakeTimers({ frames = true } = {}) {
  const timers = {
    tick: null,
    frameCallbacks: [],
    cleared: false,
    setInterval(callback) {
      timers.tick = callback;
      return 1;
    },
    clearInterval() {
      timers.cleared = true;
    },
    fire() {
      timers.tick?.();
    },
    frame() {
      const callbacks = timers.frameCallbacks;
      timers.frameCallbacks = [];
      for (const callback of callbacks) callback();
    },
  };
  if (frames) {
    timers.requestFrame = (callback) => {
      timers.frameCallbacks.push(callback);
      return callback;
    };
    timers.cancelFrame = (handle) => {
      timers.frameCallbacks = timers.frameCallbacks.filter((c) => c !== handle);
    };
  }
  return timers;
}

/** Lets queued microtasks (the early tick after `play`) run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
