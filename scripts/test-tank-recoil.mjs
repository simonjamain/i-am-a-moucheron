// Tank main gun: visual recoil of the barrel, physical kick on the hull, gunner's view over the
// shoulder, and a tank left alone that stands still.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { VEHICLES, vehicleUnit } from '../src/fleet.ts';
import { loadRapier } from '../src/physics-world.ts';
import { TankRig } from '../src/tank-physics.ts';
import { GUN_RECOIL, applyGunRecoil, recoilAmount } from '../src/tank-recoil.ts';
import { tankSight, SIGHT } from '../src/tank-view.js';
import { aimGun } from '../src/sortie.js';

// Profile: quick back, slower return, nothing before the shot.
assert.equal(recoilAmount(-1), 0);
assert.equal(recoilAmount(0), 0);
assert.equal(recoilAmount(GUN_RECOIL.back), 1);
assert.ok(recoilAmount(GUN_RECOIL.back + 0.1) < 1 && recoilAmount(GUN_RECOIL.back + 0.1) > 0.5);
assert.equal(recoilAmount(GUN_RECOIL.back + GUN_RECOIL.ret), 0);

// The barrel slides back along its own axis, level or elevated, and returns to battery.
const tank = createGraphics(T, new T.Scene()).makeTank('#777');
tank.scale.setScalar(vehicleUnit('tank'));
const mount = tank.userData.turrets[0],
  gun = mount.userData.pitch;
for (const pitch of [0, 0.4]) {
  gun.rotation.x = pitch;
  applyGunRecoil(gun, 0);
  tank.updateMatrixWorld(true);
  const rest = gun.getWorldPosition(new T.Vector3());
  applyGunRecoil(gun, 1);
  tank.updateMatrixWorld(true);
  const kicked = gun.getWorldPosition(new T.Vector3());
  const back = kicked.clone().sub(rest),
    axis = new T.Vector3(0, 0, 1).applyEuler(new T.Euler(pitch, 0, 0));
  assert.ok(Math.abs(back.length() - GUN_RECOIL.travel * vehicleUnit('tank')) < 1e-9, 'travel');
  assert.ok(back.normalize().distanceTo(axis) < 1e-9, 'along the barrel, pitch ' + pitch);
  applyGunRecoil(gun, 0);
  tank.updateMatrixWorld(true);
  assert.ok(gun.getWorldPosition(new T.Vector3()).distanceTo(rest) < 1e-12, 'back to battery');
}

// Gunner's view: behind, above and left of the pivot, looking along the aim; the barrel is ahead
// and to the right of the eye, and does not move with the recoil.
gun.rotation.x = 0;
applyGunRecoil(gun, 0);
tank.updateMatrixWorld(true);
const dir = new T.Vector3(0, 0, -1),
  up = new T.Vector3(0, 1, 0);
const sight = tankSight(T, mount, dir, up);
const pivot = mount.localToWorld(new T.Vector3(...gun.userData.restPosition));
const rel = sight.eye.clone().sub(pivot).divideScalar(vehicleUnit('tank'));
assert.ok(Math.abs(rel.z - SIGHT.behind) < 1e-9 && Math.abs(rel.y - SIGHT.above) < 1e-9);
assert.ok(rel.x < 0, 'to the left of the barrel');
applyGunRecoil(gun, 1);
tank.updateMatrixWorld(true);
assert.ok(tankSight(T, mount, dir, up).eye.distanceTo(sight.eye) < 1e-12, 'the eye ignores recoil');
// The muzzle, ahead of the eye, is below the sight line: the barrel is in the picture.
const muzzle = mount.userData.muzzle.getWorldPosition(new T.Vector3());
const view = new T.PerspectiveCamera(60, 16 / 9, 0.001, 10);
view.position.copy(sight.eye);
view.lookAt(sight.target);
view.updateMatrixWorld(true);
const seen = muzzle.clone().project(view);
assert.ok(
  Math.abs(seen.x) < 1 && seen.y < 0 && seen.y > -1,
  'barrel in view, below the centre: ' + seen.toArray(),
);

// Physics: a tank left alone stands still; a round pushes the hull back and pitches it.
const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const profile = VEHICLES.tank,
  DT = 1 / 60;
const rig = new TankRig(RAPIER);
const state = { p: [0, profile.gear, 0], q: [0, 0, 0, 1], v: [0, 0, 0], hp: 100 };
for (let i = 0; i < 8 * 60; i++) rig.step(state, { forward: 1, turn: 0 }, [], DT, profile);
assert.ok(Math.hypot(...state.v) > 0.05, 'driving');
for (let i = 0; i < 6 * 60; i++) rig.step(state, {}, [], DT, profile);
const stopped = [...state.p];
assert.equal(state.v[0], 0);
assert.equal(state.v[2], 0, 'no creep once stopped');
for (let i = 0; i < 20 * 60; i++) rig.step(state, {}, [], DT, profile);
assert.ok(Math.hypot(state.p[0] - stopped[0], state.p[2] - stopped[2]) < 1e-6, 'stays put');

const before = [...state.p];
rig.kick([0, 0.1, -1]);
let backward = 0,
  pitch = 0;
for (let i = 0; i < 120; i++) {
  rig.step(state, {}, [], DT, profile);
  backward = Math.max(backward, state.v[2]);
  pitch = Math.max(pitch, Math.abs(state.q[0]));
}
assert.ok(backward > 0, 'pushed backwards (the shot goes to -z)');
assert.ok(pitch > 0.005, 'the hull rocks: ' + pitch);
assert.ok(state.p[2] > before[2], 'moved back');
console.log('tank recoil ok');
