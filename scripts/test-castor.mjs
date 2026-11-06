import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { SHOP, shopPrice } from '../src/equipment.js';
import { VEHICLES } from '../src/fleet.js';
import { fullAmmo, ammoCapacity } from '../src/logistics.js';
import { canUseWeapon } from '../src/armament.js';
import { withinService, advancePaidService } from '../src/paid-service.js';
import { createGraphics } from '../src/graphics.js';
import { stepTank } from '../src/tank.js';
import { ACTOR_UNIT } from '../src/scale.js';

assert.equal(SHOP.castor.cost, 12);
assert.equal(shopPrice('castor'), 12);
assert.deepEqual(VEHICLES.castor.seats, ['pilot']);
assert.equal(VEHICLES.castor.ground, true);
assert.ok(VEHICLES.castor.maxSpeed > VEHICLES.tank.maxSpeed);
assert.equal(fullAmmo('castor').pilot, 500);
assert.equal(ammoCapacity('castor', 'copilot'), 0);
assert.ok(canUseWeapon('castor', 'pilot', 'pilot'));
assert.ok(!canUseWeapon('castor', 'cannon', 'pilot'));
const scene = new T.Scene();
const castor = createGraphics(T, scene).makeCastor();
assert.equal(castor.userData.wheels.length, 6);
assert.equal(castor.userData.turrets.length, 1);
assert.ok(castor.userData.turrets[0].userData.muzzle);
assert.ok(castor.userData.preserveTexture);
const floor = { min: { x: -2, y: -0.1, z: -2 }, max: { x: 2, y: 0, z: 2 } };
const state = {
  p: [0, VEHICLES.castor.gear, 0],
  q: [0, 0, 0, 1],
  v: [0, 0, 0],
  hp: 100,
  engine: 1,
  wing: 1,
  landed: true,
};
for (let i = 0; i < 120; i++)
  stepTank(T, state, { forward: 1, turn: 0 }, [floor], 1 / 120, VEHICLES.castor);
assert.ok(state.p[2] < 0, 'vehicle drives');
assert.ok(state.landed);
const truck = { type: 'castor', state, supplies: { fuel: 10, ammo: { pilot: 0 }, revision: 0 } };
const plane = {
  type: 'fighter',
  state: {
    hp: 50, engine: 1, wing: 1, landed: false, v: [4, 0, 0],
    p: [state.p[0] + 0.1, state.p[1] + 0.1, state.p[2]],
  },
  supplies: { fuel: 1, ammo: { pilot: 0 }, revision: 0 },
};
assert.ok(withinService(truck, []), 'self service');
assert.ok(withinService(plane, [], [truck]), 'airborne ally service');
const paid = advancePaidService([truck, plane], [], 1, {}, 1);
assert.ok(paid.spent > 0 && paid.spent <= 1);
assert.ok(plane.state.hp > 50 && plane.supplies.ammo.pilot > 0);
assert.ok(truck.supplies.ammo.pilot > 0);
console.log('Castor: shopping, seat, wheels, gun, movement and mobile support OK');
