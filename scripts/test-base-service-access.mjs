import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { initialStation } from '../server/game.js';
import { makeServiceStation, makeRefuelCollider } from '../src/station-model.js';
import { VEHICLES, vehicleEntry, vehiclePad } from '../src/fleet.js';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { SERVICE_RADIUS } from '../src/logistics.js';
const station = initialStation();
const model = makeServiceStation(T, 'refuel');
model.position.set(station.x, station.y, station.z);
model.scale.setScalar(MAP.ratio);
const collider = makeRefuelCollider(T, model);
const bomber = { type: 'bomber', state: vehiclePad('bomber') };
for (const seat of VEHICLES.bomber.seats) {
  const entry = vehicleEntry(bomber, seat);
  const dx = Math.max(collider.min.x - entry.x, entry.x - collider.max.x, 0);
  const dz = Math.max(collider.min.z - entry.z, entry.z - collider.max.z, 0);
  assert.ok(
    Math.hypot(dx, dz) > MAP.metres(3) + 0.16 * ACTOR_UNIT,
    `station must leave the full ${seat} access circle clear`,
  );
}
for (const type of ['fighter', 'bomber']) {
  const position = vehiclePad(type).p;
  assert.ok(
    Math.hypot(position[0] - station.x, position[1] - station.y, position[2] - station.z) <
      SERVICE_RADIUS,
    `${type} still receives service at its initial parking spot`,
  );
}
console.log(
  'Base station: both bomber access circles clear; fighter/bomber remain in service range',
);
