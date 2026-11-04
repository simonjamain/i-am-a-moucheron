import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { PeerConnection, cleanup } from 'node-datachannel';
import { createGameServer } from '../server/index.js';
import { ReplyAssembler, PROTOCOL, COMMAND_CHANNEL, MOTION_CHANNEL } from '../src/udp-protocol.js';

const peers = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, timeout = 15000) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw Error('50-peer UDP timeout');
    await sleep(15);
  }
};
const app = createGameServer({
  portBegin: 44000,
  portEnd: 44399,
  bindAddress: '127.0.0.1',
  offerTimeout: 12000,
  maxConnections: 64,
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.server.address().port;
let heartbeat,
  acceptedRelays = 0;
function sendMotion(peer) {
  if (!peer.ready || !peer.motion.isOpen()) return;
  peer.motion.sendMessage(
    JSON.stringify({
      v: PROTOCOL,
      seq: ++peer.motionSeq,
      incarnation: 0,
      occupation: 0,
      mode: 'foot',
      state: peer.state,
    }),
  );
}
async function joinPeer(index) {
  const pc = new PeerConnection('load-' + index, {
    iceServers: [],
    enableIceTcp: false,
    bindAddress: '127.0.0.1',
    portRangeBegin: 44400,
    portRangeEnd: 44799,
  });
  const slot = peers.length;
  peers.push({ pc, ready: false });
  const commands = pc.createDataChannel(COMMAND_CHANNEL, { unordered: false });
  const motion = pc.createDataChannel(MOTION_CHANNEL, { unordered: true, maxRetransmits: 0 });
  const assembler = new ReplyAssembler(),
    replies = new Map();
  let received = 0;
  commands.onMessage((raw) => {
    const packet = JSON.parse(String(raw));
    const reply = assembler.receive(packet);
    if (reply) replies.set(packet.id, reply);
  });
  motion.onMessage(() => received++);
  await until(() => pc.gatheringState() === 'complete');
  const response = await fetch(base + '/rtc/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ v: PROTOCOL, sdp: pc.localDescription().sdp }),
  });
  const offer = await response.json();
  assert.equal(response.status, 200, 'native UDP admission: ' + JSON.stringify(offer));
  pc.setRemoteDescription(offer.sdp, 'answer');
  await until(() => commands.isOpen() && motion.isOpen());
  assert.equal(pc.getSelectedCandidatePair().local.transportType.toLowerCase(), 'udp');
  commands.sendMessage(
    JSON.stringify({
      v: PROTOCOL,
      id: 1,
      path: 'join',
      body: { code: 'CAPACITY50', name: 'Peer ' + index },
    }),
  );
  await until(() => replies.has(1));
  const result = replies.get(1);
  assert.equal(result.status, 200, 'native join: ' + JSON.stringify(result.body));
  const peer = {
    pc,
    commands,
    motion,
    state: result.body.state,
    motionSeq: 0,
    ready: true,
    get received() {
      return received;
    },
  };
  peers[slot] = peer;
  return peer;
}
try {
  const started = performance.now();
  heartbeat = setInterval(() => {
    for (const peer of peers) sendMotion(peer);
  }, 1000);
  heartbeat.unref();
  for (let index = 0; index < 50; index += 5)
    await Promise.all(Array.from({ length: 5 }, (_, offset) => joinPeer(index + offset)));
  const connectedMs = performance.now() - started;
  assert.equal(app.connections.size, 50);
  assert.equal(app.game.rooms.get('CAPACITY50').pilots.size, 50);
  assert.ok(peers.every((p) => p.ready && p.motion.isOpen() && p.commands.isOpen()));
  clearInterval(heartbeat);
  heartbeat = null;
  // Measure actual accepted relays without assuming every lossy packet survives
  // congested receiver buffers. Do not intercept or modify state validation.
  for (const connection of app.connections) {
    const original = connection.session.relay;
    connection.session.relay = (player, data) => {
      acceptedRelays++;
      original(player, data);
    };
  }
  const beforePackets = peers.reduce((n, p) => n + p.received, 0);
  const startMotion = performance.now();
  for (let tick = 0; tick < 4; tick++) {
    for (const peer of peers) sendMotion(peer);
    await sleep(55);
  }
  await until(() => acceptedRelays >= 95, 10000);
  const receivedPackets = peers.reduce((n, p) => n + p.received, 0) - beforePackets;
  const activeReceivers = peers.filter((p) => p.received > 0).length;
  assert.equal(app.connections.size, 50, 'all native RTC sessions remain established');
  assert.ok(receivedPackets > 0, 'at least one real UDP relay must reach a remote peer');
  console.log(
    JSON.stringify({
      peers: 50,
      transport: 'native WebRTC UDP on 127.0.0.1',
      connectedMs: +connectedMs.toFixed(1),
      relaysAccepted: acceptedRelays,
      receivedMotionPackets: receivedPackets,
      peersWithRemoteMotion: activeReceivers,
      motionTestMs: +(performance.now() - startMotion).toFixed(1),
      rssMiB: +(process.memoryUsage().rss / (1024 * 1024)).toFixed(1),
      scope: 'loopback native peers only; no browsers/GPU/WAN',
    }),
  );
} finally {
  if (heartbeat) clearInterval(heartbeat);
  for (const peer of peers) peer.pc.close();
  await app.close();
  cleanup();
}
