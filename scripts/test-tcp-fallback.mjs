// TCP fallback (WebSocket) for networks that block UDP: the real WsClient
// against the real server. Commands, shared motion batches in both directions
// with a native UDP peer of the same room, pilot resume, refusals.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { PeerConnection, cleanup } from 'node-datachannel';
import { createGameServer } from '../server/index.js';
import { WsClient } from '../src/ws-client.js';
import {
  PROTOCOL,
  COMMAND_CHANNEL,
  MOTION_CHANNEL,
  ReplyAssembler,
  TCP_PATH,
} from '../src/udp-protocol.js';

globalThis.performance ??= (await import('node:perf_hooks')).performance;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, timeout = 10000) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw Error('TCP fallback timeout');
    await sleep(10);
  }
};

const app = createGameServer({ portBegin: 46000, portEnd: 46049, bindAddress: '127.0.0.1' });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const host = '127.0.0.1:' + app.server.address().port,
  url = 'ws://' + host + TCP_PATH;
const clients = [],
  natives = [];
const tcpClient = (options = {}) => {
  const motions = [],
    closes = [];
  const c = new WsClient({
    url,
    onMotion: (peer, state) => motions.push({ peer, state }),
    onClose: (e) => closes.push(e.message),
    ...options,
  });
  c.motions = motions;
  c.closes = closes;
  clients.push(c);
  return c;
};
try {
  // Two TCP players in one room: commands and motion over WebSocket only.
  const a = await tcpClient().connect(),
    b = await tcpClient().connect();
  assert.equal(a.stats().tcp, 1);
  assert.equal(a.stats().udp, 0);
  const aj = await a.request('join', { code: 'TCP', name: 'Alpha' }),
    bj = await b.request('join', { code: 'TCP', name: 'Bravo' });
  a.observe(aj.snapshot, aj.id);
  b.observe(bj.snapshot, bj.id);
  for (const c of [a, b]) c.reconcile([aj.id, bj.id]);
  const synced = await b.request('sync', { state: bj.state, mode: 'foot' });
  assert.ok(synced.rosterRevision !== undefined || synced.$patch, 'sync snapshot over TCP');
  a.send({ ...aj.state, p: [1, 2, 3] });
  await until(() => b.motions.some((m) => m.peer === aj.id));
  assert.deepEqual(b.motions.find((m) => m.peer === aj.id).state.p, [1, 2, 3]);
  assert.ok(!a.motions.some((m) => m.peer === aj.id), 'own motion is skipped');
  const health = await (await fetch('http://' + host + '/healthz')).json();
  assert.equal(health.tcpConnections, 2);
  assert.equal(health.tcpFallback, true);

  // A native UDP player of the same room: motion crosses both transports.
  const pc = new PeerConnection('udp-peer', {
    iceServers: [],
    enableIceTcp: false,
    bindAddress: '127.0.0.1',
    portRangeBegin: 46100,
    portRangeEnd: 46149,
  });
  natives.push(pc);
  const commands = pc.createDataChannel(COMMAND_CHANNEL, { unordered: false });
  const motion = pc.createDataChannel(MOTION_CHANNEL, { unordered: true, maxRetransmits: 0 });
  let udpBatches = 0;
  motion.onMessage((raw) => typeof raw !== 'string' && udpBatches++);
  await until(() => pc.gatheringState() === 'complete');
  const offer = await (
    await fetch('http://' + host + '/rtc/offer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ v: PROTOCOL, sdp: pc.localDescription().sdp }),
    })
  ).json();
  pc.setRemoteDescription(offer.sdp, 'answer');
  await until(() => commands.isOpen() && motion.isOpen());
  const assembler = new ReplyAssembler();
  let reply;
  commands.onMessage((raw) => (reply = assembler.receive(JSON.parse(String(raw))) || reply));
  commands.sendMessage(
    JSON.stringify({ v: PROTOCOL, id: 1, path: 'join', body: { code: 'TCP', name: 'Udp' } }),
  );
  await until(() => reply);
  assert.equal(reply.status, 200);
  const udpId = reply.body.id;
  for (const c of [a, b]) c.reconcile([aj.id, bj.id, udpId]);
  motion.sendMessage(
    JSON.stringify({
      v: PROTOCOL,
      seq: 1,
      incarnation: reply.body.snapshot.pilots.find((p) => p.id === udpId).incarnation,
      occupation: reply.body.snapshot.pilots.find((p) => p.id === udpId).occupation,
      mode: 'foot',
      state: { ...reply.body.state, p: [4, 5, 6] },
    }),
  );
  await until(() => a.motions.some((m) => m.peer === udpId), 5000);
  assert.deepEqual(a.motions.find((m) => m.peer === udpId).state.p, [4, 5, 6]);
  const before = udpBatches;
  b.send({ ...bj.state, p: [7, 8, 9] });
  await until(() => udpBatches > before, 5000);

  // Resume over a fresh TCP connection: same pilot, old connection closed.
  const a2 = await tcpClient().connect();
  const resumed = await a2.request('join', {
    code: 'TCP',
    name: 'Alpha',
    resume: aj.id,
    resumeKey: aj.resumeKey,
  });
  assert.equal(resumed.id, aj.id, 'same pilot resumed over TCP');
  await until(() => a.closed && a.closes.length === 1);
  assert.equal(app.game.rooms.get('TCP').pilots.size, 3);

  // Refusals: foreign origin, unknown path, fallback disabled.
  const refused = (target, headers) =>
    new Promise((resolve) => {
      const ws = new WebSocket(target, { headers });
      ws.on('open', () => resolve('open'));
      ws.on('unexpected-response', (_, res) => resolve(res.statusCode));
      ws.on('error', () => resolve('error'));
    });
  assert.equal(await refused(url, { origin: 'https://evil.example' }), 403);
  assert.equal(await refused('ws://' + host + '/other'), 404);
  const closed = createGameServer({ tcpFallback: false, portBegin: 46200, portEnd: 46209 });
  await new Promise((resolve) => closed.server.listen(0, '127.0.0.1', resolve));
  try {
    const off = 'ws://127.0.0.1:' + closed.server.address().port + TCP_PATH;
    assert.equal(await refused(off), 404);
    await assert.rejects(tcpClient({ url: off }).connect(), /TCP refusée/);
  } finally {
    await closed.close();
  }
} finally {
  for (const c of clients) c.stop();
  for (const pc of natives) pc.close();
  await app.close();
  cleanup();
}
console.log('TCP fallback: WebSocket commands and motion, mixed with a UDP peer, resume, refusals');
