import assert from 'node:assert/strict';
import { UdpClient } from '../src/udp-client.js';
import {
  encodeReply,
  ReplyAssembler,
  udpDescription,
  udpCandidate,
  CHUNK_BYTES,
} from '../src/udp-protocol.js';

let fetches = 0,
  protocol = 'udp';
class Peer extends EventTarget {
  constructor(config) {
    super();
    this.config = config;
    this.channels = [];
    this.iceGatheringState = 'complete';
    this.connectionState = 'new';
  }
  createDataChannel(label, options) {
    const c = {
      label,
      options,
      readyState: 'connecting',
      bufferedAmount: 0,
      sent: [],
      send(data) {
        this.sent.push(data);
      },
      close() {
        this.readyState = 'closed';
      },
    };
    this.channels.push(c);
    return c;
  }
  async createOffer() {
    return {
      type: 'offer',
      sdp: 'v=0\r\na=candidate:1 1 UDP 1 127.0.0.1 4000 typ host\r\na=candidate:2 1 TCP 1 127.0.0.1 5000 typ host\r\n',
    };
  }
  async setLocalDescription(d) {
    this.localDescription = d;
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    for (const c of this.channels) c.readyState = 'open';
  }
  async getStats() {
    return new Map([
      ['l', { type: 'local-candidate', protocol }],
      ['r', { type: 'remote-candidate', protocol }],
      [
        'p',
        {
          type: 'candidate-pair',
          localCandidateId: 'l',
          remoteCandidateId: 'r',
          state: 'succeeded',
          nominated: true,
        },
      ],
    ]);
  }
  close() {
    this.connectionState = 'closed';
  }
}
const fetcher = async (url, opts) => {
  fetches++;
  assert.equal(url, '/rtc/offer');
  assert.doesNotMatch(JSON.parse(opts.body).sdp, /candidate:2/);
  return { ok: true, json: async () => ({ sdp: 'answer' }) };
};
const errors = [],
  client = new UdpClient({ Peer, fetcher, onClose: (e) => errors.push(e) });
await client.connect();
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = function (...args) {
    assert.equal(this, globalThis, 'browser fetch retains Window receiver');
    return fetcher(...args);
  };
  const defaults = new UdpClient({ Peer });
  await defaults.connect();
  defaults.stop();
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(client.protocol, 'udp');
assert.deepEqual(client.pc.channels[0].options, { ordered: true });
assert.deepEqual(client.pc.channels[1].options, { ordered: false, maxRetransmits: 0 });
const request = client.request('buy', { item: 'engine', request: 'id-000001' });
const m = JSON.parse(client.commands.sent.at(-1));
assert.equal(m.path, 'buy');
for (const chunk of encodeReply(
  { status: 200, body: { text: 'x'.repeat(CHUNK_BYTES * 3) } },
  m.id,
).reverse())
  client.commands.onmessage({ data: chunk });
assert.equal((await request).text.length, CHUNK_BYTES * 3);
const rejected = client.request('sign', { form: 2 }),
  last = JSON.parse(client.commands.sent.at(-1));
for (const chunk of encodeReply({ status: 409, body: { error: 'ordre' } }, last.id))
  client.commands.onmessage({ data: chunk });
await assert.rejects(rejected, (e) => e.status === 409 && e.message === 'ordre');
assert.equal(fetches, 2, 'gameplay never uses fetch');
const state = {
  p: [0, 0, 0],
  q: [0, 0, 0, 1],
  v: [0, 0, 0],
  hp: 100,
  wing: 1,
  engine: 1,
  fire: false,
};
client.send(state);
assert.equal(client.motion.sent.length, 1);
client.motion.bufferedAmount = 5000;
client.send(state);
assert.equal(client.motion.sent.length, 1, 'drop congested movement');
const pending = client.request('start', {});
client.fail(Error('UDP lost'));
await assert.rejects(pending, /UDP lost/);
assert.equal(client.pending.size, 0);
assert.equal(client.assembler.messages.size, 0);
assert.equal(errors.length, 1);
await assert.rejects(client.request('sync', {}), /indisponible/);
assert.equal(fetches, 2, 'no HTTP fallback after failure');
protocol = 'tcp';
const incompatible = new UdpClient({ Peer, fetcher });
await assert.rejects(incompatible.connect(), /UDP non confirmé|UDP non confirmé|UDP non confirm/);
assert.equal(incompatible.closed, true);
assert.equal(incompatible.pc.connectionState, 'closed');
const assembler = new ReplyAssembler();
assert.throws(() => assembler.receive({ v: 1, id: 1, part: 0, count: 99999, data: 'bad' }));
assert.ok(udpCandidate('candidate:1 1 UDP 100 1.2.3.4 5000 typ host'));
assert.equal(udpCandidate('candidate:1 1 TCP 100 1.2.3.4 5000 typ host'), false);
assert.doesNotMatch(
  udpDescription(
    'a=candidate:1 1 TCP 100 host 5000 typ host\r\na=candidate:2 1 UDP 1 host 5001 typ host',
  ),
  / TCP /,
);
console.log(
  'Browser transport contract: UDP gate, reliable/lossy options, chunks, command errors, congestion, no HTTP fallback.',
);
