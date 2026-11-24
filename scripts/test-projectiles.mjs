import assert from 'node:assert/strict';
import { PROJECTILES, projectileDamage } from '../src/projectiles.ts';
import { HEAVY, TANK_MG, CASTOR_GUN_DAMAGE } from '../src/armament.ts';
import { RAPID_DCA_DAMAGE } from '../src/fixed-dca.ts';
import { HELI } from '../src/helicopter.ts';
import { MAP, REFERENCE, FLAK } from '../src/scale.ts';

// The catalogue must keep every weapon exactly as it was before (values frozen here).
const m = MAP.metres;
const expected = {
  rocket: { interval: 0.3, damage: 120, edge: 30, radius: m(12), speed: m(180), lifetime: 9 },
  missile: { interval: 0, damage: 360, edge: 70, radius: m(30), speed: m(100), lifetime: 15 },
  proximity: {
    interval: 0.8,
    damage: 80,
    edge: 20,
    radius: m(FLAK.lightRadius),
    speed: m(REFERENCE.shell * 0.7),
    lifetime: 9,
  },
  dcaHeavy: {
    interval: 1,
    damage: 240,
    edge: 60,
    radius: m(40),
    speed: m(REFERENCE.shell * 0.7),
    lifetime: 9,
  },
  bomb: { interval: 0.5, damage: 240, edge: 60, radius: m(20), speed: 0, lifetime: 52.5 },
  he: { interval: 2, damage: 320, edge: 30, radius: m(20), speed: m(320), lifetime: 19.5 },
  ap: { interval: 2, damage: 800, edge: 0, radius: 0, speed: m(600), lifetime: 12 },
  antitank: { interval: 1.8, damage: 800, edge: 90, radius: m(5), speed: m(750), lifetime: 12 },
};
assert.deepEqual({ ...HEAVY }, expected);
assert.deepEqual(Object.fromEntries(Object.entries(TANK_MG).map(([k, v]) => [k, v.damage])), {
  pilot: 33,
  top: 75,
  coax: 50,
});
assert.equal(CASTOR_GUN_DAMAGE, 40);
assert.equal(RAPID_DCA_DAMAGE, 62);
assert.equal(HELI.gunDamage, 75);
for (const [name, weapon] of Object.entries(TANK_MG))
  assert.equal(PROJECTILES[weapon.projectile].damage, weapon.damage, 'tank gun ' + name);
assert.equal(PROJECTILES.mg.speed, REFERENCE.bullet);
assert.equal(PROJECTILES.mg.lifetime, 3, 'bullets fly 50 % longer');
assert.equal(PROJECTILES.flak.speed, REFERENCE.shell);
assert.equal(PROJECTILES.flak.lifetime, 4.5);

// Every type is frozen and complete.
for (const [name, p] of Object.entries(PROJECTILES)) {
  assert.ok(Object.isFrozen(p), name);
  for (const key of [
    'damage',
    'edge',
    'radius',
    'speed',
    'lifetime',
    'speedExponent',
    'ricochetMaxAngle',
  ])
    assert.ok(Number.isFinite(p[key]) && p[key] >= 0, name + '.' + key);
  assert.ok(['bullet', 'shell', null].includes(p.drag), name);
}

// Damage follows speed by the type's exponent: kinetic bullet yes, bomb no.
assert.equal(projectileDamage('mg'), 75);
assert.equal(projectileDamage('mg', PROJECTILES.mg.speed / 2), 37.5);
assert.equal(projectileDamage('bomb', 40), PROJECTILES.bomb.damage);
assert.equal(projectileDamage('mg', -5), 0);
console.log('PASS: projectile catalogue keeps every weapon; damage follows speed by exponent.');
