import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import {
  MotionTrack,
  validMotion,
  PeerMotion,
  CHANNEL_OPTIONS,
  MAX_MESH_PLAYERS,
} from '../src/network.js';
import { localDB } from './local-db.mjs';
import worker from '../worker/index.js';
const motion = (x = 0) => ({
  p: [x, 16, 0],
  q: [0, 0, 0, 1],
  v: [10, 0, 0],
  hp: 100,
  wing: 1,
  engine: 1,
  fire: false,
  soul: null,
});
assert.equal(validMotion(motion()), true);
assert.equal(validMotion({ ...motion(), q: [0, 0, 0, 0] }), false);
assert.equal(validMotion({ ...motion(), p: [NaN, 0, 0] }), false);
const t = new MotionTrack();
t.push(motion(0), 0, 1, 'rtc');
t.push(motion(1), 100, 2, 'rtc');
assert.equal(t.sample(150).p[0], 0.5);
assert.equal(t.push(motion(99), 200, 1, 'rtc'), false);
assert.equal(t.sample(1000).p[0], 2.5, 'prediction stops after 150 ms');
t.push(motion(50), 200, 3, 'rtc');
assert.equal(t.samples.length, 1, 'teleport does not sweep through the room');
t.push(motion(2), 300, 1000, 'http');
assert.equal(t.source, 'http');
assert.equal(t.samples.length, 1, 'fallback resets the motion timeline');
const rotation = new MotionTrack();
rotation.push(motion(), 0, 1, 'rtc');
rotation.push({ ...motion(1), q: [0, 1, 0, 0] }, 100, 2, 'rtc');
assert.ok(Math.abs(rotation.sample(150).q[1] - Math.SQRT1_2) < 0.0001);
const soul = new MotionTrack();
soul.push({ ...motion(), soul: { x: 0, z: 4, vx: 1, vz: 0, face: Math.PI - 0.1 } }, 0, 1, 'rtc');
soul.push({ ...motion(), soul: { x: 1, z: 4, vx: 1, vz: 0, face: -Math.PI + 0.1 } }, 100, 2, 'rtc');
assert.ok(Math.abs(soul.sample(150).soul.face - Math.PI) < 0.0001);

// Sparse 4 Hz positions rendered at 60 Hz: compare visible step size after warm-up.
const sparse = new MotionTrack();
let last = 0,
  held = 0,
  lastHeld = 0,
  maxStep = 0,
  maxHeldStep = 0;
for (let frame = 0; frame <= 120; frame++) {
  const ms = (frame * 1000) / 60;
  if (frame % 15 === 0) {
    held = ms / 100;
    sparse.push(motion(held), ms, frame + 1, 'http');
  }
  const displayed = sparse.sample(ms).p[0];
  if (frame > 30) {
    maxStep = Math.max(maxStep, Math.abs(displayed - last));
    maxHeldStep = Math.max(maxHeldStep, Math.abs(held - lastHeld));
  }
  last = displayed;
  lastHeld = held;
}
assert.ok(maxStep < 0.18 && maxHeldStep > 2.4, 'interpolation removes 250 ms position jumps');
console.log(
  `Motion simulation: max frame step ${maxHeldStep.toFixed(2)} → ${maxStep.toFixed(2)} units (10 units/s, 4 Hz samples, 60 Hz render; not an internet latency benchmark).`,
);

// Fake only the native transport boundary: exercise negotiation, packet ordering, pressure and fallback.
class FakePeer {
  static all = [];
  constructor() {
    FakePeer.all.push(this);
    this.connectionState = 'new';
    this.signalingState = 'stable';
  }
  createDataChannel(label, options) {
    this.options = options;
    return (this.channel = {
      label,
      readyState: 'open',
      bufferedAmount: 0,
      sent: [],
      send(v) {
        this.sent.push(v);
      },
      close() {
        this.readyState = 'closed';
      },
    });
  }
  async createOffer() {
    return { type: 'offer', sdp: 'offer' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer' };
  }
  async setLocalDescription(d) {
    this.localDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    this.signalingState = d.type === 'answer' ? 'stable' : 'have-remote-offer';
  }
  async addIceCandidate(c) {
    this.candidate = c;
  }
  close() {
    this.connectionState = 'closed';
  }
}
let now = 100,
  got = 0;
const signals = [];
const peer = new PeerMotion({
  self: 'a',
  Peer: FakePeer,
  now: () => now,
  signal: async (to, message) => signals.push({ to, message }),
  onMotion: () => got++,
});
peer.reconcile(['a', 'b']);
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(FakePeer.all[0].options, CHANNEL_OPTIONS);
const p = peer.peers.get('b');
peer.send(motion());
assert.equal(p.channel.sent.length, 1);
p.channel.bufferedAmount = 5000;
peer.send(motion());
assert.equal(p.channel.sent.length, 1, 'stale packets are skipped under backpressure');
const deliver = (seq, state = motion()) =>
  p.channel.onmessage({ data: JSON.stringify({ v: 1, seq, state }) });
deliver(3);
deliver(2);
deliver(3);
deliver(4, { ...motion(), p: [null, 0, 0] });
assert.equal(got, 1);
assert.equal(peer.fresh('b'), true);
now += 751;
assert.equal(peer.fresh('b'), false, 'HTTP can resume after a stalled channel');
peer.reconcile(Array.from({ length: MAX_MESH_PLAYERS + 1 }, (_, i) => String(i)));
assert.equal(peer.peers.size, 0, 'large rooms do not form an unbounded mesh');
// Full deterministic offer/answer, queued ICE and stale-negotiation isolation.
const mailboxA = [],
  mailboxB = [];
const aPeer = new PeerMotion({
  self: 'aa',
  Peer: FakePeer,
  signal: async (to, payload) => mailboxB.push({ sender: 'aa', payload }),
  onMotion: () => {},
});
const bPeer = new PeerMotion({
  self: 'bb',
  Peer: FakePeer,
  signal: async (to, payload) => mailboxA.push({ sender: 'bb', payload }),
  onMotion: () => {},
});
aPeer.reconcile(['aa', 'bb']);
bPeer.reconcile(['aa', 'bb']);
for (let i = 0; i < 8; i++) await Promise.resolve();
assert.equal(mailboxB[0].payload.description.type, 'offer');
await bPeer.receive(mailboxB);
assert.equal(mailboxA[0].payload.description.type, 'answer');
await aPeer.receive([
  {
    sender: 'bb',
    payload: { session: aPeer.peers.get('bb').session, candidate: { candidate: 'test' } },
  },
]);
assert.equal(aPeer.peers.get('bb').candidates.length, 1);
await aPeer.receive(mailboxA);
assert.equal(aPeer.peers.get('bb').pc.remoteDescription.type, 'answer');
assert.equal(aPeer.peers.get('bb').pc.candidate.candidate, 'test');
await aPeer.receive([
  { sender: 'bb', payload: { session: 'obsolete', candidate: { candidate: 'old' } } },
]);
assert.equal(aPeer.peers.get('bb').pc.candidate.candidate, 'test');
aPeer.stop();
bPeer.stop();
const unsupported = new PeerMotion({
  self: 'a',
  Peer: null,
  signal: async () => {},
  onMotion: () => {},
});
unsupported.reconcile(['a', 'b']);
assert.equal(unsupported.peers.size, 0);
// Real endpoint and SQL tests: mailbox isolation, replay cursor, size/recipient validation.
const DB = localDB();
async function api(path, body) {
  const r = await worker.fetch(
    new Request('https://test.local/api/' + path, { method: 'POST', body: JSON.stringify(body) }),
    { DB },
  );
  return { status: r.status, body: await r.json() };
}
const a = (await api('join', { code: 'RTCQA', name: 'A' })).body,
  b = (await api('join', { code: 'RTCQA', name: 'B' })).body,
  c = (await api('join', { code: 'OTHER', name: 'C' })).body;
const message = { session: 'negotiation-1', description: { type: 'offer', sdp: 'v=0' } };
assert.equal((await api('signal', { id: a.id, to: b.id, message })).status, 200);
let inbox = (await api('sync', { id: b.id, state: b.state, signalSince: 0 })).body;
assert.equal(inbox.signals.length, 1);
assert.equal(inbox.signals[0].sender, a.id);
assert.deepEqual(inbox.signals[0].payload, message);
assert.equal(
  (await api('sync', { id: a.id, state: a.state, signalSince: 0 })).body.signals.length,
  0,
);
assert.equal(
  (await api('sync', { id: c.id, state: c.state, signalSince: 0 })).body.signals.length,
  0,
);
assert.equal(
  (await api('sync', { id: b.id, state: b.state, signalSince: inbox.signals[0].id })).body.signals
    .length,
  0,
);
assert.equal((await api('signal', { id: a.id, to: c.id, message })).status, 400);
assert.equal((await api('signal', { id: a.id, to: a.id, message })).status, 400);
assert.equal(
  (
    await api('signal', {
      id: a.id,
      to: b.id,
      message: { session: '1', description: { type: 'offer', sdp: 'x'.repeat(15000) } },
    })
  ).status,
  400,
);
const realNow = Date.now;
Date.now = () => realNow() + 61000;
assert.equal(
  (await api('sync', { id: b.id, state: b.state, signalSince: 0 })).body.signals.length,
  0,
);
Date.now = realNow;
const response = await worker.fetch(new Request('https://test.local/network.js'), {});
assert.equal(response.status, 200);
assert.match(await response.text(), /maxRetransmits:\s*0/);
console.log(
  'PASS: jitter interpolation, quaternion rotation, bounded prediction, teleports, soul motion, unordered/zero-retry RTC, duplicate/stale rejection, backpressure, fallback, mesh cap, signaling isolation, cursor and TTL.',
);
const groundTrack = new MotionTrack(),
  groundState = (x) => ({
    ...motion(),
    ground: { scene: 'base', epoch: 'ground-e', body: { id: 1, x, z: 4, vx: 2, vz: 0, face: 0 } },
  });
assert.equal(validMotion(groundState(1)), true);
assert.equal(
  validMotion({
    ...groundState(1),
    ground: { scene: 'base', epoch: 'ground-e', body: { x: NaN } },
  }),
  false,
);
groundTrack.push(groundState(0), 0, 1, 'rtc');
groundTrack.push(groundState(2), 100, 2, 'rtc');
assert.equal(groundTrack.sample(150).ground.body.x, 1);
assert.equal(groundTrack.sample(1000).ground.body.x, 2.3);
console.log('PASS: ground body validation, interpolation and bounded RTC extrapolation');
