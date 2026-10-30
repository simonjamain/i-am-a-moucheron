import { supportedPlacement } from '../src/equipment.js';
import { OFFICE_SOLIDS } from '../worker/assets.js';
import { ACTOR_UNIT, MAP } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import assert from 'node:assert/strict';
import { PeerConnection, cleanup } from 'node-datachannel';
import { createGameServer } from '../server/index.js';
import { ReplyAssembler, PROTOCOL, COMMAND_CHANNEL, MOTION_CHANNEL } from '../src/udp-protocol.js';

const app = createGameServer({
  portBegin: 42000,
  portEnd: 42099,
  bindAddress: '127.0.0.1',
  offerTimeout: 5000,
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + app.server.address().port;
const clients = [];
const until = async (test, ms = 5000) => {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > ms) throw Error('RTC test timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};
async function client() {
  const pc = new PeerConnection('test', {
    iceServers: [],
    enableIceTcp: false,
    bindAddress: '127.0.0.1',
    portRangeBegin: 42100,
    portRangeEnd: 42199,
  });
  const commands = pc.createDataChannel(COMMAND_CHANNEL, { unordered: false });
  const motion = pc.createDataChannel(MOTION_CHANNEL, { unordered: true, maxRetransmits: 0 });
  const assembler = new ReplyAssembler(),
    replies = new Map(),
    packets = [];
  commands.onMessage((raw) => {
    const p = JSON.parse(String(raw)),
      v = assembler.receive(p);
    if (v) replies.set(p.id, v);
  });
  motion.onMessage((raw) => packets.push(JSON.parse(String(raw))));
  clients.push(pc);
  await until(() => pc.gatheringState() === 'complete');
  const response = await fetch(base + '/rtc/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ v: PROTOCOL, sdp: pc.localDescription().sdp }),
  });
  const answer = await response.json();
  assert.equal(response.status, 200, JSON.stringify(answer));
  pc.setRemoteDescription(answer.sdp, 'answer');
  await until(() => commands.isOpen() && motion.isOpen());
  assert.equal(pc.getSelectedCandidatePair().local.transportType.toLowerCase(), 'udp');
  let seq = 0;
  const request = async (path, body = {}, commandId = ++seq) => {
    replies.delete(commandId);
    commands.sendMessage(JSON.stringify({ v: PROTOCOL, id: commandId, path, body }));
    await until(() => replies.has(commandId));
    return { id: commandId, ...replies.get(commandId) };
  };
  return { pc, commands, motion, replies, packets, request };
}
try {
  const health = await (await fetch(base + '/healthz')).json();
  assert.equal(health.storage, 'ram');
  assert.equal((await fetch(base + '/api/join', { method: 'POST' })).status, 410);
  assert.match(await (await fetch(base)).text(), /MOUCHERON_UDP=true/);
  const a = await client(),
    b = await client();
  const aj = await a.request('join', { code: 'NATIVE', name: 'Alpha' }),
    bj = await b.request('join', { code: 'NATIVE', name: 'Bravo' });
  assert.equal(aj.status, 200);
  assert.equal(bj.status, 200);
  assert.equal(app.game.rooms.get('NATIVE').pilots.size, 2);
  const started = await a.request('start');
  assert.equal(started.body.mission_started, 1);
  // Replaying the same command ID returns its original result, without another player.
  const duplicate = await a.request('join', { code: 'NATIVE', name: 'Spoof' }, aj.id);
  assert.equal(duplicate.body.id, aj.body.id);
  const fan = await a.request('fan', { id: bj.body.id });
  assert.equal(fan.body.fan, 1);
  await a.request('fan', {}, fan.id);
  assert.equal(app.game.rooms.get('NATIVE').fan, 1);
  const state = aj.body.state;
  a.motion.sendMessage(
    JSON.stringify({ v: PROTOCOL, seq: 2, incarnation: 0, occupation: 0, mode: 'foot', state }),
  );
  await until(() => b.packets.length > 0);
  assert.equal(b.packets[0].peer, aj.body.id);
  a.motion.sendMessage(
    JSON.stringify({ v: PROTOCOL, seq: 1, incarnation: 0, occupation: 0, mode: 'foot', state }),
  );
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.packets.length, 1, 'stale motion discarded');
  const dead = await a.request('death', { incarnation: 0 });
  assert.equal(dead.body.pilots.find((p) => p.id === aj.body.id).life, 'dead');
  assert.equal(dead.body.pilots.find((p) => p.id === aj.body.id).state.awaitingPurgatory, true);
  assert.ok(!dead.body.souls.some((s) => s.entity === aj.body.id));
  assert.equal((await a.request('fan')).status, 409);
  const entry = await a.request('enter-purgatory', { incarnation: 1 });
  assert.equal(entry.status, 200);
  const repeatEntry = await a.request('enter-purgatory', { incarnation: 1 });
  assert.equal(repeatEntry.body.souls.filter((s) => s.entity === aj.body.id).length, 1);
  const snap = await b.request('sync', { mode: 'foot', state });
  assert.equal(snap.body.pilots.find((p) => p.id === aj.body.id).life, 'dead');
  const gameRoom = app.game.rooms.get('NATIVE'),
    bomber = [...gameRoom.vehicles.values()].find((v) => v.type === 'bomber');
  app.game.assign(gameRoom, gameRoom.pilots.get(bj.body.id), bomber, 'pilot', null);
  bomber.state.landed = false;
  const bomb = await b.request('heavy-fire', {
    weapon: 'bomb',
    shot: 'native-bomb',
    direction: [0, 0, -1],
  });
  assert.equal(bomb.status, 200);
  assert.equal(bomb.body.vehicles.find((v) => v.id === bomber.id).supplies.ammo.bomb, 49);
  assert.ok(bomb.body.ordnance.some((p) => p.shot === 'native-bomb'));
  const person = gameRoom.pilots.get(bj.body.id);
  app.game.release(gameRoom, person);
  person.mode = 'foot';
  gameRoom.dollars = 50;
  const sign = await b.request('purchase-sign', {
    item: 'radar',
    request: 'native-radar-order',
    expectedPrice: 4,
    signature: true,
    epoch: gameRoom.base.epoch,
    incarnation: person.incarnation,
  });
  assert.equal(sign.status, 200);
  assert.equal(sign.body.dollars, 46);
  const observedOrder = await a.request('sync', { mode: 'foot', state });
  assert.ok(observedOrder.body.purchases.some((o) => o.owner === person.id && o.item === 'radar'));
  const purchased = await b.request('purchase-sign', {
    item: 'spitfire',
    request: 'native-spit-order',
    expectedPrice: 24,
    signature: true,
    epoch: gameRoom.base.epoch,
    incarnation: person.incarnation,
  });
  assert.equal(purchased.status, 200);
  const position = supportedPlacement({ x: 1.5, y: 0, z: 2.8 }, OFFICE_SOLIDS, [], 'spitfire');
  assert.ok(position);
  Object.assign(app.game.base(gameRoom, person), {
    x: (position.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - position.z) / ACTOR_UNIT,
    y: position.y,
    grounded: true,
  });
  const placed = await b.request('place-purchase', {
    token: 'native-spit-order',
    position,
    epoch: gameRoom.base.epoch,
    incarnation: person.incarnation,
  });
  assert.equal(placed.status, 200);
  const spit = [...gameRoom.vehicles.values()].find((v) => v.type === 'spitfire');
  spit.state.p = [1.5, 2, -0.5];
  spit.state.landed = false;
  spit.dirt = 0.001;
  Object.assign(app.game.base(gameRoom, person), {
    x: (1.5 - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: OFFICE_LAYOUT.base.originZ / ACTOR_UNIT,
    y: 2 - MAP.metres(0.9),
    grounded: true,
  });
  const washBody = {
    direction: [0, 0, -1],
    epoch: gameRoom.base.epoch,
    incarnation: person.incarnation,
  };
  assert.equal((await b.request('wash', washBody)).status, 200);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal((await b.request('wash', washBody)).status, 200);
  const washed = await a.request('sync', { mode: 'foot', state });
  assert.equal(washed.body.vehicles.find((v) => v.id === spit.id).dirt, 0);
  assert.equal(
    washed.body.effects.filter((e) => e.kind === 'clean' && e.vehicle === spit.id).length,
    1,
  );
  assert.equal(
    (
      await b.request('pistol-trace', {
        shot: 'native-pistol',
        origin: [1.5, 2, 0],
        direction: [0, 0, -1],
        incarnation: person.incarnation,
      })
    ).status,
    200,
  );
  assert.ok(
    (await a.request('sync', { mode: 'foot', state })).body.effects.some(
      (e) => e.kind === 'pistol-trace' && e.shooter === person.id,
    ),
  );
  console.log(
    'Native RTC: two clients, UDP confirmed, reliable commands/replay, lossy relay, prepaid purchase, Spitfire, shared wash/sparkles/pistol trace, HTTP gameplay refused.',
  );
  // A closed negotiation must settle its HTTP request and release its slot.
  class NeverGathers {
    onDataChannel() {}
    onStateChange() {}
    onGatheringStateChange() {}
    setRemoteDescription() {}
    close() {}
  }
  const failing = createGameServer({ Peer: NeverGathers, offerTimeout: 10 });
  await new Promise((r) => failing.server.listen(0, '127.0.0.1', r));
  try {
    for (let i = 0; i < 18; i++) {
      const result = await fetch(
        'http://127.0.0.1:' + failing.server.address().port + '/rtc/offer',
        {
          method: 'POST',
          body: JSON.stringify({ v: 1, sdp: 'm=application' }),
          signal: AbortSignal.timeout(1000),
        },
      );
      assert.equal(result.status, 400, 'failed negotiation releases admission capacity');
    }
    assert.equal(failing.connections.size, 0);
  } finally {
    await failing.close();
  }
} finally {
  for (const pc of clients) pc.close();
  await app.close();
  cleanup();
}
