import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.js';
import { FORTIFICATIONS } from '../src/ground-fortifications.js';
import { stationAccess, stationEntryOffset, stationExit } from '../src/sortie.js';
import { ACTOR_UNIT, MAP } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
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

// No plan to win: the Castor driver builds them for their dollar price.
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

// The visible access ring sits beside the post: 8 cm for the bunker, just
// outside the 3.4 m sweep of the player-scale heavy gun (#113). All stages
// must accept that same reachable position.
const reach = { bunker: 0.09, antitank: MAP.metres(6) };
assert.equal(stationEntryOffset({ kind: 'bunker' }), 0.08);
assert.equal(stationEntryOffset({ kind: 'antitank' }), MAP.metres(4.5));
assert.ok(MAP.metres(4.5) > FORTIFICATIONS.antitank.footprint, 'ring outside the gun sweep');
for (const kind of ['bunker', 'antitank']) {
  const station = room.groundDefense.structures.find((s) => s.kind === kind);
  const position = { x: station.x + stationEntryOffset(station), y: station.y, z: station.z };
  assert.ok(stationAccess(position, station), `${kind}: signature visible at access ring`);
  assert.ok(!stationAccess({ ...position, x: station.x + reach[kind] * 1.01 }, station));
  assert.ok(!stationAccess({ ...position, y: station.y + 0.02 }, station));
  const members = ['Premier', 'Second'].map((name) => {
    const joined = game.join({ code: 'FORTIFY', name });
    const member = room.pilots.get(joined.id);
    const body = game.base(room, member);
    Object.assign(body, {
      x: (position.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
      z: (OFFICE_LAYOUT.base.originZ - position.z) / ACTOR_UNIT,
      y: position.y,
      parachute: false,
    });
    game.command('FORTIFY', member.id, 'equipment-select', { station: station.slot });
    game.command('FORTIFY', member.id, 'equipment-sign', {
      station: station.slot,
      form: 1,
      signature: true,
    });
    return member;
  });
  const sign = (member) =>
    game.command('FORTIFY', member.id, 'equipment-sign', {
      station: station.slot,
      form: 2,
      signature: true,
    });
  sign(members[0]);
  assert.equal(members[0].mode, 'turret');
  assert.equal(members[0].state.turret, station.slot);
  assert.throws(() => sign(members[1]), /occupée/);
  game.command('FORTIFY', members[0].id, 'turret', {});
  assert.equal(members[0].mode, 'foot');
  assert.equal(members[0].state.turret, null);
  const exit = stationExit(station);
  assert.equal(exit.x, station.x + (kind === 'antitank' ? MAP.metres(4.5) : 0.09));
  assert.equal(members[0].state.walkSpawn.x, (exit.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT);
  assert.equal(members[0].state.walkSpawn.y, exit.y);
  sign(members[1]);
  game.command('FORTIFY', members[1].id, 'turret', {});
}
assert.ok(!stationAccess({ x: 0.08, y: 0, z: 0 }, { kind: 'dca', x: 0, y: 0, z: 0 }));

// Issue #113: the heavy gun fires server shells along the barrel direction.
const fire = (member, station, shot, direction = [0, 0.05, -1]) =>
  game.command('FORTIFY', member.id, 'antitank-fire', {
    station: station.slot,
    shot,
    incarnation: member.incarnation,
    direction,
  });
// Isolate finite-ammunition assertions from the automatic paid Castor service.
room.dollars = 0;
p.mode = 'turret';
p.state.turret = gun.slot;
assert.throws(
  () =>
    game.command('FORTIFY', p.id, 'fixed-dca-fire', {
      station: gun.slot,
      shot: 'flak-shell',
      incarnation: p.incarnation,
    }),
  /obus/,
  'no DCA flak round from the heavy gun',
);
assert.throws(() => fire(p, gun, 'too-high', [0, 2, -1]), /Visée/, 'elevation above +40°');
assert.throws(() => fire(p, gun, 'too-low', [0, -0.3, -1]), /Visée/, 'depression below -5°');
fire(p, gun, 'shell-1');
fire(p, gun, 'shell-1');
assert.equal(gun.ammo, FORTIFICATIONS.antitank.ammo - 1, 'idempotent artillery round');
assert.equal(room.ordnance.filter((o) => o.weapon === 'antitank').length, 1, 'one server shell');
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
assert.equal(
  room.equipment[bunker.slot].kind,
  'retired',
  'retired slot does not shift gun indices',
);
assert.equal(room.equipment[gun.slot], gun);

console.log(
  'Castor fortifications: unlocks, buy, room slots, ammunition, cadence, local paid service, removal OK',
);
