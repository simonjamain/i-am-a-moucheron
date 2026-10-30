import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import { VEHICLES, vehiclePad } from '../src/fleet.js';
import { HEAVY, canUseWeapon, heavyDamage } from '../src/armament.js';
import { MAP, REFERENCE, FLAK } from '../src/scale.js';
import { SHOP, supportedPlacement } from '../src/equipment.js';
import { fullAmmo, advanceSupplies } from '../src/logistics.js';
import { createOrdnance } from '../src/ordnance.js';
import {
  HELI,
  stepHelicopter,
  clampHeliAim,
  steerMissile,
  heliWeaponOrigin,
} from '../src/helicopter.js';
import {
  MOBILE_FUSE,
  fuseSegment,
  sweptBoxProximity,
  sweptSphereProximity,
  proximityRadius,
} from '../src/mobile-flak.js';
import { createGraphics } from '../src/graphics.js';
import { stepTank } from '../src/tank.js';
import { validMotion } from '../src/network.js';
import { contractKey, ContractBook } from '../src/contracts.js';
import { controlHints, cursorStats, cursorAmmoText } from '../src/live-hud.js';
import { contextKey } from '../src/equipment-controls.js';
import { OFFICE_SOLIDS } from '../worker/assets.js';
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
assert.equal(SHOP.helicopter.cost, SHOP.spitfire.cost * 1.25);
assert.equal(VEHICLES.helicopter.maxSpeed, VEHICLES.fighter.maxSpeed * 0.6);
assert.equal(vehiclePad('helicopter').hp, 200);
assert.deepEqual(fullAmmo('helicopter'), { rocket: 30, missile: 10, copilot: 1000 });
assert.deepEqual(fullAmmo('flaktruck'), { proximity: 100 });
assert.equal(HEAVY.proximity.speed, MAP.metres(REFERENCE.shell * 0.7));
assert.equal(HEAVY.proximity.radius, MAP.metres(FLAK.radius));
assert.equal(HEAVY.rocket.radius, HEAVY.he.radius);
assert.equal(HEAVY.missile.damage, 80);
for (const type of ['helicopter', 'flaktruck']) {
  const state = vehiclePad(type);
  state.p = [0, 2, 0];
  state.q = [0, 0, 0, 1];
  state.landed = false;
  assert.ok(validMotion(state));
  for (const seat of VEHICLES[type].seats) {
    for (const context of ['boarding', 'change', 'exchange-request', 'exchange-accept'])
      assert.ok(new ContractBook(() => 0).get(contractKey(context, seat, type), 0, 'test').text);
    assert.match(controlHints({ vehicle: { type }, seat }), /postes/);
  }
  const ammo = Object.fromEntries(Object.keys(fullAmmo(type)).map((k) => [k, 0]));
  const serviced = advanceSupplies(
    { fuel: 0, ammo },
    { ...state, p: [0, VEHICLES[type].gear, 0], v: [0, 0, 0], landed: true },
    type,
    [{ kind: 'refuel', x: 0, y: 0, z: 0 }],
    10,
  );
  assert.deepEqual(serviced.ammo, fullAmmo(type));
  assert.equal(serviced.fuel, 300);
}
assert.equal(canUseWeapon('helicopter', 'pilot', 'copilot'), false);
assert.equal(canUseWeapon('helicopter', 'copilot', 'rocket'), false);
assert.equal(canUseWeapon('flaktruck', 'pilot', 'proximity'), false);
assert.deepEqual(contextKey({ type: 'helicopter' }, 'ControlLeft'), { heliWeapon: 'missile' });
assert.equal(cursorStats({ vehicle: { type: 'helicopter' }, hp: 200, ammo: 0, speed: 0 }).hp, 200);
let state = { ...vehiclePad('helicopter'), p: [0, 1.5, 0], q: [0, 0, 0, 1], v: [0, 0, 0] };
for (let i = 0; i < 1200; i++)
  stepHelicopter(T, state, { collective: 0 }, [], 1 / 120, VEHICLES.helicopter);
near(state.p[1], 1.5);
assert.equal(state.hp, 200);
for (let i = 0; i < 120; i++)
  stepHelicopter(T, state, { collective: 1 }, [], 1 / 120, VEHICLES.helicopter);
assert.ok(state.p[1] > 1.5);
assert.ok(state.v[1] > 0);
const afterClimb = state.p[1];
for (let i = 0; i < 1200; i++)
  stepHelicopter(T, state, { collective: 0 }, [], 1 / 120, VEHICLES.helicopter);
const stableY = state.p[1];
for (let i = 0; i < 240; i++)
  stepHelicopter(T, state, { collective: 0 }, [], 1 / 120, VEHICLES.helicopter);
near(state.p[1], stableY, 1e-5);
assert.ok(stableY > afterClimb);
state.v = [MAP.metres(10), 0, 0];
for (let i = 0; i < 240; i++) stepHelicopter(T, state, {}, [], 1 / 120, VEHICLES.helicopter);
assert.ok(state.v[0] > 0 && state.v[0] < MAP.metres(10));
state.fuelAvailable = false;
stepHelicopter(T, state, { collective: 1 }, [], 1 / 120, VEHICLES.helicopter);
assert.ok(state.v[1] < 0);
const aim = clampHeliAim({ yaw: 3, pitch: 1 });
assert.equal(aim.yaw, 3);
assert.equal(aim.pitch, 0);
const guided = { p: [0, 1, 0], v: [0, 0, -1] };
steerMissile(guided, [10, 1, 0], 0.1);
near(Math.hypot(...guided.v), 1);
near(Math.acos(-guided.v[2]), HELI.missileTurn * 0.1);
const fuel = advanceSupplies(
  { fuel: 300, ammo: fullAmmo('helicopter') },
  { ...vehiclePad('helicopter'), p: [0, 1, 0], landed: false, gas: 0.1 },
  'helicopter',
  [],
  300,
);
assert.equal(fuel.fuel, 0);
console.log(
  'H2: characteristics, role contracts, stores, ten-second service, fuel, hover/climb/braking, loss of power, turn limit and HUD.',
);
// Swept geometry, exact arm boundary, rounded corners and thin objects.
const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 0.001, y: 1, z: 1 } };
near(sweptBoxProximity([-1, 0.5, 0.5], [1, 0.5, 0.5], box, 0.1), 0.45);
assert.equal(sweptBoxProximity([-0.1, -0.1, 0.5], [-0.1, -0.1, 0.6], box, 0.1), null);
near(sweptSphereProximity([-1, 0, 0], [1, 0, 0], [0, 0, 0], 0.1), 0.45);
assert.equal(fuseSegment([0, 0, 0], [1, 0, 0], 0.298, 0.299), null);
near(fuseSegment([0, 0, 0], [1, 0, 0], 0.299, 0.301).t, 0.5);
near(fuseSegment([0, 0, 0], [1, 0, 0], 0.299, 0.3).t, 1);
near(proximityRadius(0.5), 0.0015);
near(proximityRadius(20), 0.06);
let now = 100000;
const game = new Game({ now: () => now, solids: [] });
const joined = game.join({ code: 'SUPPORT', name: 'Pilote' }),
  room = game.rooms.get('SUPPORT'),
  pilot = room.pilots.get(joined.id);
const other = game.join({ code: 'SUPPORT', name: 'Tireur' }),
  gunner = room.pilots.get(other.id);
const truck = game.createVehicle(room, 'flaktruck');
truck.state.p = [1, 1, 1];
truck.state.q = [0, 0, 0, 1];
game.assign(room, pilot, truck, 'pilot', null);
game.assign(room, gunner, truck, 'cannon', null);
const fire = (person, vehicle, weapon, shot, extra = {}) => {
  pilot.seen = gunner.seen = now;
  return game.command(room.code, person.id, 'heavy-fire', {
    vehicle: vehicle.id,
    occupation: person.occupation,
    weapon,
    shot,
    direction: [0, 0, -1],
    ...extra,
  });
};
assert.throws(() => fire(pilot, truck, 'proximity', 'driver'), /Arme/);
fire(gunner, truck, 'proximity', 'first', { proximity: 20 });
assert.equal(truck.supplies.ammo.proximity, 99);
assert.equal(room.ordnance[0].proximity, 20);
fire(gunner, truck, 'proximity', 'first');
assert.equal(truck.supplies.ammo.proximity, 99);
assert.throws(() => fire(gunner, truck, 'proximity', 'too-soon'), /recharge/);
now += 800;
fire(gunner, truck, 'proximity', 'second', { proximity: 0.5 });
assert.equal(room.ordnance.at(-1).proximity, 0.5);
const makeShot = (age, p = [1, 1, 1], v = [0, 0, 0]) => ({
  shot: 'boundary-' + age,
  weapon: 'proximity',
  vehicle: truck.id,
  shooter: gunner.id,
  p,
  v,
  age,
  at: now - age * 1000,
  updated: now,
  wave: room.wave,
  bonus: 1,
  proximity: 20,
});
const checkFuse = (age, elapsed, expected) => {
  truck.state.hp = 100;
  const shot = makeShot(age);
  room.ordnance = [shot];
  const before = room.effects.length;
  game.advanceOrdnance(room, now + elapsed * 1000);
  assert.equal(room.effects.length - before, expected);
  return shot;
};
checkFuse(0.298, 0.001, 0);
checkFuse(0.299, 0.001, 1);
checkFuse(0.3, 0.001, 1);
checkFuse(0.301, 0.001, 1);
// Thin wall hit before arming is inert. Same wall after arm is a fuse blast.
truck.state.p = [2, 1, 1];
game.solids = [{ min: { x: 0.99, y: 0.9, z: 0.95 }, max: { x: 1.01, y: 1.1, z: 0.951 } }];
let shot = makeShot(0, [1, 1, 1], [0, 0, -10]);
room.ordnance = [shot];
let effects = room.effects.length;
game.advanceOrdnance(room, now + 10);
assert.equal(shot.done, true);
assert.equal(room.effects.length, effects);
shot = makeShot(0.301, [1, 1, 1], [0, 0, -10]);
room.ordnance = [shot];
game.advanceOrdnance(room, now + 10);
assert.equal(room.effects.length, effects + 1);
game.solids = [];
room.ordnance = [];
// Own hull remains eligible after arm. Explosion applies only once.
truck.state.hp = 100;
shot = makeShot(0.3, truck.state.p);
shot.vehicle = truck.id;
room.ordnance = [shot];
effects = room.effects.length;
game.advanceOrdnance(room, now + 1);
assert.equal(room.effects.length, effects + 1);
assert.ok(truck.state.hp < 100);
game.advanceOrdnance(room, now + 100);
assert.equal(room.effects.length, effects + 1);
// Full stock, cadence and exhaustion without underflow.
truck.state.hp = 100;
truck.supplies.ammo.proximity = 100;
for (let i = 0; i < 100; i++) {
  now += 800;
  room.ordnance = [];
  fire(gunner, truck, 'proximity', 'stock-' + i);
}
assert.equal(truck.supplies.ammo.proximity, 0);
now += 800;
assert.throws(() => fire(gunner, truck, 'proximity', 'empty'), /vide/);
console.log(
  'D2: 0.299/0.300/0.301 s, thin walls, own hull, early inert impact, radius snapshots, exact-once blast, role/cadence/replay and 100 rounds.',
);
const heli = game.createVehicle(room, 'helicopter');
heli.state.p = [0, 2, 0];
heli.state.q = [0, 0, 0, 1];
game.assign(room, pilot, heli, 'pilot', null);
game.assign(room, gunner, heli, 'copilot', null);
room.ordnance = [];
fire(pilot, heli, 'rocket', 'rocket1');
const left = room.ordnance.at(-1);
now += 300;
fire(pilot, heli, 'rocket', 'rocket2');
const right = room.ordnance.at(-1);
assert.ok(left.p[0] * right.p[0] < 0);
assert.equal(heli.supplies.ammo.rocket, 28);
assert.throws(() => fire(gunner, heli, 'rocket', 'wrong-rocket'), /Arme/);
fire(gunner, heli, 'missile', 'guided');
let missile = room.ordnance.at(-1);
assert.equal(missile.occupation, gunner.occupation);
assert.throws(() => fire(gunner, heli, 'missile', 'second-guided'), /déjà/);
assert.throws(
  () =>
    game.command(room.code, pilot.id, 'missile-detonate', {
      shot: 'guided',
      occupation: pilot.occupation,
    }),
  /indisponible/,
);
game.command(room.code, gunner.id, 'missile-detonate', {
  shot: 'guided',
  occupation: gunner.occupation,
});
assert.ok(!room.ordnance.includes(missile));
assert.throws(() => fire(gunner, heli, 'missile', 'reload'), /recharge/);
now += 2000;
fire(gunner, heli, 'missile', 'orphan');
missile = room.ordnance.at(-1);
game.release(room, gunner);
const direction = [...missile.v];
game.advanceOrdnance(room, now + 100);
near(missile.v[0], direction[0]);
near(missile.v[1], direction[1]);
assert.throws(
  () =>
    game.command(room.code, gunner.id, 'missile-detonate', {
      shot: 'orphan',
      occupation: gunner.occupation,
    }),
  /indisponible/,
);
// Lifetime deletion without blast, no guidance after a new occupation.
room.ordnance = [missile];
missile.p = [0, 2, 0];
missile.v = [0, 0, 0];
missile.updated = missile.at + 9999;
missile.age = 9.999;
effects = room.effects.length;
game.advanceOrdnance(room, missile.at + 10000);
assert.equal(room.ordnance.length, 0);
assert.equal(room.effects.length, effects);
now = missile.at + 12001;
game.assign(room, gunner, heli, 'copilot', null);
fire(gunner, heli, 'missile', 'hull-loss');
heli.state.hp = 0;
game.advanceOrdnance(room, now + 10);
assert.ok(!room.ordnance.some((s) => s.weapon === 'missile'));
game.command(room.code, pilot.id, 'reset');
assert.equal(room.ordnance.length, 0);
console.log(
  'H2 weapons: alternating rockets, role limits, one guided missile, detonation, 2-second cooldown, exit/occupation protection, inert expiry, hull loss/reset.',
);
// Procedural geometry: both models, seats, visible gun and rotor; launcher origins
// match under rotation, without needing browser WebGL.
const graphics = createGraphics(T, new T.Scene());
for (const [type, factory] of [
  ['helicopter', 'makeHelicopter'],
  ['flaktruck', 'makeFlakTruck'],
]) {
  const model = graphics[factory]('#8eb7c6');
  assert.equal(model.userData.turrets.length, 1);
  const bounds = new T.Box3().setFromObject(model);
  assert.ok(bounds.max.z > bounds.min.z);
  assert.ok(model.userData.turrets[0].userData.muzzle);
}
const drive = { ...vehiclePad('flaktruck'), p: [0, 0.01, 0], q: [0, 0, 0, 1] };
for (let i = 0; i < 120; i++)
  stepTank(T, drive, { forward: 1, turn: 1 }, [], 1 / 120, VEHICLES.flaktruck);
assert.ok(drive.trailerAngle < 0 && drive.trailerAngle >= -0.65);
assert.ok(Math.hypot(...drive.v) > 0);
// Bounded representative CPU load; observations, not a WAN/FPS benchmark.
const bench = new Game({ now: () => now, solids: OFFICE_SOLIDS }),
  j = bench.join({ code: 'BENCH', name: 'CPU' }),
  r = bench.rooms.get('BENCH');
const started = performance.now();
for (let batch = 0; batch < 4; batch++) {
  r.ordnance = Array.from({ length: 32 }, (_, i) => ({
    ...makeShot(0.4, [2, 2, 2], [0.1, 0, -0.1]),
    shot: 'bench-' + i,
    updated: now,
    at: now - 400,
    vehicle: 'none',
  }));
  bench.advanceOrdnance(r, now + 250);
}
console.log(
  JSON.stringify({
    benchmark: '128 proximity projectiles / 250ms simulated each',
    milliseconds: Math.round((performance.now() - started) * 100) / 100,
    solids: OFFICE_SOLIDS.length,
  }),
);

assert.match(
  cursorAmmoText({
    vehicle: { type: 'helicopter', supplies: { fuel: 240, ammo: fullAmmo('helicopter') } },
    seat: 'pilot',
  }),
  /30 roquettes/,
);
assert.match(
  cursorAmmoText({
    vehicle: { type: 'flaktruck', supplies: { fuel: 300, ammo: fullAmmo('flaktruck') } },
    seat: 'cannon',
    proximity: 0.5,
  }),
  /100 obus.*0.5 m/,
);
