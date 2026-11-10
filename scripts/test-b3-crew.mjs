import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { baseWorld } from '../src/base.js';
import { vehicleEntry, VEHICLES } from '../src/fleet.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { CONTRACTS } from '../src/contracts.js';
const game = new Game({ now: () => 100000 });
const players = Array.from({ length: 5 }, (_, i) =>
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
for (const [i, seat] of VEHICLES.bomber.seats.entries()) board(players[i].id, bomber, seat);
assert.equal(bomber.seats.size, 4);
assert.throws(() => board(players[4].id, bomber, 'ventral'), /occupé/);
const ventral = players[3].id;
assert.equal(room.pilots.get(ventral).mode, 'crew');
const stock = { ...bomber.supplies.ammo };
const fire = call(ventral, 'aircraft-fire', {
  vehicle: bomber.id,
  seat: 'ventral',
  shots: ['v1', 'v2'],
});
assert.equal(fire.ammo.ventral, stock.ventral - 2);
assert.equal(fire.ammo.dorsal, stock.dorsal);
assert.equal(fire.ammo.tail, stock.tail);
call(ventral, 'aircraft-fire', { vehicle: bomber.id, seat: 'ventral', shots: ['v1', 'v2'] });
assert.equal(bomber.supplies.ammo.ventral, stock.ventral - 2);
const pose = structuredClone(bomber.state);
call(ventral, 'seat-request', { seat: 'dorsal' });
const request = [...room.requests.values()].at(-1);
for (const id of [ventral, players[1].id]) {
  call(id, 'seat-sign', { request: request.id, signature: true });
}
assert.equal(bomber.seats.get('ventral'), players[1].id);
assert.equal(bomber.seats.get('dorsal'), ventral);
assert.deepEqual(bomber.state.p, pose.p);
assert.equal(bomber.seats.get('pilot'), players[0].id);
assert.ok(CONTRACTS['boarding:ventral'][0][0].title.includes('ventral'));
call(players[1].id, 'vehicle-exit');
assert.equal(bomber.seats.size, 3);
assert.ok(!bomber.seats.has('ventral'));
assert.equal(bomber.seats.get('pilot'), players[0].id);
console.log(
  'PASS B3: four signed occupants, exclusive ventral seat, independent stock, idempotent fire, signed exchange and exit.',
);
