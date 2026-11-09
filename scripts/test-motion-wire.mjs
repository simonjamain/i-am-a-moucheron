import assert from 'node:assert/strict';
import { validMotion } from '../src/network.js';
import {
  decodeMotionBatch,
  decodeMotionState,
  encodeMotionBatch,
  encodeMotionState,
  MOTION_BATCH_BYTES,
} from '../src/motion-wire.js';

const json = (v) => JSON.parse(JSON.stringify(v));
let seed = 7;
const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const r = (scale = 10) => (random() - 0.5) * scale;
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(random() * 16).toString(16),
  );
const angle = r(6);
const foot = () => ({
  p: [r(), r(), r()],
  q: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
  v: [r(), 0, r()],
  hp: 100,
  type: undefined,
  collective: 0,
  rotorPower: 1,
  wing: 1,
  engine: 1,
  fire: false,
  vehicle: null,
  seat: null,
  soul: null,
  landed: false,
  gas: 0.65,
  trailerAngle: 0,
  omega: [0, 0, 0],
  turret: -1,
  turretDirection: [r(1), r(1), r(1)],
  aimPoint: undefined,
  ground: {
    scene: 'base',
    epoch: uuid(),
    body: {
      id: 3,
      x: r(50),
      z: r(50),
      vx: r(),
      vz: r(),
      face: r(6),
      balance: 100,
      koUntil: 0,
      hitAt: 1794205811325,
      hitX: 0,
      hitZ: 0,
      nextAttack: 0,
      nextDash: 1794205812000.5,
      served: 0,
      queueTicket: 4,
      input: { x: 0, z: 1, guard: false },
      attack: { kind: 'shove', at: 12.5 },
      gone: false,
      y: null,
      vy: 0,
      parachute: false,
      grounded: true,
    },
  },
});
const fly = () => ({
  ...foot(),
  type: 'helicopter',
  hp: 187.25,
  vehicle: uuid(),
  seat: 'copilot',
  ground: null,
  fire: true,
  gas: 0.4321234,
  collective: -0.33,
  omega: [r(1), r(1), r(1)],
  aimPoint: [r(), r(), r()],
  extraFromNewerClient: { any: ['value', 1] },
});
const soul = () => ({
  ...foot(),
  ground: null,
  soul: { x: 1.5, z: 30, vx: 0.2, vz: -1, face: 0.4 },
});
// Compare with float32 tolerance; everything else exact.
function close(actual, expected, path = 'state') {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const tolerance = Number.isInteger(expected)
      ? 0
      : Math.max(1e-6, Math.abs(expected) * 1e-6) + 5e-5;
    assert.ok(Math.abs(actual - expected) <= tolerance, path + ': ' + actual + ' vs ' + expected);
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.equal(typeof actual, 'object', path);
    assert.deepEqual(
      Object.keys(actual ?? {}).sort(),
      Object.keys(expected).sort(),
      path + ' keys',
    );
    for (const key of Object.keys(expected)) close(actual[key], expected[key], path + '.' + key);
    return;
  }
  assert.deepEqual(actual, expected, path);
}
const sizes = {};
for (const [name, make] of Object.entries({ foot, fly, soul }))
  for (let i = 0; i < 300; i++) {
    const state = make();
    const bytes = encodeMotionState(state);
    const decoded = decodeMotionState(bytes);
    close(decoded, json(state));
    assert.equal(validMotion(decoded), validMotion(state), name + ' validity preserved');
    sizes[name] = [bytes.length, JSON.stringify(state).length];
  }
// Exact values where they matter: IDs, timestamps, integer counters, strings.
const exact = decodeMotionState(encodeMotionState(foot()));
assert.ok(Number.isInteger(exact.ground.body.hitAt));
const fl = fly();
const flown = decodeMotionState(encodeMotionState(fl));
assert.equal(flown.vehicle, fl.vehicle, 'UUIDs are exact');
assert.equal(flown.seat, 'copilot');
assert.deepEqual(flown.extraFromNewerClient, fl.extraFromNewerClient, 'unknown fields survive');
// Values a codec does not accept travel in the JSON rest, unchanged.
const odd = decodeMotionState(
  encodeMotionState({
    ...foot(),
    wing: 0.5,
    q: [0, 0, 0, 1],
    p: [1, NaN, 2],
    seat: 'x'.repeat(300),
  }),
);
assert.equal(odd.wing, 0.5);
assert.deepEqual(odd.p, [1, null, 2], 'NaN becomes null as in JSON');
assert.equal(odd.seat.length, 300);
// Batches: shared bytes, split below the UDP payload size, ages and order kept.
const entries = Array.from({ length: 49 }, (_, i) => {
  const state = i % 2 ? fly() : foot();
  return { peer: uuid(), seq: 1000 + i, at: 5000 - i, bytes: encodeMotionState(state), state };
});
const chunks = encodeMotionBatch(5000, entries);
assert.ok(chunks.length > 1);
assert.ok(
  chunks.every((c) => c.length <= MOTION_BATCH_BYTES),
  'chunks fit the UDP payload',
);
const received = chunks.flatMap((c) => decodeMotionBatch(c.buffer.slice(0)).entries);
assert.equal(received.length, 49);
received.forEach((e, i) => {
  assert.equal(e.peer, entries[i].peer);
  assert.equal(e.seq, entries[i].seq);
  assert.equal(e.age, i);
  close(e.state, json(entries[i].state));
});
assert.equal(decodeMotionBatch(Buffer.from(chunks[0])).time, 5000, 'Node buffers decode too');
// Malformed packets are rejected, never partially applied.
for (const bad of [new Uint8Array([0x4d]), new Uint8Array([1, 2, 3]), chunks[0].slice(0, -3)])
  assert.throws(() => decodeMotionBatch(bad), RangeError);
const jsonBatch = entries.reduce(
  (n, e) => n + JSON.stringify({ v: 1, peer: e.peer, seq: e.seq, state: e.state }).length,
  0,
);
const binaryBatch = chunks.reduce((n, c) => n + c.length, 0);
console.log(
  'Motion wire: exact IDs/timestamps, float32 motion, rest JSON; sizes ' +
    JSON.stringify(sizes) +
    '; 49 peers ' +
    jsonBatch +
    ' B JSON in 49 messages -> ' +
    binaryBatch +
    ' B in ' +
    chunks.length +
    ' messages',
);
