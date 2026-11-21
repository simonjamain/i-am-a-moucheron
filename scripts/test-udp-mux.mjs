// Single-port mode (UDP_MUX_PORT): every WebRTC connection of the server shares
// one UDP port, so that a restrictive network only needs that port open. Also
// checks the advertised port rewrite used when Docker remaps the port.
import assert from 'node:assert/strict';
import { PeerConnection, cleanup } from 'node-datachannel';
import { createGameServer } from '../server/index.js';
import { PROTOCOL, COMMAND_CHANNEL, MOTION_CHANNEL, ReplyAssembler } from '../src/udp-protocol.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, timeout = 10000) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw Error('UDP mux timeout');
    await sleep(10);
  }
};
const peers = [];
async function offer(base, index) {
  const pc = new PeerConnection('mux-' + index, {
    iceServers: [],
    enableIceTcp: false,
    bindAddress: '127.0.0.1',
    portRangeBegin: 45100,
    portRangeEnd: 45199,
  });
  peers.push(pc);
  const commands = pc.createDataChannel(COMMAND_CHANNEL, { unordered: false });
  const motion = pc.createDataChannel(MOTION_CHANNEL, { unordered: true, maxRetransmits: 0 });
  await until(() => pc.gatheringState() === 'complete');
  const response = await fetch(base + '/rtc/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ v: PROTOCOL, sdp: pc.localDescription().sdp }),
  });
  const answer = await response.json();
  assert.equal(response.status, 200, JSON.stringify(answer));
  return { pc, commands, motion, sdp: answer.sdp };
}
const ports = (sdp) =>
  [...sdp.matchAll(/^a=candidate:\S+\s+\d+\s+UDP\s+\d+\s+\S+\s+(\d+)/gim)].map((m) => +m[1]);

const app = createGameServer({ muxPort: 45000, bindAddress: '127.0.0.1' });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
try {
  const base = 'http://127.0.0.1:' + app.server.address().port;
  for (let index = 0; index < 3; index++) {
    const peer = await offer(base, index);
    assert.deepEqual(ports(peer.sdp), [45000], 'answer announces only the shared port');
    peer.pc.setRemoteDescription(peer.sdp, 'answer');
    await until(() => peer.commands.isOpen() && peer.motion.isOpen());
    assert.equal(peer.pc.getSelectedCandidatePair().remote.port, 45000);
    const assembler = new ReplyAssembler();
    let reply;
    peer.commands.onMessage((raw) => (reply = assembler.receive(JSON.parse(String(raw))) || reply));
    peer.commands.sendMessage(
      JSON.stringify({
        v: PROTOCOL,
        id: 1,
        path: 'join',
        body: { code: 'MUX', name: 'P' + index },
      }),
    );
    await until(() => reply);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
  }
  assert.equal(app.connections.size, 3);
  assert.equal(app.game.rooms.get('MUX').pilots.size, 3, 'three pilots through one UDP port');
} finally {
  for (const pc of peers.splice(0)) pc.close();
  await app.close();
}

// Docker remap (-p 3478:45000/udp): the browser must be told the public port.
const remapped = createGameServer({
  muxPort: 45000,
  advertisePort: 3478,
  advertiseAddress: '203.0.113.10',
  bindAddress: '127.0.0.1',
});
await new Promise((resolve) => remapped.server.listen(0, '127.0.0.1', resolve));
try {
  const { sdp } = await offer('http://127.0.0.1:' + remapped.server.address().port, 9);
  assert.deepEqual(ports(sdp), [3478]);
  assert.match(sdp, /^a=candidate:\S+\s+\d+\s+UDP\s+\d+\s+203\.0\.113\.10\s+3478\s+typ host/im);
} finally {
  for (const pc of peers.splice(0)) pc.close();
  await remapped.close();
  cleanup();
}
assert.throws(() => createGameServer({ muxPort: 70000 }), /UDP_MUX_PORT/);
console.log('UDP mux: 3 connections on one port, advertised port rewritten');
