import assert from 'node:assert/strict';
import { advancePaidService } from '../src/paid-service.js';
import { newGroundDefense, damageBarricade } from '../src/ground-defense-state.js';
import { Game } from '../server/game.js';

const station = { kind: 'refuel', x: 0, y: 0.01, z: 0 };
const wall = (id, a, b, hp = 50) => ({
  kind: 'barricade',
  id,
  a,
  b,
  hp,
  maxHp: 100,
});
const defense = newGroundDefense();
defense.structures.push(
  wall('near', [0.01, 0], [0.2, 0]),
  wall('far', [2, 2], [2.2, 2], 40),
  wall('dead', [0, 0.05], [0.1, 0.05], 0),
);
const first = advancePaidService([], [station], 0, {}, 1, defense);
assert.equal(first.spent, 0);
assert.equal(first.dollars, 0);
assert.equal(defense.structures[0].hp, 50);
assert.equal(defense.revision, 0);
assert.equal(defense.navigationRevision, 0);

const repair = advancePaidService([], [station], 0.1, {}, 1, defense);
assert.equal(repair.spent, 0.1);
assert.equal(repair.dollars, 0);
assert.equal(defense.structures[0].hp, 60);
assert.equal(defense.structures[1].hp, 40);
assert.equal(defense.structures[2].hp, 0);
assert.equal(defense.revision, 1);
assert.equal(defense.navigationRevision, 0);

const castor = {
  type: 'castor',
  state: { hp: 100, p: [2.12, 0.35, 2.1], engine: 1, wing: 1 },
  supplies: { fuel: 300, ammo: { pilot: 500 }, revision: 0 },
};
const fromCastor = advancePaidService([castor], [], 1, {}, 1, defense);
assert.ok(fromCastor.spent > 0);
assert.equal(defense.structures[1].hp, 50, 'living Castor repairs at height and in motion');
assert.equal(defense.structures[0].hp, 60, 'does not repair a distant wall');
castor.state.hp = 0;
assert.equal(advancePaidService([castor], [], 1, {}, 1, defense).spent, 0);

const fair = newGroundDefense();
fair.structures.push(wall('a', [0, 0], [0.2, 0]), wall('b', [0, 0.02], [0.2, 0.02]));
const part = advancePaidService([], [station], 0.1, {}, 1, fair);
assert.equal(part.spent, 0.1);
assert.equal(fair.structures[0].hp, 55);
assert.equal(fair.structures[1].hp, 55, 'cash allocated equally when insufficient');
assert.equal(fair.revision, 1);
assert.equal(advancePaidService([], [station], -2, {}, 1, fair).dollars, -2);
assert.equal(fair.structures[0].hp, 55, 'existing debt cannot buy repair');

// Room-level test: the server tick bills once, snapshots carry updated HP, and
// a second snapshot in the same second cannot buy a second repair.
let now = 100000;
const game = new Game({ now: () => now });
const joined = game.join({ code: 'CARE', name: 'Constructeur' });
const r = game.rooms.get('CARE');
r.groundDefense.structures.push(wall('room', [0, 0], [0.2, 0]));
const c = game.createVehicle(r, 'castor');
c.state.p = [0.12, 0.12, 0.05];
c.state.hp = 100;
c.supplies.fuel = 300;
c.supplies.ammo.pilot = 500;
r.dollars = 1;
const rev = r.groundDefense.revision;
now += 1000;
const one = game.snapshot(r);
const hp = r.groundDefense.structures[0].hp;
assert.equal(hp, 60, 'server paid service updates the wall once per second');
assert.ok(r.dollars < 1);
assert.equal(r.groundDefense.revision, rev + 1);
assert.equal(one.groundDefense.structures[0].hp, hp);
game.snapshot(r);
assert.equal(r.groundDefense.structures[0].hp, hp, 'no double repair for repeated snapshots');
assert.equal(r.groundDefense.navigationRevision, 0);
assert.equal(r.pilots.get(joined.id).id, joined.id);
console.log('Castor auto-repair: fixed stations, moving support, fairness, debt, room snapshots OK');
