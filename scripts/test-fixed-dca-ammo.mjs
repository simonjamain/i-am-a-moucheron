import assert from 'node:assert/strict';
import { FLAK } from '../src/scale.js';
import { FIXED_DCA_AMMO } from '../src/ground-ammo.js';
import { advancePaidService } from '../src/paid-service.js';
import { newGroundDefense } from '../src/ground-defense-state.js';
import { Game } from '../server/game.js';

const station = { kind: 'refuel', x: 0, y: 0.01, z: 0 };
const gun = { kind: 'dca', x: 0, y: 0.01, z: 0.08, slot: 0, ammo: 0 };
const disconnected = { ...gun, x: 2, z: 2, slot: 1 };
assert.equal(FIXED_DCA_AMMO, 120);
assert.equal(advancePaidService([], [gun], 100).spent, 0);
assert.equal(advancePaidService([], [station, gun], 0).spent, 0);
assert.equal(gun.ammo, 0);
const partial = advancePaidService([], [station, gun], 0.2);
assert.ok(Math.abs(partial.spent - 0.2) < 1e-9);
assert.equal(partial.dollars, 0);
assert.ok(Math.abs(gun.ammo - 2) < 1e-9);
assert.equal(advancePaidService([], [station, disconnected], 10).spent, 0);
assert.equal(disconnected.ammo, 0);
const ground = newGroundDefense();
ground.structures.push({
  id: 'wall', kind: 'barricade', a: [0, 0], b: [0.1, 0], hp: 50, maxHp: 100,
});
gun.ammo = 0;
const shared = advancePaidService([], [station, gun], 0.2, {}, 1, ground);
assert.ok(Math.abs(shared.spent - 0.2) < 1e-9);
assert.equal(ground.structures[0].hp, 60);
assert.ok(Math.abs(gun.ammo - 1) < 1e-9, 'fair allocation with wall');
const castor = {
  type: 'castor', state: { p: [2, 0.2, 2], hp: 100, engine: 1, wing: 1 },
  supplies: { fuel: 300, ammo: { pilot: 500 }, revision: 0 },
};
const mobileGun = { ...disconnected, ammo: 0 };
assert.ok(advancePaidService([castor], [mobileGun], 10).spent > 0);
assert.ok(mobileGun.ammo > 0);

let now = 100000;
const game = new Game({ now: () => now });
const join = game.join({ code: 'DCAFIRE', name: 'Tireur' });
const r = game.rooms.get('DCAFIRE');
const p = r.pilots.get(join.id);
const positioned = { kind: 'dca', x: 0, y: 0.01, z: 0.1, ammo: 2, slot: 0, name: 'Canon' };
r.equipment.push(positioned);
p.mode = 'turret';
p.state.turret = 0;
const fire = (shot, incarnation = p.incarnation) =>
  game.command('DCAFIRE', p.id, 'fixed-dca-fire', { shot, incarnation, station: 0 });
fire('round-1');
assert.equal(positioned.ammo, 1);
fire('round-1');
assert.equal(positioned.ammo, 1, 'same shot cannot debit twice');
assert.throws(() => fire('round-fast'), /recharge/);
assert.equal(positioned.ammo, 1);
now += FLAK.interval * 1000 + 10;
fire('round-2');
assert.equal(positioned.ammo, 0);
now += FLAK.interval * 1000 + 10;
assert.throws(() => fire('round-empty'), /court de munitions/);
assert.equal(positioned.ammo, 0);
p.mode = 'foot';
assert.throws(() => fire('round-unauthorized'), /Occupez/);
assert.equal(positioned.ammo, 0);
console.log('Fixed DCA: finite ammo, charged shot idempotence, cooldown, no remote reload, shared budget OK');
