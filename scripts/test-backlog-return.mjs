import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import { VEHICLES, vehiclePad } from '../src/fleet.js';
import { stepHelicopter } from '../src/helicopter.js';
import { resolveLanding } from '../src/sortie.js';
import { MAP } from '../src/scale.js';
import { fullAmmo } from '../src/logistics.js';
import { SHOP, shopPrice, purchaseCount } from '../src/equipment.js';
import { reserveAlerts, missileStatus, ArrivalSignals } from '../src/reserve-feedback.js';
import { deliveryLanding, DELIVERY_SPEED } from '../src/delivery.js';
import { wavePlan } from '../src/waves.js';
import { createOrdnance } from '../src/ordnance.js';
import { createSoul, inDeskZone, deskOccupant, advanceArena } from '../src/purgatory-physics.js';
const floor = { min: { x: -4, y: -0.1, z: -3 }, max: { x: 4, y: 0, z: 3 } };
for (const occupied of [false, true]) {
  const s = { ...vehiclePad('helicopter'), p: [0, 1, 0], q: [0, 0, 0, 1], landed: false };
  for (let i = 0; i < 240; i++)
    stepHelicopter(T, s, { occupied }, [floor], 1 / 120, VEHICLES.helicopter);
  assert.equal(s.hp, 200);
  assert.ok(occupied ? Math.abs(s.p[1] - 1) < 1e-8 : s.p[1] < 0.99);
  if (!occupied) {
    const before = s.rotorPower;
    for (let i = 0; i < 120; i++)
      stepHelicopter(
        T,
        s,
        { occupied: true, collective: 1 },
        [floor],
        1 / 120,
        VEHICLES.helicopter,
      );
    assert.ok(s.rotorPower > before);
  }
}
const landing = {
  position: new T.Vector3(0, VEHICLES.fighter.gear - 0.00001, 0),
  vel: new T.Vector3(MAP.metres(65), -MAP.metres(1), 0),
  q: new T.Quaternion(),
  omega: new T.Vector3(),
  gear: VEHICLES.fighter.gear,
};
assert.equal(
  resolveLanding(T, landing, new T.Vector3(0, VEHICLES.fighter.gear + 0.0001, 0), [floor], 1 / 120)
    .landed,
  true,
);
landing.vel.y = MAP.metres(1);
assert.equal(resolveLanding(T, landing, landing.position.clone(), [floor], 1 / 120).landed, false);
let now = 10000;
const game = new Game({ now: () => now, solids: [floor] });
const joined = game.join({ code: 'RETURNS', name: 'Tester' });
const room = game.rooms.get('RETURNS');
const pilot = room.pilots.get(joined.id);
for (const type of Object.keys(VEHICLES)) {
  const v = game.createVehicle(room, type, 'purchase', { x: 0, y: 0, z: 0 });
  v.state.hp = 20;
  v.state.engine = 0;
  v.state.wing = 0;
  v.supplies = { ...v.supplies, fuel: 300, ammo: fullAmmo(type) };
  room.equipment = [{ kind: 'refuel', x: 0, y: 0, z: 0 }];
  now += 1000;
  game.fleet(room);
  assert.ok(v.state.hp > 20);
  assert.equal(v.state.engine, 1);
  assert.equal(v.state.wing, 1);
}
const v = game.createVehicle(room, 'helicopter', 'purchase', { x: 1, y: 1, z: 0 });
pilot.vehicle_id = v.id;
pilot.seat = 'copilot';
pilot.mode = 'crew';
pilot.state.turretDirection = [0, 0, -1];
pilot.state.aimPoint = [1, 1, 0];
v.seats.set('copilot', pilot.id);
const shot = createOrdnance({
  shot: 'guidance',
  weapon: 'missile',
  vehicle: v,
  shooter: pilot.id,
  direction: [0, 0, -1],
  now,
  wave: 0,
});
shot.occupation = pilot.occupation;
shot.p = [1, 1, -1];
shot.v = [0, 0, -0.1];
room.ordnance = [shot];
now += 3000;
game.advanceOrdnance(room, now);
assert.ok(shot.v[2] < -0.099, 'must not turn back toward old aim point behind missile');
v.supplies.ammo.missile = 1;
assert.equal(missileStatus(v, [shot], now), 'Missile en vol');
shot.done = true;
v.nextMissileAt = now + 2000;
assert.equal(missileStatus(v, [], now), 'Missile en cours de rechargement');
assert.equal(missileStatus(v, [], now + 2000), '');
v.supplies.ammo.missile = 0;
assert.equal(missileStatus(v, [], now), 'Missiles épuisés');
v.state.hp = 50;
v.supplies.fuel = 0;
assert.ok(reserveAlerts(v).some((x) => x.includes('épuisé')));
v.state.hp = 200;
v.supplies.fuel = 300;
v.supplies.ammo = fullAmmo(v.type);
assert.deepEqual(reserveAlerts(v), []);
const arrivals = new ArrivalSignals();
assert.deepEqual(arrivals.update(1, [1]), []);
assert.deepEqual(arrivals.update(1, [1, 2, 3]), [2, 3]);
assert.deepEqual(arrivals.update(1, [1, 2, 3]), []);
assert.deepEqual(arrivals.update(2, [2]), []);
for (let seed = 0; seed < 100; seed++) {
  const wave = wavePlan('seed' + seed, 2);
  assert.ok(wave.roster.some((e) => !['ant', 'midge'].includes(e.type)));
}
game.soul(room, 'player', pilot.id, pilot.name);
game.arena(room, 'purgatory');
const soul = room.purgatory.bodies.find((b) => b.entity === pilot.id);
assert.equal(inDeskZone(soul), false);
assert.ok(Math.abs(soul.x) > 1);
// Onboard signed purchases: distinct, paid once, every catalog equipment, first support, no damage.
pilot.mode = 'crew';
room.equipment = [];
room.vehicles = new Map([[v.id, v]]);
room.dollars = 10000;
for (const [item, profile] of Object.entries(SHOP)) {
  if (!['placement', 'vehicle'].includes(profile.kind)) continue;
  const body = {
    item,
    request: 'delivery-' + item,
    expectedPrice: shopPrice(item, room.upgrades, 0),
    epoch: room.base.epoch,
    incarnation: pilot.incarnation,
    signature: true,
  };
  game.purchaseSign(room, pilot, body);
  const dollars = room.dollars;
  game.purchaseSign(room, pilot, body);
  assert.equal(room.dollars, dollars);
}
assert.equal(
  room.deliveries.length,
  Object.values(SHOP).filter((x) => ['placement', 'vehicle'].includes(x.kind)).length,
);
assert.equal(DELIVERY_SPEED, MAP.metres(1 / 3));
assert.equal(
  deliveryLanding({ item: 'dca', x: 0, y: 1, z: 0 }, [
    floor,
    { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 0.5, z: 1 } },
  ]).y,
  0.50005,
);
now += 4000000;
game.advanceDeliveries(room, now);
assert.equal(room.deliveries.length, 0);
assert.ok(room.equipment.length > 0);
console.log(
  'PASS: repair all models; empty/occupied H2 and recovery; fast wheels-first contact and takeoff; missile beyond old target; HUD, arrivals, wave 2; side spawn; signed airborne deliveries and support.',
);

const queued = createSoul({ id: 1, entity: 'npc', kind: 'enemy' }, 0, now);
const walker = createSoul({ id: 2, entity: 'human', kind: 'player' }, 0, now);
const queue = { respectQueue: true, bodies: [queued, walker], time: now, events: [], eventSeq: 0 };
assert.equal(deskOccupant(queue).id, 1, 'cannot sign before earlier insect');
queued.gone = true;
assert.equal(deskOccupant(queue).id, 2, 'no delay after release');
assert.equal(purchaseCount({ equipment: [], deliveries: [{ item: 'radar' }] }, 'radar'), 1);
const blocked = deliveryLanding({ item: 'dca', x: 0, y: 0.01, z: 0 }, [
  floor,
  { min: { x: -0.01, y: 0.001, z: -0.01 }, max: { x: 0.01, y: 0.02, z: 0.01 } },
]);
assert.equal(blocked, null, 'a collider above the current parcel still blocks headroom');
