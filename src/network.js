// Ephemeral motion uses a lossy unordered RTC channel; game rules stay on HTTP.
export const CHANNEL_OPTIONS = { ordered: false, maxRetransmits: 0 };
export const RTC_HZ = 20,
  MAX_MESH_PLAYERS = 12;
const finiteArray = (v, n) =>
  Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(x) && Math.abs(x) < 10000);
export function validMotion(s) {
  return (
    !!s &&
    finiteArray(s.p, 3) &&
    finiteArray(s.q, 4) &&
    Math.hypot(...s.q) > 0.5 &&
    Math.hypot(...s.q) < 1.5 &&
    finiteArray(s.v, 3) &&
    Number.isFinite(s.hp) &&
    s.hp >= 0 &&
    s.hp <= (s.type === 'helicopter' ? 200 : 100) &&
    [0, 1].includes(s.wing) &&
    [0, 1].includes(s.engine) &&
    typeof s.fire === 'boolean' &&
    (!s.ground ||
      (['base', 'soul', 'super'].includes(s.ground.scene) &&
        typeof s.ground.epoch === 'string' &&
        s.ground.body &&
        ['x', 'z', 'vx', 'vz', 'face'].every(
          (k) => Number.isFinite(s.ground.body[k]) && Math.abs(s.ground.body[k]) < 1000000,
        ))) &&
    (!s.soul ||
      (['x', 'z', 'vx', 'vz', 'face'].every((k) => Number.isFinite(s.soul[k])) &&
        Math.abs(s.soul.x) <= 10.1 &&
        s.soul.z >= 0 &&
        s.soul.z <= 200.1 &&
        Math.abs(s.soul.vx) < 40 &&
        Math.abs(s.soul.vz) < 40))
  );
}
const mix = (a, b, t) => a + (b - a) * t;
function quaternion(a, b, t) {
  let dot = a.reduce((n, v, i) => n + v * b[i], 0),
    sign = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  let x = 1 - t,
    y = t;
  if (dot < 0.9995) {
    const angle = Math.acos(dot),
      s = Math.sin(angle);
    x = Math.sin((1 - t) * angle) / s;
    y = Math.sin(t * angle) / s;
  }
  const q = a.map((v, i) => v * x + b[i] * y * sign),
    n = Math.hypot(...q);
  return q.map((v) => v / n);
}
export class MotionTrack {
  constructor({ teleportDistance = 35 } = {}) {
    this.teleportDistance = teleportDistance;
    this.samples = [];
    this.source = 'http';
    this.seq = -1;
    this.lastReceived = -Infinity;
  }
  push(state, time, seq, source) {
    if (!validMotion(state) || !Number.isFinite(time) || !Number.isFinite(seq)) return false;
    if (source === this.source && seq <= this.seq) return false;
    if (source !== this.source) {
      this.samples = [];
      this.source = source;
    }
    this.seq = seq;
    this.lastReceived = time;
    const last = this.samples.at(-1);
    if (last && time <= last.time) time = last.time + 0.01;
    if (
      last &&
      (Math.hypot(...state.p.map((v, i) => v - last.state.p[i])) > this.teleportDistance ||
        !!state.soul !== !!last.state.soul ||
        state.hp <= 0 !== last.state.hp <= 0)
    )
      this.samples = [];
    this.samples.push({ state: structuredClone(state), time });
    if (this.samples.length > 32) this.samples.shift();
    return true;
  }
  sample(now) {
    const list = this.samples;
    if (!list.length) return null;
    const target = now - (this.source === 'rtc' ? 100 : 160);
    let a = list[0],
      b = list[0];
    for (const s of list) {
      if (s.time <= target) a = s;
      if (s.time >= target) {
        b = s;
        break;
      }
      b = s;
    }
    if (target > b.time) {
      const latest = list.at(-1),
        prev = list.at(-2) || latest,
        dt = Math.min(0.15, Math.max(0, (target - latest.time) / 1000)),
        state = structuredClone(latest.state);
      state.p = state.p.map((v, i) => v + state.v[i] * dt);
      if (latest.time > prev.time)
        state.q = quaternion(
          prev.state.q,
          latest.state.q,
          1 + (dt * 1000) / (latest.time - prev.time),
        );
      if (state.ground) {
        state.ground.body.x += state.ground.body.vx * dt;
        state.ground.body.z += state.ground.body.vz * dt;
        if (Number.isFinite(state.ground.body.y))
          state.ground.body.y += (state.ground.body.vy || 0) * dt;
      }
      if (state.soul) {
        state.soul.x = Math.max(-10, Math.min(10, state.soul.x + state.soul.vx * dt));
        state.soul.z = Math.max(0, Math.min(200, state.soul.z + state.soul.vz * dt));
      }
      return state;
    }
    const t =
        b.time === a.time ? 0 : Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time))),
      s = structuredClone(a.state);
    s.p = s.p.map((v, i) => mix(v, b.state.p[i], t));
    s.q = quaternion(a.state.q, b.state.q, t);
    s.v = s.v.map((v, i) => mix(v, b.state.v[i], t));
    if (
      s.ground &&
      b.state.ground &&
      s.ground.epoch === b.state.ground.epoch &&
      s.ground.scene === b.state.ground.scene &&
      s.ground.body.id === b.state.ground.body.id
    ) {
      for (const k of ['x', 'z', 'vx', 'vz', 'y', 'vy'])
        if (Number.isFinite(s.ground.body[k]) && Number.isFinite(b.state.ground.body[k]))
          s.ground.body[k] = mix(s.ground.body[k], b.state.ground.body[k], t);
      const delta = Math.atan2(
        Math.sin(b.state.ground.body.face - s.ground.body.face),
        Math.cos(b.state.ground.body.face - s.ground.body.face),
      );
      s.ground.body.face += delta * t;
    }
    if (s.soul && b.state.soul) {
      for (const k of ['x', 'z', 'vx', 'vz']) s.soul[k] = mix(s.soul[k], b.state.soul[k], t);
      const delta = Math.atan2(
        Math.sin(b.state.soul.face - s.soul.face),
        Math.cos(b.state.soul.face - s.soul.face),
      );
      s.soul.face += delta * t;
    }
    return s;
  }
}
export class PeerMotion {
  constructor({
    self,
    signal,
    onMotion,
    Peer = globalThis.RTCPeerConnection,
    now = () => performance.now(),
  }) {
    this.self = self;
    this.signal = signal;
    this.onMotion = onMotion;
    this.Peer = Peer;
    this.now = now;
    this.peers = new Map();
    this.members = new Set();
    this.retry = new Map();
    this.seq = 0;
    this.received = 0;
    this.dropped = 0;
    this.signals = Promise.resolve();
    this.enabled = !!Peer;
    this.lastError = '';
    this.lastMeasure = -Infinity;
  }
  reconcile(ids) {
    this.members = new Set(ids.filter((id) => id !== this.self));
    if (ids.length > MAX_MESH_PLAYERS || !this.enabled) {
      for (const id of this.peers.keys()) this.close(id);
      return;
    }
    for (const id of this.peers.keys()) if (!this.members.has(id)) this.close(id);
    for (const id of this.retry.keys()) if (!this.members.has(id)) this.retry.delete(id);
    for (const id of this.members) {
      const p = this.peers.get(id);
      if (
        p &&
        (p.pc.connectionState === 'failed' ||
          (p.pc.connectionState === 'disconnected' && this.now() - p.lastReceived > 8000) ||
          (this.now() - p.created > 15000 && p.channel?.readyState !== 'open'))
      ) {
        this.close(id);
        this.retry.set(id, this.now() + 5000);
      }
      if (this.self < id && !this.peers.has(id) && this.now() >= (this.retry.get(id) || 0))
        this.offer(id);
    }
  }
  create(
    id,
    session = globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2),
  ) {
    const pc = new this.Peer({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }),
      p = {
        pc,
        created: this.now(),
        channel: null,
        seq: -1,
        lastReceived: -Infinity,
        session,
        announced: false,
        outgoing: [],
      };
    this.peers.set(id, p);
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const message = { session: p.session, candidate: e.candidate.toJSON() };
        if (p.announced) this.signal(id, message).catch(() => {});
        else p.outgoing.push(message);
      }
    };
    pc.ondatachannel = (e) => this.attach(id, p, e.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.retry.set(id, this.now() + 5000);
    };
    return p;
  }
  attach(id, p, channel) {
    if (channel.label !== 'motion-v1') {
      channel.close();
      return;
    }
    p.channel = channel;
    channel.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string' || e.data.length > 2048) return;
        const m = JSON.parse(e.data);
        if (
          m.v !== 1 ||
          !Number.isSafeInteger(m.seq) ||
          m.seq < 0 ||
          m.seq <= p.seq ||
          !validMotion(m.state)
        ) {
          this.dropped++;
          return;
        }
        p.seq = m.seq;
        p.lastReceived = this.now();
        this.received++;
        this.onMotion(id, m.state, p.lastReceived, m.seq);
      } catch {
        this.dropped++;
      }
    };
  }
  async announce(id, p) {
    await this.signal(id, {
      session: p.session,
      description: { type: p.pc.localDescription.type, sdp: p.pc.localDescription.sdp },
    });
    p.announced = true;
    for (const message of p.outgoing) await this.signal(id, message);
    p.outgoing = [];
  }
  async offer(id) {
    let p;
    try {
      p = this.create(id);
      this.attach(id, p, p.pc.createDataChannel('motion-v1', CHANNEL_OPTIONS));
      await p.pc.setLocalDescription(await p.pc.createOffer());
      await this.announce(id, p);
    } catch (e) {
      this.lastError = e.name || 'RTC';
      if (this.peers.get(id) === p) this.close(id);
      this.retry.set(id, this.now() + 5000);
    }
  }
  receive(messages) {
    this.signals = this.signals
      .then(async () => {
        for (const m of messages) {
          if (!this.members.has(m.sender) || !this.enabled || this.members.size >= MAX_MESH_PLAYERS)
            continue;
          try {
            let p = this.peers.get(m.sender);
            const data = m.payload;
            if (data.description?.type === 'offer') {
              if (this.self < m.sender) continue;
              if (p) this.close(m.sender);
              p = this.create(m.sender, data.session);
              await p.pc.setRemoteDescription(data.description);
              await p.pc.setLocalDescription(await p.pc.createAnswer());
              await this.announce(m.sender, p);
            } else if (p?.session !== data.session) continue;
            else if (data.description?.type === 'answer') {
              if (p?.pc.signalingState === 'have-local-offer')
                await p.pc.setRemoteDescription(data.description);
            } else if (data.candidate && p) {
              if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate);
              else (p.candidates ??= []).push(data.candidate);
            }
            if (p?.pc.remoteDescription && p.candidates?.length) {
              for (const c of p.candidates) await p.pc.addIceCandidate(c);
              p.candidates = [];
            }
          } catch (e) {
            this.lastError = e.name || 'RTC';
            this.close(m.sender);
            this.retry.set(m.sender, this.now() + 5000);
          }
        }
      })
      .catch(() => {});
    return this.signals;
  }
  send(state) {
    const data = JSON.stringify({ v: 1, seq: ++this.seq, state });
    for (const p of this.peers.values()) {
      if (p.channel?.readyState === 'open' && p.channel.bufferedAmount < 4096)
        try {
          p.channel.send(data);
        } catch {}
    }
  }
  fresh(id) {
    return this.now() - (this.peers.get(id)?.lastReceived ?? -Infinity) < 750;
  }
  async measure() {
    if (this.now() - this.lastMeasure < 2000) return;
    this.lastMeasure = this.now();
    for (const p of this.peers.values()) {
      if (p.channel?.readyState !== 'open') continue;
      try {
        const report = await p.pc.getStats();
        let pair;
        report.forEach((s) => {
          if (s.type === 'transport' && s.selectedCandidatePairId)
            pair = report.get(s.selectedCandidatePairId);
        });
        if (!pair)
          report.forEach((s) => {
            if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) pair = s;
          });
        const candidate = pair && report.get(pair.localCandidateId);
        p.protocol = candidate?.protocol || '';
        p.rtt = pair?.currentRoundTripTime;
      } catch {}
    }
  }
  stats() {
    let active = 0;
    for (const id of this.peers.keys()) if (this.fresh(id)) active++;
    return {
      active,
      total: this.members.size,
      received: this.received,
      dropped: this.dropped,
      udp: [...this.peers.values()].filter((p) => p.protocol === 'udp').length,
      error: this.lastError,
      enabled: this.enabled,
    };
  }
  close(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    p.channel?.close();
    p.pc.close();
  }
  stop() {
    for (const id of this.peers.keys()) this.close(id);
  }
}
