// Biplane fighter and bomber: models (every triangle, shared buffers, livery, prop,
// gunner mount) and the gameplay numbers asked for when they replaced the M1 / B3.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { paintVehicle } from '../src/vehicle-livery.js';
import { BIPLANE_DATA } from '../src/meshy-biplane-data.js';
import { BIPLANE_BOMBER_DATA } from '../src/meshy-biplane-bomber-data.js';
import { VEHICLES, pilotFireInterval, SEAT_NAMES } from '../src/fleet.js';
import { ammoCapacity, fullAmmo } from '../src/logistics.js';
import { HEAVY, heavyInterval, canUseWeapon } from '../src/armament.js';
import { stepFlight } from '../src/flight.js';
import { ACTOR_UNIT, MAP } from '../src/scale.js';

const graphics = createGraphics(T, new T.Scene());
const triangles = (model) => {
  let count = 0;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    count += (g.index?.count || g.attributes.position.count) / 3;
    for (const attr of Object.values(g.attributes)) assert.ok(attr.array.every(Number.isFinite));
  });
  return count;
};
for (const [make, data, name] of [
  ['makePlane', BIPLANE_DATA, 'fighter'],
  ['makeBomber', BIPLANE_BOMBER_DATA, 'bomber'],
]) {
  const a = graphics[make]('#7b8155'),
    b = graphics[make]('#7b8155');
  assert.equal(triangles(a), data.triangles, name + ' keeps every source triangle');
  const first = (m) => {
    let mesh;
    m.traverse((o) => o.isMesh && !mesh && (mesh = o));
    return mesh;
  };
  assert.equal(first(a).geometry, first(b).geometry, name + ' shares immutable buffers');
  assert.ok(first(a).geometry.attributes.uv && first(a).material.map, name + ' Meshy atlas');
  assert.equal(first(a).material.map.colorSpace, T.SRGBColorSpace);
  assert.ok(data.texture.startsWith('data:image/jpeg;base64,/9j/'));
  const draws = [];
  a.traverse((o) => o.isMesh && draws.push(o));
  assert.ok(draws.length <= 8, name + ' bounded draw calls');
  // Independent, visible propeller animation.
  assert.notEqual(a.userData.prop, b.userData.prop);
  const blade = a.userData.prop.children[0];
  a.updateMatrixWorld(true);
  const vertex = new T.Vector3().fromBufferAttribute(blade.geometry.attributes.position, 0);
  const before = blade.localToWorld(vertex.clone());
  a.userData.prop.rotation.z += 0.7;
  a.updateMatrixWorld(true);
  assert.ok(blade.localToWorld(vertex.clone()).distanceTo(before) > 0.01);
  assert.equal(b.userData.prop.rotation.z, 0);
  // Livery keeps the Meshy camouflage and adds no marker (#106).
  const materials = draws.map((m) => m.material);
  paintVehicle(T, a, 7, '#7b8155');
  assert.ok(a.userData.preserveTexture && a.userData.identification === undefined);
  assert.deepEqual(
    draws.map((m) => m.material),
    materials,
  );
  // Wheels on the ground at the gear height.
  b.scale.setScalar(ACTOR_UNIT);
  b.position.y = VEHICLES[name].gear;
  b.updateMatrixWorld(true);
  assert.ok(Math.abs(new T.Box3().setFromObject(b).min.y) < 1e-5, name + ' wheel contact');
  // Collision footprint matches the drawn model.
  const box = new T.Box3()
    .setFromObject(b)
    .getSize(new T.Vector3())
    .multiplyScalar(1 / MAP.metres(1));
  assert.ok(Math.abs(box.x - VEHICLES[name].span) < 0.3, `${name} span ${box.x}`);
  assert.ok(Math.abs(box.z - VEHICLES[name].length) < 0.6, `${name} length ${box.z}`);
}

// Fighter: one central gun. Its fire matches ONE gun of the light fighter, so half the DPS.
const fighter = VEHICLES.fighter,
  light = VEHICLES.interceptor; // derived from the original light-fighter reference
assert.equal(graphics.makePlane().userData.pilotMuzzles.length, 1);
assert.equal(
  pilotFireInterval('fighter'),
  0.12,
  'half the rate of fire of the 0.06 s light fighter',
);
assert.equal(pilotFireInterval('spitfire'), 0.06, 'other planes unchanged');
assert.equal(ammoCapacity('fighter', 'pilot'), 500, 'still a minute of fire');
assert.equal(ammoCapacity('spitfire', 'pilot'), 1000);
assert.equal(fighter.maxSpeed, 70 * 0.75, '25 % slower top speed');
assert.equal(VEHICLES.spitfire.maxSpeed, 70 * 1.75, 'derived planes keep the light fighter base');
assert.equal(VEHICLES.helicopter.maxSpeed, 70 * 0.6);
assert.equal(light.thrust, 9);

// Level top speed is 25 % below the light fighter's; control and lift last to lower speeds.
const base = { ...VEHICLES.spitfire, thrust: 12, maxSpeed: 70, turn: 1 };
const state = (profile, velocity, gas = 1) => ({
  q: new T.Quaternion(),
  vel: new T.Vector3(...velocity),
  omega: new T.Vector3(),
  wind: new T.Vector3(),
  gas,
  wing: 1,
  engine: 1,
  pitch: 0,
  roll: 0,
  yaw: 0,
  profile,
  scale: 1,
});
const levelSpeed = (profile) => {
  const s = state(profile, [0, 0, -30]);
  let altitude = 0;
  for (let i = 0; i < 40 * 120; i++) {
    s.pitch = Math.max(-1, Math.min(1, -0.25 * s.vel.y - 0.02 * altitude));
    stepFlight(T, s, 1 / 120);
    altitude += s.vel.y / 120;
  }
  return s.vel.length();
};
const top = levelSpeed(fighter) / levelSpeed(base);
assert.ok(top > 0.72 && top < 0.78, `top speed ratio ${top.toFixed(3)}`);
// Later stall: more control at low speed, stall angle reached later, lower minimum level speed.
const authority = (profile) => stepFlight(T, state(profile, [0, 0, -9], 0.3), 1 / 120).authority;
assert.ok(authority(fighter) > authority(base) * 1.3, 'more control at low speed');
const stall = (profile) => stepFlight(T, state(profile, [0, -4, -10], 0.3), 1 / 120);
assert.ok(stall(base).stall < 0.9 && stall(fighter).stall === 1, 'no stall at 0.38 rad of attack');
const minimumLevel = (p) => Math.sqrt(8 / (p.liftBase + 0.12 * (p.stallAngle ?? 0.3)));
assert.ok(minimumLevel(fighter) < minimumLevel(base) * 0.85, 'holds level flight slower');

// Bomber: pilot and one gunner, 30 bombs in the bay dropped half as fast, other stats unchanged.
const bomber = VEHICLES.bomber;
assert.deepEqual(bomber.seats, ['pilot', 'dorsal']);
assert.equal(SEAT_NAMES.dorsal, 'Mitrailleur dorsal');
assert.equal(ammoCapacity('bomber', 'bomb'), 30);
assert.deepEqual(Object.keys(fullAmmo('bomber')), ['pilot', 'dorsal', 'bomb']);
assert.equal(ammoCapacity('bomber', 'pilot'), 0, 'the bomber pilot has no gun');
assert.ok(ammoCapacity('bomber', 'dorsal') > 0);
assert.equal(heavyInterval('bomb', 'bomber'), HEAVY.bomb.interval * 2);
assert.equal(heavyInterval('bomb', 'interceptor'), HEAVY.bomb.interval, 'Stuka rack unchanged');
assert.equal(ammoCapacity('interceptor', 'bomb'), 6);
assert.ok(canUseWeapon('bomber', 'pilot', 'bomb') && canUseWeapon('bomber', 'dorsal', 'dorsal'));
assert.ok(!canUseWeapon('bomber', 'pilot', 'pilot'));
assert.equal(
  [bomber.maxSpeed, bomber.thrust, bomber.drag, bomber.liftBase, bomber.turn].join(),
  [52.5, 8, 0.0045, 0.0048, 0.62].join(),
  'same flight stats as the B3',
);
console.log(
  'Biplanes: models, one central gun at half rate, slower but stall-resistant, 2-seat bomber',
);
