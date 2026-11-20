import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MAP, mapScale, ACTOR_UNIT, HUMAN_SCALE, REFERENCE, FLAK } from '../src/scale.ts';
import { VEHICLES, vehiclePad, vehicleEntry } from '../src/fleet.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { createGraphics } from '../src/graphics.js';
import { createOffice } from '../src/office.js';
import { stepFlight } from '../src/flight.ts';
import { spreadDirection, fuseRange, blastDamage, diveIntensity } from '../src/combat.ts';
import { makeAntiaircraft, AA_STATIONS } from '../src/sortie.js';
import { bodyMotion } from '../src/purgatory-physics.js';
assert.equal(MAP.ratio, 0.003);
assert.equal(MAP.metres(1.8), 0.0054);
assert.equal(OFFICE_LAYOUT.base.deckY, 0.00005);
for (const n of [1, 2, 3, 100]) {
  const scale = mapScale(n, 1000);
  assert.equal(scale.reference(scale.metres(100)), 100);
}
assert.throws(() => mapScale(-1));
function flight(ratio, type) {
  return {
    q: new T.Quaternion(),
    vel: new T.Vector3(0, 0, -20 * ratio),
    wind: new T.Vector3(),
    omega: new T.Vector3(),
    gas: 1,
    wing: 1,
    engine: 1,
    pitch: 0,
    roll: 0,
    yaw: 0,
    scale: ratio,
    profile: VEHICLES[type],
  };
}
const full = flight(1, 'fighter'),
  small = flight(MAP.ratio, 'fighter'),
  bomber = flight(MAP.ratio, 'bomber');
for (let i = 0; i < 240; i++) {
  stepFlight(T, full, 1 / 120);
  stepFlight(T, small, 1 / 120);
  stepFlight(T, bomber, 1 / 120);
  assert.ok(full.vel.clone().sub(small.vel.clone().divideScalar(MAP.ratio)).length() < 1e-8);
}
// The biplane fighter is 25 % slower than the light fighter it replaced; its level speed
// (after the acceleration phase) is still above the bomber's, whose cap is the same.
for (let i = 0; i < 28 * 120; i++) {
  stepFlight(T, small, 1 / 120);
  stepFlight(T, bomber, 1 / 120);
}
assert.ok(bomber.vel.length() < small.vel.length());
assert.ok(VEHICLES.bomber.maxSpeed <= VEHICLES.fighter.maxSpeed);
assert.ok(REFERENCE.enemy < VEHICLES.fighter.maxSpeed / 3);
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  office = createOffice(T, scene, { ...graphics, textLabel: () => new T.Group() });
const human = graphics.humanoid('#fff');
human.scale.setScalar(HUMAN_SCALE);
scene.add(human);
assert.ok(Math.abs(new T.Box3().setFromObject(human).max.y - MAP.metres(1.8)) < 1e-7);
assert.ok(office.colliders.length > 20);
for (const object of office.solidObjects) {
  const box = new T.Box3().setFromObject(object);
  assert.ok(!box.isEmpty());
  assert.ok(office.colliders.some((c) => c.containsBox(box)));
}
const guns = makeAntiaircraft(T, scene, graphics);
for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
  for (const pitch of [0, 0.5, 1.2]) {
    const g = guns[0];
    g.userData.yaw.rotation.y = yaw;
    g.userData.pitch.rotation.x = pitch;
    g.updateWorldMatrix(true, true);
    const left = g.userData.muzzles[0].getWorldPosition(new T.Vector3()),
      right = g.userData.muzzles[1].getWorldPosition(new T.Vector3());
    assert.ok(Math.abs(left.distanceTo(right) - 0.72 * MAP.ratio) < 1e-8);
    const actual = new T.Vector3(0, 0, -1).transformDirection(g.userData.pitch.matrixWorld),
      expected = new T.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
    assert.ok(actual.distanceTo(expected) < 1e-8);
  }
for (let i = 0; i < 100; i++) {
  const dir = spreadDirection(T, new T.Vector3(0, 0, -1));
  assert.ok(dir.angleTo(new T.Vector3(0, 0, -1)) <= 0.00301);
  assert.ok(Math.abs(dir.length() - 1) < 1e-12);
}
assert.equal(fuseRange(-10), 100);
assert.equal(fuseRange(9999), 1200);
assert.equal(FLAK.interval, 0.7);
assert.equal(blastDamage(MAP.metres(FLAK.radius)), 20);
assert.equal(blastDamage(0), 80);
assert.equal(diveIntensity(70, 0.2, 70), 0);
assert.ok(diveIntensity(70, -0.9, 70) > 0.9);
console.log(
  'PASS: SI map ratios, 5.4mm character, scale-invariant flight, slower bomber, solid decor, true twin muzzles, dispersion, fuse safety and dive siren.',
);
