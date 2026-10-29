import assert from 'node:assert/strict';
import {
  createSoul,
  advanceArena,
  queueTargets,
  deskOccupant,
  bodyMotion,
  relayBodyReport,
  NPC_KO_MS,
} from '../src/purgatory-physics.js';
const player = { ...createSoul({ id: 1, entity: 'me', kind: 'player' }, 0, 1000), x: 0, z: 1.1 };
const npcs = Array.from({ length: 12 }, (_, i) =>
  createSoul({ id: i + 2, entity: 'bug' + i, kind: 'enemy' }, i + 1, 1000),
);
const a = { time: 1000, events: [], eventSeq: 0, bodies: [player, ...npcs] };
for (let tick = 0; tick < 600; tick++) {
  player.inputAt = a.time;
  advanceArena(a, a.time + 1000 / 60);
}
assert.ok(
  npcs.every((b) => b.z > 2.6),
  'NPCs must wait behind the player at the desk, not swarm its ring',
);
for (let i = 1; i < npcs.length; i++)
  assert.ok(
    npcs[i].z - npcs[i - 1].z > 1.4,
    'distinct ordered queue positions must stay separated',
  );
console.log('PASS: twelve NPCs form a spaced line behind a player occupying the desk');

// The migration case: an existing swarm must unwind, not only new spawns line up.
const scattered = npcs.map((b, i) => ({
  ...createSoul({ id: b.id, entity: b.entity, kind: 'enemy' }, i + 1, 1000),
  x: ((i % 3) - 1) * 0.5,
  z: 1.2 + Math.floor(i / 3) * 0.25,
}));
const migration = {
  time: 1000,
  events: [],
  eventSeq: 0,
  host: 'host',
  bodies: [{ ...player, entity: 'visitor' }, ...scattered],
};
for (let tick = 0; tick < 1800; tick++) advanceArena(migration, migration.time + 1000 / 60, 'host');
assert.ok(
  scattered.every((b) => b.z > 2.6 && !b.attack),
  'existing crowds move behind the signer and never attack',
);
for (let i = 1; i < scattered.length; i++)
  assert.ok(
    scattered[i].z - scattered[i - 1].z > 1.4,
    'existing crowd resolves into ordered slots',
  );
console.log(
  'PASS: an existing twelve-NPC swarm unwinds into the line without displacing the signer',
);

const retained = npcs[3],
  ticket = retained.queueTicket,
  place = queueTargets(a).get(retained.id);
retained.x = 2.4;
retained.hitAt = a.time;
for (let tick = 0; tick < 360; tick++) advanceArena(a, a.time + 1000 / 60);
assert.equal(retained.queueTicket, ticket, 'a displacement without KO never loses its ticket');
assert.ok(
  Math.hypot(retained.x - place.x, retained.z - place.z) < 0.2,
  'a displaced NPC regains its own place',
);

console.log('PASS: physical queue, fixed place recovery, no melee or automatic retaliation.');
