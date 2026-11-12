import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { stepHelicopter, HELI } from '../src/helicopter.js';
import { VEHICLES, vehiclePad } from '../src/fleet.js';
import { stepTank } from '../src/tank.js';
import { MAP } from '../src/scale.js';
import { createCharacter, LANDING_DURATION, loadCharacter } from '../src/character-model.js';
import { makeServiceStation, animateRadar } from '../src/station-model.js';
import { seatReloads, reloadProgress } from '../src/reload-hud.js';
import { zoomTopView, TOP_VIEW_HEIGHT } from '../src/castor-top-view.js';
import { officeFogOpacity } from '../src/office-fog.js';

for (const hz of [30, 60, 120]) {
  const state = { ...vehiclePad('helicopter'), p: [0, 1, 0], q: [0, 0, 0, 1] };
  const tilt = () =>
    new T.Vector3(0, 1, 0)
      .applyQuaternion(new T.Quaternion().fromArray(state.q))
      .angleTo(new T.Vector3(0, 1, 0));
  stepHelicopter(T, state, { pitch: 1, roll: 1 }, [], 1 / hz, VEHICLES.helicopter);
  assert.ok(tilt() > 0 && tilt() < 0.1, 'tilt builds progressively');
  for (let i = 0; i < hz * 4; i++) {
    stepHelicopter(T, state, { pitch: 1, roll: 1 }, [], 1 / hz, VEHICLES.helicopter);
    assert.ok(tilt() <= Math.PI / 4 + 1e-8, 'diagonal tilt stays within 45 degrees');
  }
  for (let i = 0; i < hz * 4; i++)
    stepHelicopter(
      T,
      state,
      { pitch: 0, roll: 0, direction: [0, -0.8, -0.6] },
      [],
      1 / hz,
      VEHICLES.helicopter,
    );
  assert.ok(tilt() < 0.001, 'release levels even if mouse still points down');
}
for (const turn of [-1, 1]) {
  const yaws = [];
  for (const direction of [-1, 1]) {
    const state = { p: [0, 0.01, 0], v: [0, 0, -direction * MAP.metres(10)], q: [0, 0, 0, 1] };
    stepTank(T, state, { forward: direction, turn }, [], 1 / 60, VEHICLES.castor);
    yaws.push(new T.Euler().setFromQuaternion(new T.Quaternion().fromArray(state.q), 'YXZ').y);
  }
  assert.ok(yaws[0] * yaws[1] < 0, 'same steering input reverses yaw when backing up');
}
assert.equal(zoomTopView(TOP_VIEW_HEIGHT, 100000), TOP_VIEW_HEIGHT * Math.exp(0.12));
let height = TOP_VIEW_HEIGHT;
for (let i = 0; i < 100; i++) height = zoomTopView(height, 1);
assert.equal(height, 0.8, 'maximum height doubled');
for (let i = 0; i < 100; i++) height = zoomTopView(height, -1);
assert.equal(height, 0.15);
assert.equal(officeFogOpacity(0, 3), 0);
assert.equal(officeFogOpacity(3, 3), 0.85);
assert.ok(officeFogOpacity(2.9, 3) > officeFogOpacity(2, 3));
assert.equal(officeFogOpacity(0, 3), 0, 'descending clears haze');
for (const appearance of ['cowboy', 'frontier']) {
  await loadCharacter(appearance);
  const c = createCharacter(T, appearance);
  c.update(0.1, { falling: true });
  const arm = c.bones.mixamorigLeftArm;
  const free = arm.quaternion.clone();
  c.update(0.1, { falling: true, parachute: true });
  assert.ok(arm.quaternion.angleTo(free) > 0.1, 'suspended pose differs from freefall');
  c.update(0.1, { speed: 5 });
  assert.equal(c.gait(), 'idle', 'touchdown interrupts locomotion');
  for (let t = 0; t < LANDING_DURATION + 0.2; t += 0.05) c.update(0.05, { speed: 5 });
  assert.equal(c.gait(), 'run', 'locomotion resumes after short landing');
  assert.equal(c.container.children[0].position.y, 0, 'landing compression resets');
}
const radar = makeServiceStation(T, 'radar');
const base = radar.children[0];
const original = base.quaternion.clone();
animateRadar(radar, 1, false);
assert.equal(radar.userData.dish.rotation.y, 0);
animateRadar(radar, 1, true);
assert.equal(radar.userData.dish.rotation.y, 1);
assert.ok(base.quaternion.equals(original), 'base fixed as antenna rotates');
for (const kind of ['refuel', 'radar']) {
  const model = makeServiceStation(T, kind);
  assert.ok(Math.abs(new T.Box3().setFromObject(model).min.y) < 0.001, 'station rests on floor');
  assert.ok(
    model.children.every((g) => !g.children[0].geometry.type.includes('Ring')),
    'no ground circle',
  );
}
const tank = { id: 't', type: 'tank', state: { hp: 100 }, lastHeavy: { cannon: 1000 } };
const arcs = seatReloads({ vehicle: tank, seat: 'cannon', now: 2000, automaticCooldown: 0.03 });
assert.deepEqual(
  arcs.map((a) => a.weapon),
  ['coax', 'he'],
);
assert.ok(Math.abs(arcs[0].progress - 0.5) < 1e-8 && arcs[1].progress === 0.5);
assert.deepEqual(
  seatReloads({ vehicle: tank, seat: 'pilot', now: 2000 }).map((a) => a.weapon),
  ['pilot'],
  'changing seats removes inaccessible weapons',
);
const hind = { ...tank, type: 'helicopter', nextMissileAt: 4000 };
assert.equal(seatReloads({ vehicle: hind, seat: 'copilot', now: 3000 })[1].progress, 0.5);
assert.equal(
  seatReloads({ vehicle: hind, seat: 'copilot', now: 9000, missileInFlight: true })[1].progress,
  0,
);
assert.equal(reloadProgress(4000, 4000, 2000), 1, 'full circle exactly when ready');
console.log(
  'Game polish: diagonal tilt/release, reverse steering, zoom, altitude haze, character phases, articulated stations and independent seat reloads OK',
);

const turning = {
  ...vehiclePad('helicopter'),
  p: [0, 1, 0],
  q: new T.Quaternion()
    .setFromAxisAngle(new T.Vector3(Math.cos(0.3), 0, Math.sin(0.3)), Math.PI / 4)
    .toArray(),
};
for (let i = 0; i < 120; i++) {
  stepHelicopter(
    T,
    turning,
    { pitch: Math.cos(4.8), roll: Math.sin(4.8), direction: [-Math.sin(2.8), 0, -Math.cos(2.8)] },
    [],
    1 / 60,
    VEHICLES.helicopter,
  );
  const up = new T.Vector3(0, 1, 0).applyQuaternion(new T.Quaternion().fromArray(turning.q));
  assert.ok(
    up.angleTo(new T.Vector3(0, 1, 0)) <= Math.PI / 4 + 1e-8,
    'tilt stays bounded through a large heading change',
  );
}
