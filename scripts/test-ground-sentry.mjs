import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.js';
import { newGroundDefense, groundCommand } from '../src/ground-defense-state.js';
import { SENTRY, fireGroundSentries } from '../src/ground-sentry.js';
import { advancePaidService } from '../src/paid-service.js';

const defense = newGroundDefense();
assert.throws(
  () => groundCommand(defense, { action: 'build', kind: 'sentry', a: [0, 0] }, [0, 0], 20),
  /Castor/,
);
// No plan to win: only the Castor and the dollar price matter.
const options = { castor: true };
const buy = groundCommand(
  defense,
  { action: 'build', kind: 'sentry', a: [0, 0] },
  [0, 0],
  20,
  1000,
  options,
);
assert.equal(buy.price, SENTRY.cost);
const sentry = defense.structures[0];
assert.equal(sentry.ammo, SENTRY.ammo);
assert.throws(
  () =>
    groundCommand(
      defense,
      { action: 'build', kind: 'sentry', a: [0, 0.01] },
      [0, 0],
      20,
      1000,
      options,
    ),
  /occupé/,
  'overlapping footprints are refused (scaled T-01, #110)',
);
const hits = [];
assert.equal(
  fireGroundSentries(defense.structures, [{ id: 1, p: [0.1, 0, 0] }], 1000, (t) => hits.push(t.id)),
  1,
);
assert.deepEqual(hits, [1]);
assert.deepEqual(sentry.aimTarget, [0.1, 0, 0], 'server exposes last sentry target for animation');
assert.equal(sentry.ammo, SENTRY.ammo - 1);
assert.equal(
  fireGroundSentries(defense.structures, [{ id: 1, p: [0.1, 0, 0] }], 1100, () => {}),
  0,
);
assert.equal(
  fireGroundSentries(defense.structures, [{ id: 1, p: [0.8, 0, 0] }], 1800, () => {}),
  0,
);
const off = advancePaidService([], [], 10, {}, 1, defense);
assert.equal(off.spent, 0, 'isolated sentry never refills');
assert.equal(sentry.ammo, SENTRY.ammo - 1);
const on = advancePaidService([], [{ kind: 'refuel', x: 0, y: 0, z: 0 }], 10, {}, 1, defense);
assert.ok(on.spent > 0 && on.spent <= 0.0010001);
assert.equal(sentry.ammo, SENTRY.ammo);
const empty = advancePaidService([], [{ kind: 'refuel', x: 0, y: 0, z: 0 }], 0, {}, 1, defense);
assert.equal(empty.spent, 0);

let now = 100000;
const game = new Game({ now: () => now });
const joined = game.join({ code: 'SENTRY', name: 'Génie' });
const room = game.rooms.get('SENTRY');
const p = room.pilots.get(joined.id);
const vehicle = game.createVehicle(room, 'castor');
vehicle.state.p = [0, VEHICLES.castor.gear, 0];
vehicle.state.landed = true;
vehicle.seats.set('pilot', joined.id);
p.mode = 'flight';
p.seat = 'pilot';
p.vehicle_id = vehicle.id;
room.dollars = 20;
const command = (req) =>
  game.command('SENTRY', joined.id, 'ground-defense', {
    epoch: room.base.epoch,
    ...req,
  });
let snap = command({ action: 'build', kind: 'sentry', a: [0, 0], request: 'sentry:first' });
assert.equal(snap.dollars, 11);
assert.equal(snap.groundDefense.structures.length, 1);
snap = command({ action: 'build', kind: 'sentry', a: [0, 0], request: 'sentry:first' });
assert.equal(snap.dollars, 11, 'idempotent network retry');
assert.equal(snap.groundDefense.structures.length, 1);
p.mode = 'foot';
p.vehicle_id = null;
p.seat = null;
assert.throws(() => command({ action: 'build', kind: 'sentry', a: [0.2, 0] }), /sol/);
console.log('Sentry unlock, cash, finite shots, paid service, network retry and server access: OK');
