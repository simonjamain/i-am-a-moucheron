// The server parks the aircraft a pilot leaves (src/parked-host.ts through Game): brakes on,
// physics on the decor, asleep when at rest; a pilot sitting down takes it back.
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { baseWorld } from '../src/base.ts';
import { vehicleEntry } from '../src/fleet.ts';
import { ACTOR_UNIT, MAP } from '../src/scale.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';

let now = 100000;
const game = new Game({ now: () => now });
const player = game.join({ code: 'PARK', name: 'Pilote' });
const room = game.rooms.get('PARK');
const call = (path, body = {}) => game.command('PARK', player.id, path, body);
const tick = () => {
  now += 50;
  room.pilots.get(player.id).seen = now;
  game.advance(room);
};
const biplane = [...room.vehicles.values()].find((v) => v.type === 'fighter');
assert.ok(biplane, 'a starter biplane');
const entry = vehicleEntry(biplane, 'pilot');
const ground = () => {
  const body = game.base(room, room.pilots.get(player.id));
  body.x = (entry.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
  body.z = (OFFICE_LAYOUT.base.originZ - entry.z) / ACTOR_UNIT;
  body.y = entry.y;
  return { epoch: room.base.epoch, body: { ...body } };
};
const g = ground();
call('vehicle-select', { vehicle: biplane.id, seat: 'pilot', ground: g });
for (const form of [1, 2])
  call('vehicle-sign', { vehicle: biplane.id, seat: 'pilot', signature: true, form, ground: g });
assert.equal(biplane.seats.get('pilot'), player.id);
assert.ok(biplane.seats.has('pilot'), 'flown');

// The aircraft is stopped on the ground: the pilot gets out, the server parks it.
const rest = structuredClone(biplane.state);
biplane.state = { ...biplane.state, v: [0, 0, 0], landed: true, gas: 0.5 };
call('vehicle-exit', { state: { ...biplane.state } });
assert.ok(biplane.hosted, 'left by its pilot: parked by the server');
assert.equal(biplane.state.gas, 0, 'engine off');

// The engine loads on first use: step the room until the physics runs and the aircraft sleeps.
let host = null;
for (let i = 0; i < 400 && !(host = room.parkedHost)?.has?.(biplane.id); i++) {
  tick();
  await new Promise((r) => setTimeout(r, 5));
}
assert.ok(room.parkedHost?.has(biplane.id), 'the room has its plane world');
for (let i = 0; i < 400; i++) tick();
const body = room.parkedHost.body(biplane.id);
assert.ok(body.isSleeping(), 'at rest, the engine put it to sleep');
assert.ok(biplane.state.hp > 0, 'not damaged');
assert.ok(
  Math.hypot(biplane.state.p[0] - rest.p[0], biplane.state.p[2] - rest.p[2]) < MAP.metres(1),
  'it stayed where it was left',
);
assert.ok(Math.abs(biplane.state.p[1] - rest.p[1]) < MAP.metres(1), 'at the same height');

// A pilot sits down again: the aircraft leaves the server's world.
const g2 = ground();
call('vehicle-select', { vehicle: biplane.id, seat: 'pilot', ground: g2 });
for (const form of [1, 2])
  call('vehicle-sign', { vehicle: biplane.id, seat: 'pilot', signature: true, form, ground: g2 });
assert.equal(biplane.seats.get('pilot'), player.id);
tick();
assert.ok(!biplane.hosted && !room.parkedHost.has(biplane.id), 'taken back by a pilot');

// A ground vehicle (a tank here) is parked the same way: the server simulates it, puts it to
// sleep once it is at rest, and a shot fired from its gun kicks it awake.
biplane.state = { ...biplane.state, v: [0, 0, 0], landed: true };
call('vehicle-exit', { state: { ...biplane.state } });
const tank = game.createVehicle(room, 'tank', 'purchase');
const tankEntry = vehicleEntry(tank, 'pilot');
const tankGround = () => {
  const body = game.base(room, room.pilots.get(player.id));
  body.x = (tankEntry.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
  body.z = (OFFICE_LAYOUT.base.originZ - tankEntry.z) / ACTOR_UNIT;
  body.y = tankEntry.y;
  return { epoch: room.base.epoch, body: { ...body } };
};
const tg = tankGround();
call('vehicle-select', { vehicle: tank.id, seat: 'pilot', ground: tg });
for (const form of [1, 2])
  call('vehicle-sign', { vehicle: tank.id, seat: 'pilot', signature: true, form, ground: tg });
assert.equal(tank.seats.get('pilot'), player.id);
tank.state = { ...tank.state, v: [0, 0, 0], landed: true };
const tankRest = structuredClone(tank.state);
call('vehicle-exit', { state: { ...tank.state } });
assert.ok(tank.hosted, 'the tank is parked by the server');
for (let i = 0; i < 700; i++) tick();
assert.ok(room.parkedHost.has(tank.id), 'in the room world');
assert.ok(room.parkedHost.asleep(tank.id), 'asleep at rest');
assert.ok(tank.state.hp > 0, 'not damaged');
assert.ok(
  Math.hypot(tank.state.p[0] - tankRest.p[0], tank.state.p[2] - tankRest.p[2]) < MAP.metres(1),
  'the tank stayed where it was left',
);
room.parkedHost.kick(tank.id, [0, 0, -1]);
assert.ok(!room.parkedHost.asleep(tank.id), 'a gun shot wakes it');
game.rooms.forEach((r) => r.parkedHost?.dispose());
console.log('test-plane-server ok');
