// Issue #101: a voted plan bought from the common bank applies automatically to
// every compatible object of every player, existing and future, without picking one.
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { equippedLevel } from '../src/wave-blueprints.js';

let now = 300000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'GLOBAL', name: 'A' });
const b = game.join({ code: 'GLOBAL', name: 'B' });
const r = game.rooms.get('GLOBAL');
r.dollars = 100;
const foot = (id, x, z) => {
  const body = game.base(r, r.pilots.get(id));
  body.x = (x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
  body.z = (OFFICE_LAYOUT.base.originZ - z) / ACTOR_UNIT;
  body.y = 0.0007;
  body.grounded = true;
  body.parachute = false;
};
const send = (id, path, body) => game.command('GLOBAL', id, path, { epoch: r.base.epoch, ...body });
foot(a.id, 0, 0);
foot(b.id, 1, 1);
// Each player builds their own objects before any purchase.
send(a.id, 'ground-defense', { action: 'build', kind: 'sugar', a: [0, 0] });
send(b.id, 'ground-defense', { action: 'build', kind: 'sugar', a: [1, 1] });
send(a.id, 'ground-defense', { action: 'build', kind: 'barricade', a: [0.1, 0.1], b: [0.3, 0.1] });
const sugars = () => r.groundDefense.structures.filter((s) => s.kind === 'sugar');
const walls = () => r.groundDefense.structures.filter((s) => s.kind === 'barricade');
const radius = sugars()[0].radius;
const wallHp = walls()[0].maxHp;
const fighter = game.createVehicle(r, 'fighter');

// Plans won by vote: two levels of lure, one of reinforced and piercing.
r.blueprintLevels = { lure: 2, reinforced: 1, piercing: 1, bunker: 1 };
const before = r.dollars;
let snap = send(b.id, 'wave-buy', { blueprint: 'lure', level: 1 });
assert.equal(r.dollars, before - 2, 'paid once from the common bank');
assert.ok(
  sugars().every((s) => Math.abs(s.radius - (radius + 0.1)) < 1e-12),
  'all sugars, all players',
);
assert.deepEqual(snap.activeBlueprints, { lure: 1 });
// Concurrent purchase of the same level: second one refused, no double debit.
assert.throws(() => send(a.id, 'wave-buy', { blueprint: 'lure', level: 1 }), /périmé/);
assert.equal(r.dollars, before - 2);
send(a.id, 'wave-buy', { blueprint: 'lure', level: 2 });
assert.ok(
  sugars().every((s) => Math.abs(s.radius - (radius + 0.2)) < 1e-12),
  'levels stack',
);
assert.throws(
  () => send(a.id, 'wave-buy', { blueprint: 'lure', level: 3 }),
  /périmé/,
  'not unlocked',
);
assert.throws(() => send(a.id, 'wave-buy', { blueprint: 'bunker', level: 1 }), /Castor/);
assert.throws(() => send(a.id, 'wave-buy', { blueprint: 'adhesive', level: 1 }), /non débloqué/);

send(b.id, 'wave-buy', { blueprint: 'reinforced', level: 1 });
assert.ok(walls().every((w) => w.maxHp === wallHp + 100 && w.hp === wallHp + 100));
send(a.id, 'wave-buy', { blueprint: 'piercing', level: 1 });
assert.equal(equippedLevel(fighter, 'piercing'), 1, 'existing vehicle');

// Future objects inherit every purchased level at creation, whoever builds them.
send(b.id, 'ground-defense', { action: 'build', kind: 'sugar', a: [1.1, 1.1] });
assert.ok(
  sugars().every((s) => Math.abs(s.radius - (radius + 0.2)) < 1e-12),
  'new sugar too',
);
send(b.id, 'ground-defense', { action: 'build', kind: 'barricade', a: [1, 0.8], b: [1.3, 0.8] });
assert.ok(
  walls().every((w) => w.maxHp === wallHp + 100),
  'new barricade segments too',
);
const tank = game.createVehicle(r, 'tank');
assert.equal(equippedLevel(tank, 'piercing'), 1, 'new vehicle too');
assert.equal(equippedLevel(game.createVehicle(r, 'castor'), 'piercing'), 0, 'incompatible ignored');
assert.ok(
  sugars().every((s) => equippedLevel(s, 'lure') === 2),
  'never applied twice',
);

// Insufficient bank: refused without changes.
r.dollars = 1;
r.blueprintLevels.reinforced = 2;
assert.throws(() => send(a.id, 'wave-buy', { blueprint: 'reinforced', level: 2 }), /insuffisante/);
assert.equal(r.activeBlueprints.reinforced, 1);

// Late arrival sees the team's active plans; a reset clears them.
const c = game.join({ code: 'GLOBAL', name: 'C' });
snap = game.command('GLOBAL', c.id, 'sync', { state: r.pilots.get(c.id).state, mode: 'foot' });
assert.deepEqual(snap.activeBlueprints, { lure: 2, reinforced: 1, piercing: 1 });
snap = send(a.id, 'reset', {});
assert.deepEqual(snap.activeBlueprints, {});
assert.deepEqual(snap.blueprintLevels, {});
console.log(
  'Global upgrades: one team purchase, all existing and future objects, no double debit, reset.',
);
