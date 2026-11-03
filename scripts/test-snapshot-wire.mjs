import assert from 'node:assert/strict';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { debugSwarmRoster, wavePlan } from '../src/waves.js';
import {
  packRoster,
  unpackRoster,
  encodeSnapshotForWire,
  decodeSnapshotFromWire,
} from '../src/snapshot-wire.js';

const params = {
  room: 'WIRE10K',
  wave: 1,
  started: 1,
  now: 2,
  balance: DEFAULT_BALANCE,
  firstId: 0,
  revision: 1,
};
const large = [
  ...debugSwarmRoster({ midge: 5000 }, params),
  ...debugSwarmRoster({ midge: 5000 }, { ...params, firstId: 5000, revision: 2 }),
];
for (const roster of [wavePlan('WIRE', 12, 100).roster, large]) {
  const packed = packRoster(roster);
  assert.deepEqual(unpackRoster(JSON.parse(JSON.stringify(packed))), roster);
  if (roster.length === 10000)
    assert.ok(
      JSON.stringify(packed).length < JSON.stringify(roster).length * 0.5,
      'large swarms must cut initial roster size by at least half',
    );
}
const create = (revision, kills = [], enemyDamage = {}) => ({
  code: 'WIRE',
  base: { epoch: 'epoch' },
  wave: 2,
  started: 123,
  balanceRevision: 0,
  rosterRevision: revision,
  roster: [{ id: 0, type: 'midge', hp: 100 }],
  kills,
  enemyDamage,
});
let sent = create(0);
let sender = encodeSnapshotForWire(sent);
let receiver = decodeSnapshotFromWire(JSON.parse(JSON.stringify(sent)));
assert.deepEqual(sent.roster, undefined);
assert.deepEqual(receiver.damage, {});
sent = create(0, [0], { 0: 75 });
sender = encodeSnapshotForWire(sent, sender);
assert.deepEqual(sent.killsAdded, [0]);
assert.deepEqual(sent.enemyDamageChanged, { 0: 75 });
assert.ok(!Object.hasOwn(sent, 'kills'));
receiver = decodeSnapshotFromWire(JSON.parse(JSON.stringify(sent)), receiver);
assert.deepEqual([...receiver.kills], [0]);
assert.deepEqual(receiver.damage, { 0: 75 });
sent = create(0, [0], { 0: 75 });
sender = encodeSnapshotForWire(sent, sender);
assert.deepEqual(sent.killsAdded, []);
assert.deepEqual(sent.enemyDamageChanged, {});
receiver = decodeSnapshotFromWire(JSON.parse(JSON.stringify(sent)), receiver);
assert.deepEqual(receiver.damage, { 0: 75 });
sent = create(1, [], {});
sender = encodeSnapshotForWire(sent, sender);
assert.ok(Object.hasOwn(sent, 'kills'), 'new revision sends full state');
assert.ok(Object.hasOwn(sent, 'rosterGroups'));
receiver = decodeSnapshotFromWire(JSON.parse(JSON.stringify(sent)), receiver);
assert.deepEqual([...receiver.kills], []);
assert.deepEqual(receiver.damage, {});
assert.throws(
  () =>
    decodeSnapshotFromWire(
      {
        ...create(2),
        roster: undefined,
        kills: undefined,
        enemyDamage: undefined,
        killsAdded: [0],
        enemyDamageChanged: {},
      },
      receiver,
    ),
  /sans état initial/,
);
console.log('PASS: 10k roster wire grouping, exact reassembly, damage/kill deltas and revision reset.');
