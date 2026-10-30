import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { baseWorld } from '../src/base.js';
import { vehicleEntry } from '../src/fleet.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { GameSession } from '../server/session.js';
import { ReplyAssembler } from '../src/udp-protocol.js';

let now = 100000;
const game = new Game({ now: () => now, roomTTL: 30000 });
const a = game.join({ code: 'RAMTEST', name: 'Alpha' }),
  b = game.join({ code: 'RAMTEST', name: 'Bravo' });
let room = game.rooms.get('RAMTEST');
const call = (id, path, body = {}) => game.command('RAMTEST', id, path, body);
assert.equal(room.pilots.size, 2);
assert.equal(new Game().rooms.size, 0, 'restarting has no state to restore');
let s = call(a.id, 'start');
assert.equal(s.next_wave_at, now + 10000);
now += 10000;
s = call(a.id, 'sync', { state: a.state, mode: 'foot' });
assert.equal(s.phase, 'combat');
assert.equal(s.wave, 1);
assert.equal(s.total, 24);
for (let enemy = 0; enemy < s.total; enemy++) {
  call(a.id, 'hit', { wave: 1, enemy, amount: 75, shot: 'one' });
  call(a.id, 'hit', { wave: 1, enemy, amount: 75, shot: 'one' });
  call(a.id, 'hit', { wave: 1, enemy, amount: 75, shot: 'two' });
}
s = game.snapshot(room);
assert.equal(s.phase, 'prep');
assert.equal(s.dollars, 4);
assert.equal(s.kills.length, 24);
assert.equal(s.souls.length, 24);
assert.equal(s.enemyDamage[0], 150);
room.dollars = 30;
s = call(a.id, 'buy', { item: 'engine', request: 'purchase-engine', expectedPrice: 4 });
assert.equal(s.upgrades.engine, 1);
call(a.id, 'buy', { item: 'engine', request: 'purchase-engine', expectedPrice: 4 });
assert.equal(room.dollars, 26);
assert.throws(
  () => call(a.id, 'buy', { item: 'weapons', request: 'purchase-engine' }),
  /déjà utilisée/,
);
assert.throws(
  () => call(a.id, 'buy', { item: 'engine', request: 'purchase-engine-2', expectedPrice: 4 }),
  /tarif/,
);

function approach(id, vehicle, seat) {
  const entry = vehicleEntry(vehicle, seat),
    body = game.base(room, room.pilots.get(id));
  body.x = (entry.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
  body.z = (OFFICE_LAYOUT.base.originZ - entry.z) / ACTOR_UNIT;
  body.y = entry.y;
  assert.ok(Math.hypot(baseWorld(body).x - entry.x, baseWorld(body).z - entry.z) < 1e-8);
  return { epoch: room.base.epoch, body: { ...body } };
}
function clearAnnex(id, token) {
  const d = room.dossiers.get(token);
  const current = room.pilots.get(id);
  const paper = current.state.boarding?.token === token ? current.board_paper : 0;
  if (d?.clause && d.position <= paper) call(id, 'dossier-choice', { token, choice: 'tear' });
}
function board(id, vehicle, seat) {
  const ground = approach(id, vehicle, seat);
  call(id, 'vehicle-select', { vehicle: vehicle.id, seat, ground });
  const p = room.pilots.get(id),
    token = p.state.boarding.token;
  for (const form of [1, 2]) {
    clearAnnex(id, token);
    call(id, 'vehicle-sign', { vehicle: vehicle.id, seat, signature: true, form, ground });
  }
}
const bomber = [...room.vehicles.values()].find((v) => v.type === 'bomber');
board(a.id, bomber, 'pilot');
board(b.id, bomber, 'tail');
assert.equal(room.pilots.get(a.id).mode, 'flight');
assert.equal(bomber.seats.get('tail'), b.id);
call(a.id, 'seat-request', { seat: 'tail' });
let q = [...room.requests.values()][0];
clearAnnex(a.id, q.id + ':' + a.id);
call(a.id, 'seat-sign', { request: q.id, signature: true });
assert.equal(q.status, 'offered');
assert.equal(bomber.seats.get('pilot'), a.id);
call(b.id, 'seat-reject', { request: q.id });
assert.equal(bomber.seats.get('pilot'), a.id);
call(a.id, 'seat-request', { seat: 'tail' });
q = [...room.requests.values()][0];
clearAnnex(a.id, q.id + ':' + a.id);
call(a.id, 'seat-sign', { request: q.id, signature: true });
clearAnnex(b.id, q.id + ':' + b.id);
call(b.id, 'seat-sign', { request: q.id, signature: true });
assert.equal(bomber.seats.get('pilot'), b.id);
assert.equal(bomber.seats.get('tail'), a.id);
assert.equal(room.pilots.get(a.id).mode, 'crew');
const ammo = bomber.supplies.ammo.tail;
let fire = call(a.id, 'aircraft-fire', {
  vehicle: bomber.id,
  seat: 'tail',
  shots: ['a', 'b', 'c'],
});
assert.equal(fire.ammo.tail, ammo - 3);
call(a.id, 'aircraft-fire', { vehicle: bomber.id, seat: 'tail', shots: ['a', 'b', 'c'] });
assert.equal(bomber.supplies.ammo.tail, ammo - 3);
// No refuel and no backwards clock double debit.
bomber.state.landed = false;
bomber.state.gas = 1;
const fuel = bomber.supplies.fuel;
now += 1000;
call(a.id, 'aircraft-fire', { shots: ['d'] });
assert.equal(bomber.supplies.fuel, fuel - 1);
now -= 500;
call(a.id, 'aircraft-fire', { shots: ['d'] });
assert.equal(bomber.supplies.fuel, fuel - 1);
now += 500;
// A pilot exit leaves the hull and independent crew in place.
call(b.id, 'vehicle-exit');
assert.equal(room.pilots.get(a.id).mode, 'crew');
assert.equal(room.pilots.get(b.id).mode, 'foot');
assert.equal(room.vehicles.has(bomber.id), true);
call(a.id, 'vehicle-exit');
assert.equal(room.pilots.get(a.id).state.walkSpawn.parachute, false);
for (let i = 0; i < 9; i++)
  call(a.id, 'friendly-hit', { target: b.id, incarnation: 0, shot: 'p' + i });
assert.equal(room.pilots.get(b.id).health, 10);
call(a.id, 'friendly-hit', { target: b.id, incarnation: 0, shot: 'p8' });
assert.equal(room.pilots.get(b.id).health, 10);
call(a.id, 'friendly-hit', { target: b.id, incarnation: 0, shot: 'p9' });
assert.equal(room.pilots.get(b.id).life, 'dead');
assert.equal(room.pilots.get(b.id).health, 100);
call(a.id, 'death', { incarnation: 0 });
call(a.id, 'enter-purgatory', { incarnation: room.pilots.get(a.id).incarnation });
call(b.id, 'enter-purgatory', { incarnation: room.pilots.get(b.id).incarnation });
for (let i = 0; i < 10; i++)
  call(a.id, 'friendly-hit', { target: b.id, incarnation: 1, shot: 's' + i });
assert.equal(room.pilots.get(b.id).state.realm, 'super');
assert.throws(() => call(b.id, 'death', { incarnation: 1 }), /purgatoire/);
call(b.id, 'enter-purgatory', { incarnation: room.pilots.get(b.id).incarnation });
assert.equal(room.pilots.get(b.id).incarnation, 2, 'old death discarded');
function signAll(id, realm, count) {
  for (let form = 1; form <= count; form++) {
    game.arena(room, realm);
    const body = room[realm].bodies.find((b) => b.entity === id && b.kind === 'player');
    for (const other of room[realm].bodies)
      if (other !== body) Object.assign(other, { x: 8, z: 40 });
    Object.assign(body, { x: 0, z: 1.1, vx: 0, vz: 0 });
    call(id, 'sign', {
      form,
      signature: true,
      ground: { epoch: room[realm].epoch, body: { ...body } },
    });
  }
}
signAll(b.id, 'super', 5);
assert.equal(room.pilots.get(b.id).state.realm, 'purgatory');
// Keep the other player away from the counter.
const abody = room.purgatory.bodies.find((x) => x.entity === a.id);
if (abody) abody.z = 20;
signAll(b.id, 'purgatory', 3);
assert.equal(room.pilots.get(b.id).life, 'alive');
assert.equal(room.pilots.get(b.id).health, 100);
const enemy = [...room.souls.values()].find((s) => s.kind === 'enemy' && s.status === 'waiting');
const dollars = room.dollars;
for (let i = 0; i < 10; i++) call(a.id, 'soul-hit', { soul: enemy.id, shot: 'soul' + i });
call(a.id, 'soul-hit', { soul: enemy.id, shot: 'soul9' });
assert.equal(room.dollars, dollars + 1);
const epoch = room.base.epoch;
call(b.id, 'reset');
assert.notEqual(room.base.epoch, epoch);
assert.equal(room.dollars, 0);
assert.equal(room.souls.size, 0);
// Session binding ignores claimed identity and retains an execution high-water
// mark after its bounded response cache evicts an old command.
const packets = [],
  session = new GameSession(game, {
    send: (p) => packets.push(p),
    relay: () => {
      relayed++;
    },
    close: () => {},
    now: () => now,
  });
const command = (id, path, body = {}) => session.command(JSON.stringify({ v: 1, id, path, body }));
command(1, 'join', { code: 'SESSION' });
const owner = session.player.id;
let relayed = 0;
const sessionRoom = game.rooms.get('SESSION'),
  sp = sessionRoom.pilots.get(owner);
const [oldVehicle, newVehicle] = [...sessionRoom.vehicles.values()];
sp.mode = 'flight';
sp.vehicle_id = newVehicle.id;
sp.seat = 'pilot';
sp.occupation = 3;
const oldState = { ...sp.state, vehicle: oldVehicle.id, seat: 'pilot', p: [1, 2, 3] };
session.motion(
  JSON.stringify({ v: 1, seq: 1, mode: 'flight', incarnation: 0, occupation: 1, state: oldState }),
);
session.motion(
  JSON.stringify({ v: 1, seq: 2, mode: 'flight', incarnation: 0, occupation: 3, state: oldState }),
);
assert.equal(relayed, 0, 'stale occupation and old aircraft cannot move new aircraft');
session.motion(
  JSON.stringify({
    v: 1,
    seq: 3,
    mode: 'flight',
    incarnation: 0,
    occupation: 3,
    state: { ...oldState, vehicle: newVehicle.id },
  }),
);
assert.equal(relayed, 1);
assert.deepEqual(newVehicle.state.p, [1, 2, 3]);
game.sync(sessionRoom, sp, {
  mode: 'flight',
  incarnation: 0,
  occupation: 1,
  state: { ...oldState, p: [9, 9, 9] },
});
assert.deepEqual(newVehicle.state.p, [1, 2, 3], 'late reliable sync also fenced');
for (let id = 2; id < 40; id++) command(id, 'fan', { id: 'some-other-player' });
const fan = game.rooms.get('SESSION').fan;
command(2, 'fan');
assert.equal(game.rooms.get('SESSION').fan, fan);
const last = JSON.parse(packets.at(-1));
assert.equal(new ReplyAssembler().receive(last).status, 409);
assert.equal(game.rooms.get('SESSION').pilots.size, 1);
assert.ok(game.rooms.get('SESSION').pilots.has(owner));
// Terminal records are removed; only materialized souls enter snapshots.
for (let i = 0; i < 100; i++) game.soul(sessionRoom, 'enemy', 'e' + i, 'Moucheron');
let capped = game.snapshot(sessionRoom);
assert.equal(capped.souls.length, 24);
for (const soul of sessionRoom.souls.values()) soul.status = 'gone';
oldVehicle.state.hp = 0;
oldVehicle.ready = 0;
game.advance(sessionRoom);
assert.equal(sessionRoom.souls.size, 0);
now += 16000;
sp.seen = now;
game.advance(sessionRoom);
assert.equal(sessionRoom.vehicles.has(oldVehicle.id), false);
session.stop();
game.disconnect('RAMTEST', a.id);
game.disconnect('RAMTEST', b.id);
now += 31000;
game.sweep();
assert.equal(game.rooms.size, 0);
console.log(
  'RAM domain: waves/rewards, purchases, boarding, atomic exchanges, ammo/fuel, friendly fire, worlds/papers, reset, TTL, session replay.',
);
