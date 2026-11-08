import assert from 'node:assert/strict';
import { Game, initialStation } from '../server/game.js';
import { PISTOL_CAPACITY } from '../src/ground-ammo.js';

// The pistol only exists in purgatory: each incarnation has a finite magazine,
// nobody fires on foot in the office and no office service sells rounds.
let now = 100000;
const game = new Game({ now: () => now });
const joined = game.join({ code: 'PISTOL', name: 'Tireuse' });
const r = game.rooms.get('PISTOL'),
  p = r.pilots.get(joined.id);
assert.equal(PISTOL_CAPACITY, 120);
assert.equal(p.pistolAmmo, PISTOL_CAPACITY);
const trigger = (shot) =>
  game.command('PISTOL', p.id, 'pistol-trace', {
    shot,
    incarnation: p.incarnation,
    origin: [0, 0, 0],
    direction: [0, 0, -1],
  });
assert.throws(() => trigger('office'), /bureau/);
assert.equal(p.pistolAmmo, PISTOL_CAPACITY, 'refused office shot consumes nothing');
assert.throws(() => game.pistolImpact(r, p, 'office'), /non validé/);
p.pistolAmmo = 3;
r.dollars = 50;
const station = initialStation();
game.playerPosition = () => [station.x, station.y, station.z]; // standing on the station
r.lastPaidServiceAt = now - 5000;
game.fleet(r);
assert.equal(p.pistolAmmo, 3, 'office stations do not refill a pistol');
game.kill(r, p, p.incarnation);
assert.equal(p.pistolAmmo, PISTOL_CAPACITY, 'new purgatory incarnation has finite fresh stock');
assert.equal(p.life, 'dead');
game.command('PISTOL', p.id, 'enter-purgatory', { incarnation: p.incarnation });
trigger('first');
assert.equal(p.pistolAmmo, PISTOL_CAPACITY - 1);
trigger('first');
assert.equal(p.pistolAmmo, PISTOL_CAPACITY - 1, 'retry does not consume ammo');
assert.equal(game.pistolImpact(r, p, 'first'), true);
assert.equal(game.pistolImpact(r, p, 'first'), false);
assert.throws(() => game.pistolImpact(r, p, 'forged'), /non validé/);
p.pistolAmmo = 0;
assert.throws(() => trigger('empty'), /court de munitions/);
const before = p.incarnation;
game.command('PISTOL', p.id, 'reset', { epoch: r.base.epoch });
assert.equal(p.incarnation, before + 1);
assert.equal(p.pistolAmmo, PISTOL_CAPACITY);
console.log(
  'Pistol: purgatory only, finite magazine, idempotence, impact receipts, no office refill, reset OK',
);
