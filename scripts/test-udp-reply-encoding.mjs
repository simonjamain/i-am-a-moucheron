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
