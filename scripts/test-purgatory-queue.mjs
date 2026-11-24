import assert from 'node:assert/strict';
import { bodyMotion, relayBodyReport } from '../src/walk-arena.ts';
import {
  createSoul,
  advancePurgatory,
  queueTargets,
  deskOccupant,
} from '../src/purgatory-queue.ts';
const player = { ...createSoul({ id: 1, entity: 'me', kind: 'player' }, 0, 1000), x: 0, z: 1.1 };
const npcs = Array.from({ length: 12 }, (_, i) =>
  createSoul({ id: i + 2, entity: 'bug' + i, kind: 'enemy' }, i + 1, 1000),
);
const a = { time: 1000, events: [], eventSeq: 0, bodies: [player, ...npcs] };
for (let tick = 0; tick < 600; tick++) {
  player.inputAt = a.time;
  advancePurgatory(a, a.time + 1000 / 60);
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
for (let tick = 0; tick < 1800; tick++)
  advancePurgatory(migration, migration.time + 1000 / 60, 'host');
assert.ok(
  scattered.every((b) => b.z > 2.6),
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
for (let tick = 0; tick < 360; tick++) advancePurgatory(a, a.time + 1000 / 60);
assert.equal(retained.queueTicket, ticket, 'a displacement without KO never loses its ticket');
assert.ok(
  Math.hypot(retained.x - place.x, retained.z - place.z) < 0.2,
  'a displaced NPC regains its own place',
);

console.log('PASS: physical queue, fixed place recovery, no melee or automatic retaliation.');

// The places are a formula: every soul, however many, stands at its own place in ticket order,
// beyond the cloud's edge included; nothing pushes a soul but the rules; a player is pushed by it.
const many = {
  time: 1000,
  events: [],
  eventSeq: 0,
  bodies: Array.from({ length: 1000 }, (_, i) =>
    createSoul({ id: i + 10, entity: 'bug' + i, kind: 'enemy' }, i, 1000),
  ),
};
// Same ticket as the crowd's last: arrives last. Shuffle the arrival order of the bodies.
many.bodies.sort((x, y) => ((x.id * 7919) % 1000) - ((y.id * 7919) % 1000));
const walker = { ...createSoul({ id: 1, entity: 'me', kind: 'player' }, 0, 1000), x: 0.3, z: 5000 };
many.bodies.push(walker);
const started = performance.now();
for (let tick = 0; tick < 30; tick++) {
  walker.input = { x: 0, z: 0 };
  advancePurgatory(many, many.time + 1000 / 60);
}
const perStep = (performance.now() - started) / 30;
const souls = many.bodies
  .filter((b) => b.kind === 'enemy')
  .sort((x, y) => x.queueTicket - y.queueTicket);
souls.forEach((b, i) => {
  assert.ok(
    Math.abs(b.z - (1.1 + i * 1.85)) < 1e-9 || Math.abs(b.z - (1.1 + (i + 1) * 1.85)) < 1e-9,
    'place ' + i,
  );
  assert.equal(b.x, 0);
});
assert.ok(souls.at(-1).z > 1800, 'the thousandth soul stands far down the line, in the air');
assert.ok(new Set(souls.map((b) => b.z)).size === 1000, 'one place each: no two souls overlap');
assert.ok(perStep < 20, `a thousand souls cost ${perStep.toFixed(2)} ms a step`);
// A player who stands in the lane keeps the place: the souls that would stand on them stand one
// place further, and nothing overlaps.
Object.assign(walker, { x: 0.3, z: 20 });
advancePurgatory(many, many.time + 1000 / 60);
assert.ok(
  souls.every((b) => Math.abs(b.z - walker.z) >= 0.85 * 1.85 - 1e-9),
  'no soul stands on the player',
);
assert.equal(new Set(souls.map((b) => b.z)).size, 1000, 'and still one place each');
// A player behind a soul of lower id never passes it (the side aisle is not a shortcut).
const late = {
  ...createSoul({ id: 5000, entity: 'late', kind: 'player' }, 0, 1000),
  x: 0.3,
  z: 20,
};
many.bodies.push(late);
late.inputAt = many.time;
advancePurgatory(many, many.time + 1000 / 60);
assert.ok(late.z >= souls.filter((b) => b.z < late.z).at(-1).z, 'behind the souls ahead of it');
console.log(
  `PASS: a thousand souls placed by formula (${perStep.toFixed(2)} ms a step), room made for the player.`,
);
