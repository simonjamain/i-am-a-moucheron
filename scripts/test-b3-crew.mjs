import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { baseWorld } from '../src/base.js';
import { vehicleEntry, VEHICLES } from '../src/fleet.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { CONTRACTS } from '../src/contracts.js';
const game = new Game({ now: () => 100000 });
const players = Array.from({ length: 3 }, (_, i) =>
  game.join({ code: 'B3CREW', name: 'Crew ' + i }),
);
const room = game.rooms.get('B3CREW');
const call = (id, path, body = {}) => game.command('B3CREW', id, path, body);
function approach(id, vehicle, seat) {
  const entry = vehicleEntry(vehicle, seat),
    body = game.base(room, room.pilots.get(id));
  body.x = (entry.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
  body.z = (OFFICE_LAYOUT.base.originZ - entry.z) / ACTOR_UNIT;
  body.y = entry.y;
  assert.ok(Math.hypot(baseWorld(body).x - entry.x, baseWorld(body).z - entry.z) < 1e-8);
  return { epoch: room.base.epoch, body: { ...body } };
}
function board(id, vehicle, seat) {
  const ground = approach(id, vehicle, seat);
  call(id, 'vehicle-select', { vehicle: vehicle.id, seat, ground });
  const p = room.pilots.get(id),
    token = p.state.boarding.token;
  for (const form of [1, 2]) {
    call(id, 'vehicle-sign', { vehicle: vehicle.id, seat, signature: true, form, ground });
  }
}

const bomber = [...room.vehicles.values()].find((v) => v.type === 'bomber');
assert.deepEqual(VEHICLES.bomber.seats, ['pilot', 'dorsal'], 'biplane bomber: pilot and gunner');
for (const [i, seat] of VEHICLES.bomber.seats.entries()) board(players[i].id, bomber, seat);
assert.equal(bomber.seats.size, 2);
assert.throws(() => board(players[2].id, bomber, 'dorsal'), /occupé/);
assert.throws(() => board(players[2].id, bomber, 'ventral'));
const gunner = players[1].id;
assert.equal(room.pilots.get(gunner).mode, 'crew');
const stock = { ...bomber.supplies.ammo };
assert.equal(stock.bomb, 30, 'thirty bombs in the bay');
assert.equal(stock.tail, undefined);
assert.equal(stock.ventral, undefined);
const fire = call(gunner, 'aircraft-fire', {
  vehicle: bomber.id,
  seat: 'dorsal',
  shots: ['v1', 'v2'],
});
assert.equal(fire.ammo.dorsal, stock.dorsal - 2);
call(gunner, 'aircraft-fire', { vehicle: bomber.id, seat: 'dorsal', shots: ['v1', 'v2'] });
assert.equal(bomber.supplies.ammo.dorsal, stock.dorsal - 2, 'idempotent fire');
// Pilot and gunner swap seats by a signed exchange, the aircraft keeps flying.
const pose = structuredClone(bomber.state);
call(gunner, 'seat-request', { seat: 'pilot' });
const request = [...room.requests.values()].at(-1);
for (const id of [gunner, players[0].id]) {
  call(id, 'seat-sign', { request: request.id, signature: true });
}
assert.equal(bomber.seats.get('pilot'), gunner);
assert.equal(bomber.seats.get('dorsal'), players[0].id);
assert.deepEqual(bomber.state.p, pose.p);
call(players[0].id, 'vehicle-exit');
assert.equal(bomber.seats.size, 1);
assert.ok(!bomber.seats.has('dorsal'));
assert.equal(bomber.seats.get('pilot'), gunner);
console.log(
  'PASS biplane bomber: two signed occupants, exclusive gunner seat, 30 bombs, idempotent fire, signed seat exchange and exit.',
);
