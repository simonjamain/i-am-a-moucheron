import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.js';
import { FORTIFICATIONS } from '../src/ground-fortifications.js';
import { advancePaidService } from '../src/paid-service.js';

let now = 100000;
const game = new Game({ now: () => now });
const joined = game.join({ code: 'FORTIFY', name: 'Constructeur' });
const room = game.rooms.get('FORTIFY');
const p = room.pilots.get(joined.id);
const castor = game.createVehicle(room, 'castor');
castor.state.p = [0, VEHICLES.castor.gear, 0];
castor.state.landed = true;
castor.seats.set('pilot', joined.id);
p.mode = 'flight';
p.seat = 'pilot';
p.vehicle_id = castor.id;
room.dollars = 40;
const build = (kind, a, request) =>
  game.command('FORTIFY', p.id, 'ground-defense', {
    epoch: room.base.epoch,
    action: 'build',
    kind,
    a,
    request,
  });

assert.throws(() => build('bunker', [0, 0], 'locked-bunker'), /plan/);
assert.throws(() => build('antitank', [0.19, 0], 'locked-antitank'), /plan/);
room.blueprintLevels.bunker = 1;
room.blueprintLevels.antitank = 1;
const first = build('bunker', [0, 0], 'fort:bunker');
assert.equal(first.dollars, 30);
const bunker = room.groundDefense.structures.find((s) => s.kind === 'bunker');
assert.equal(bunker.hp, FORTIFICATIONS.bunker.hp);
assert.equal(bunker.ammo, FORTIFICATIONS.bunker.ammo);
assert.equal(room.equipment[bunker.slot], bunker, 'stable live station reference');
assert.equal(build('bunker', [0, 0], 'fort:bunker').dollars, 30);
assert.equal(room.equipment.filter((s) => s.kind === 'bunker').length, 1);
const second = build('antitank', [0.19, 0], 'fort:antitank');
assert.equal(second.dollars, 16);
const gun = room.groundDefense.structures.find((s) => s.kind === 'antitank');
assert.equal(gun.ammo, FORTIFICATIONS.antitank.ammo);
assert.equal(room.equipment[gun.slot], gun);

const fire = (member, station, shot) =>
  game.command('FORTIFY', member.id, 'fixed-dca-fire', {
    station: station.slot,
    shot,
    incarnation: member.incarnation,
  });
// Isolate finite-ammunition assertions from the automatic paid Castor service.
room.dollars = 0;
p.mode = 'turret';
p.state.turret = gun.slot;
fire(p, gun, 'shell-1');
fire(p, gun, 'shell-1');
assert.equal(gun.ammo, FORTIFICATIONS.antitank.ammo - 1, 'idempotent artillery round');
assert.throws(() => fire(p, gun, 'shell-too-fast'), /recharge/);
now += 2000;
fire(p, gun, 'shell-2');
assert.equal(gun.ammo, FORTIFICATIONS.antitank.ammo - 2);
p.mode = 'flight';
p.state.turret = null;
assert.throws(() => fire(p, gun, 'shell-abuse'), /Occupez/);

gun.ammo = 0;
assert.equal(advancePaidService([], [gun], 10).spent, 0, 'no remote ammo purchase');
const local = advancePaidService(
  [],
  [{ kind: 'refuel', x: gun.x, y: gun.y, z: gun.z }, gun],
  5,
  {},
  1,
  room.groundDefense,
);
assert.ok(local.spent > 0, 'local artillery ammo costs money');
assert.ok(gun.ammo > 0);
room.dollars = 16;
const removed = game.command('FORTIFY', p.id, 'ground-defense', {
  epoch: room.base.epoch,
  action: 'remove',
  target: bunker.id,
  request: 'fort:remove',
});
assert.equal(removed.dollars, 16);
assert.equal(room.equipment[bunker.slot].kind, 'retired', 'retired slot does not shift gun indices');
assert.equal(room.equipment[gun.slot], gun);

console.log('Castor fortifications: unlocks, buy, room slots, ammunition, cadence, local paid service, removal OK');
