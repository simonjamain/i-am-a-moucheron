import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { SHOP } from '../src/equipment.ts';
import { shopColumns } from '../src/shop-catalog.ts';
import { VEHICLES, isBomber, vehicleEntry } from '../src/fleet.ts';
import { canUseWeapon } from '../src/armament.ts';
import { ammoCapacity, fullAmmo } from '../src/logistics.ts';
import { baseWorld } from '../src/base.js';
import { ACTOR_UNIT } from '../src/scale.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';

// The original M1-style light fighter and four-seat medium bomber stay in the
// game as purchases; only the biplanes are free, unlimited starters.
assert.equal(VEHICLES.lightfighter.name, 'Chasseur léger');
assert.equal(VEHICLES.medbomber.name, 'Bombardier moyen');
assert.deepEqual(VEHICLES.medbomber.seats, ['pilot', 'dorsal', 'tail', 'ventral']);
assert.deepEqual(VEHICLES.lightfighter.seats, ['pilot']);
assert.ok(isBomber('bomber') && isBomber('medbomber') && !isBomber('lightfighter'));
for (const key of ['lightfighter', 'medbomber']) {
  assert.equal(SHOP[key].kind, 'vehicle');
  assert.ok(
    shopColumns().some((c) => c.id === 'air' && c.items.includes(key)),
    key + ' in the shop',
  );
}
assert.equal(SHOP.lightfighter.cost, 15);
assert.equal(SHOP.medbomber.cost, 15);
assert.equal(ammoCapacity('medbomber', 'bomb'), 50);
assert.equal(ammoCapacity('medbomber', 'pilot'), 0, 'the bomber pilot has no gun');
assert.ok(ammoCapacity('medbomber', 'tail') > 0 && ammoCapacity('medbomber', 'ventral') > 0);
assert.ok(ammoCapacity('lightfighter', 'pilot') > ammoCapacity('fighter', 'pilot'));
assert.deepEqual(Object.keys(fullAmmo('medbomber')).sort(), [
  'bomb',
  'dorsal',
  'pilot',
  'tail',
  'ventral',
]);
assert.ok(canUseWeapon('medbomber', 'pilot', 'bomb'));
assert.ok(!canUseWeapon('medbomber', 'pilot', 'pilot'));
assert.ok(canUseWeapon('medbomber', 'tail', 'tail'));
assert.ok(canUseWeapon('lightfighter', 'pilot', 'pilot'));
assert.ok(!canUseWeapon('lightfighter', 'pilot', 'bomb'));

const game = new Game({ now: () => 100000 });
const players = Array.from({ length: 4 }, (_, i) => game.join({ code: 'ORIGINAL', name: 'P' + i }));
const room = game.rooms.get('ORIGINAL');
const starters = [...room.vehicles.values()].map((v) => v.type).sort();
assert.deepEqual(
  starters,
  ['bomber', 'fighter', 'tank'],
  'only the biplanes and the tank are free starters',
);
const light = game.createVehicle(room, 'lightfighter');
const medium = game.createVehicle(room, 'medbomber');
assert.equal(medium.origin, 'purchase');
game.fleet(room);
assert.equal(room.vehicles.size, 5, 'purchases never replace nor duplicate the starters');
assert.equal(light.supplies.ammo.pilot, ammoCapacity('lightfighter', 'pilot'));
assert.equal(medium.supplies.ammo.bomb, 50);

const call = (id, path, body = {}) => game.command('ORIGINAL', id, path, body);
function board(id, vehicle, seat) {
  const entry = vehicleEntry(vehicle, seat),
    body = game.base(room, room.pilots.get(id));
  body.x = (entry.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
  body.z = (OFFICE_LAYOUT.base.originZ - entry.z) / ACTOR_UNIT;
  body.y = entry.y;
  assert.ok(Math.hypot(baseWorld(body).x - entry.x, baseWorld(body).z - entry.z) < 1e-8);
  const ground = { epoch: room.base.epoch, body: { ...body } };
  call(id, 'vehicle-select', { vehicle: vehicle.id, seat, ground });
  for (const form of [1, 2])
    call(id, 'vehicle-sign', { vehicle: vehicle.id, seat, signature: true, form, ground });
}
for (const [i, seat] of VEHICLES.medbomber.seats.entries()) board(players[i].id, medium, seat);
assert.equal(medium.seats.size, 4, 'four crew aboard the medium bomber');
console.log(
  'PASS: original light fighter and medium bomber: shop, ammunition, four seats, starters unchanged.',
);
