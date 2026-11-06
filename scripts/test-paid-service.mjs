import assert from 'node:assert/strict';
import { fullAmmo, FUEL_SECONDS } from '../src/logistics.js';
import { advancePaidService, fairServiceShares, withinService } from '../src/paid-service.js';

const station = { kind: 'refuel', x: 0, y: 0, z: 0 };
const vehicle = (id, p = [0, 0.03, 0], type = 'fighter') => ({
  id,
  type,
  state: { p, landed: false, hp: 50, engine: 1, wing: 1, v: [2, 0, 0] },
  supplies: {
    fuel: 0,
    ammo: Object.fromEntries(Object.keys(fullAmmo(type)).map((key) => [key, 0])),
    revision: 0,
  },
});

assert.deepEqual(fairServiceShares([1, 1, 5], 1.5), [0.5, 0.5, 0.5]);
assert.deepEqual(fairServiceShares([0.1, 1, 5], 1.5).map((n) => +n.toFixed(6)), [0.1, 0.7, 0.7]);
const a = vehicle('a');
const b = vehicle('b');
assert.ok(withinService(a, [station]), 'moving airborne plane must receive service');
assert.ok(!withinService(vehicle('far', [1, 0, 0]), [station]));
const noMoney = advancePaidService([a], [station], 0);
assert.equal(noMoney.spent, 0);
assert.equal(a.state.hp, 50);
assert.equal(a.supplies.fuel, 0);
const limited = advancePaidService([a, b], [station], 0.1);
assert.ok(Math.abs(limited.spent - 0.1) < 1e-9);
assert.equal(limited.dollars, 0);
assert.ok(a.state.hp > 50);
assert.equal(a.state.hp, b.state.hp);
assert.equal(a.supplies.fuel, b.supplies.fuel);
assert.equal(a.supplies.revision, 1);
const outside = vehicle('outside', [2, 0, 0]);
assert.equal(advancePaidService([outside], [station], 20).spent, 0);
assert.equal(outside.state.hp, 50);
const solo = vehicle('solo');
const full = advancePaidService([solo], [station], 20, {}, 10);
assert.equal(solo.state.hp, 100);
assert.equal(solo.supplies.fuel, FUEL_SECONDS);
assert.equal(solo.supplies.ammo.pilot, fullAmmo('fighter').pilot);
assert.ok(full.spent > 0 && full.spent < 20);
const mobile = vehicle('mobile', [0, 0.3, 0]);
const castor = vehicle('castor', [0, 0.3, 0], 'castor');
assert.ok(withinService(mobile, [], [castor]));
assert.ok(withinService(castor, []), 'future Castor self-recharges');
console.log('Paid service: fair allocation, moving flight, no free recharge, capacities OK');
