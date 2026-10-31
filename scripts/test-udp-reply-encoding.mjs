import { encodeReplyV1 } from './fixtures/udp-reply-v1.mjs';
import assert from 'node:assert/strict';
import {
  encodeReply,
  encodeReplyText,
  ReplyAssembler,
  CHUNK_BYTES,
  MAX_REPLY_BYTES,
} from '../src/udp-protocol.js';
for (const reply of [
  { status: 200, body: { message: 'Été 🦟', quoted: '\\"\n\t' } },
  { status: 409, body: { error: 'Commande déjà traitée.' } },
  {
    status: 200,
    body: {
      roster: Array.from({ length: 900 }, (_, id) => ({
        id,
        type: 'midge',
        hp: 100,
        p: [id / 100, 0.4, 1.2],
      })),
    },
  },
  {
    status: 200,
    body: { boundary: 'é'.repeat(CHUNK_BYTES - 42) + '🦟' + 'x'.repeat(CHUNK_BYTES) },
  },
]) {
  const text = JSON.stringify(reply);
  const expected = encodeReplyV1(JSON.parse(text), 17);
  assert.deepEqual(encodeReply(reply, 17), expected);
  const actual = encodeReplyText(text, 17);
  assert.deepEqual(actual, expected, 'wire packets must be byte-for-byte identical');
  const assembler = new ReplyAssembler();
  let result;
  for (const chunk of actual.toReversed()) result = assembler.receive(JSON.parse(chunk)) ?? result;
  assert.deepEqual(result, reply);
}
assert.throws(() => encodeReplyText('x'.repeat(MAX_REPLY_BYTES + 1), 1), /volumineux/);
assert.throws(() => encodeReplyText({}, 1), /JSON/);
console.log(
  'PASS: serialized UDP reply chunks preserve exact packets, errors, Unicode, boundaries, reverse assembly and size limits.',
);

// Place the high surrogate at the last UTF-16 unit of the first chunk.
const splitText = '{"x":"' + 'a'.repeat(CHUNK_BYTES - 7) + '🦟"}';
assert.equal(splitText.indexOf('🦟'), CHUNK_BYTES - 1);
const splitChunks = encodeReplyText(splitText, 18);
assert.deepEqual(splitChunks, encodeReplyV1(JSON.parse(splitText), 18));
const splitAssembler = new ReplyAssembler();
let splitResult;
for (const packet of splitChunks.toReversed())
  splitResult = splitAssembler.receive(JSON.parse(packet)) ?? splitResult;
assert.deepEqual(splitResult, JSON.parse(splitText));

// Exercise the session boundary, including its immutable cache rather than just
// invoking the encoder twice with the same object.
const { GameSession } = await import('../server/session.js');
let executions = 0;
const packets = [];
const body = {
  id: 'pilot',
  snapshot: { code: 'REPLAY', roster: ['initial'], note: '🦟'.repeat(7000) },
};
const session = new GameSession(
  {
    join() {
      executions++;
      return body;
    },
  },
  { send: (packet) => packets.push(packet), now: () => 100000, close() {} },
);
const request = JSON.stringify({
  v: 1,
  id: 1,
  path: 'join',
  body: { code: 'REPLAY', name: 'Player' },
});
session.command(request);
assert.equal(executions, 1);
const initial = packets.splice(0);
assert.ok(initial.length > 1);
assert.deepEqual(initial, encodeReplyV1({ status: 200, body }, 1));
body.snapshot.roster.push('must never appear in replay');
body.snapshot.note = 'mutated';
session.command(request);
assert.equal(executions, 1);
assert.deepEqual(
  packets,
  initial,
  'replay preserves the whole original reply after source mutation',
);
console.log(
  'PASS: split Unicode surrogate pairs and full immutable multi-chunk session replay after domain mutation.',
);
