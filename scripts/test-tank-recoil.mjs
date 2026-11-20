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
import { MODEL_DATA } from '../src/meshy-tank-data.js';
import { VEHICLE_ANCHORS } from '../src/vehicle-anchors.js';

// Profile: quick back, slower return, nothing before the shot.
assert.equal(recoilAmount(-1), 0);
assert.equal(recoilAmount(0), 0);
assert.equal(recoilAmount(GUN_RECOIL.back), 1);
assert.ok(recoilAmount(GUN_RECOIL.back + 0.1) < 1 && recoilAmount(GUN_RECOIL.back + 0.1) > 0.5);
assert.equal(recoilAmount(GUN_RECOIL.back + GUN_RECOIL.ret), 0);

// The pivot is at the front of the turret, at the base of the barrel; only the barrel tube slides
// back along its own axis (level or elevated), the mantlet stays, and it returns to battery.
const tank = createGraphics(T, new T.Scene()).makeTank('#777');
tank.scale.setScalar(vehicleUnit('tank'));
const mount = tank.userData.turrets[0],
  gun = mount.userData.pitch,
  barrel = mount.userData.barrel;
assert.equal(barrel.parent, gun, 'the tube is a child of the pitching gun');
{
  const nodes = (n) => MODEL_DATA.rig.find((r) => r.name === n);
  const turretFront = nodes('cannon').pivot[2] - 0.9;
  assert.ok(
    Math.abs(nodes('cannonGun').pivot[2] - turretFront) < 1e-9,
    'pivot at the turret front',
  );
  assert.ok(
    nodes('cannonGun').pivot[2] < nodes('cannon').pivot[2],
    'in front of the turret centre',
  );
  assert.equal(VEHICLE_ANCHORS.tank.gunPivot[2], nodes('cannonGun').pivot[2], 'shell origin pivot');
}
const mantlet = gun.children.find((c) => c.isMesh);
assert.ok(
  mantlet && barrel.children.some((c) => c.isMesh),
  'mantlet on the pivot, tube on its node',
);
for (const pitch of [0, 0.4]) {
  gun.rotation.x = pitch;
  applyGunRecoil(barrel, 0);
  tank.updateMatrixWorld(true);
  const rest = barrel.getWorldPosition(new T.Vector3()),
    mantletRest = mantlet.getWorldPosition(new T.Vector3());
  applyGunRecoil(barrel, 1);
  tank.updateMatrixWorld(true);
  const kicked = barrel.getWorldPosition(new T.Vector3());
  const back = kicked.clone().sub(rest),
    axis = new T.Vector3(0, 0, 1).applyEuler(new T.Euler(pitch, 0, 0));
  assert.ok(Math.abs(back.length() - GUN_RECOIL.travel * vehicleUnit('tank')) < 1e-9, 'travel');
  assert.ok(back.normalize().distanceTo(axis) < 1e-9, 'along the barrel, pitch ' + pitch);
  assert.ok(
    mantlet.getWorldPosition(new T.Vector3()).distanceTo(mantletRest) < 1e-12,
    'mantlet stays',
  );
  applyGunRecoil(barrel, 0);
  tank.updateMatrixWorld(true);
  assert.ok(barrel.getWorldPosition(new T.Vector3()).distanceTo(rest) < 1e-12, 'back to battery');
}

// Gunner's view: behind and above the pivot on the barrel axis, looking along the aim; it ignores
// the recoil.
gun.rotation.x = 0;
applyGunRecoil(barrel, 0);
tank.updateMatrixWorld(true);
const dir = new T.Vector3(0, 0, -1),
  up = new T.Vector3(0, 1, 0);
const sight = tankSight(T, mount, dir, up);
const pivot = gun.getWorldPosition(new T.Vector3());
const rel = sight.eye.clone().sub(pivot).divideScalar(vehicleUnit('tank'));
assert.ok(Math.abs(rel.z - SIGHT.behind) < 1e-9 && Math.abs(rel.y - SIGHT.above) < 1e-9);
assert.equal(rel.x, 0, 'on the barrel axis');
applyGunRecoil(barrel, 1);
tank.updateMatrixWorld(true);
assert.ok(tankSight(T, mount, dir, up).eye.distanceTo(sight.eye) < 1e-12, 'the eye ignores recoil');
applyGunRecoil(barrel, 0);
tank.updateMatrixWorld(true);
// Nothing hides the barrel from the eye: rays to points along it meet no other part of the tank
// (the turret hides it from low eyes, the roof machine gun from eyes beside it).
{
  const pivotWorld = barrel.getWorldPosition(new T.Vector3());
  const box = new T.Box3().setFromObject(barrel);
  const blockers = [];
  tank.traverse((o) => {
    let p = o,
      inGun = false;
    while (p) {
      if (p === gun) inGun = true;
      p = p.parent;
    }
    if (o.isMesh && !inGun) blockers.push(o);
  });
  const ray = new T.Raycaster();
  let clear = 0;
  for (const t of [0.5, 0.65, 0.8, 0.95]) {
    const point = new T.Vector3(
      pivotWorld.x,
      pivotWorld.y,
      box.min.z + (box.max.z - box.min.z) * t,
    );
    const d = point.clone().sub(sight.eye);
    ray.set(sight.eye, d.clone().normalize());
    ray.far = d.length() - 1e-6;
    if (!ray.intersectObjects(blockers, false).length) clear++;
  }
  assert.ok(clear >= 3, 'the barrel is in the clear: ' + clear + '/4 points');
}
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

// Elevation stop: the main gun rises to 30° at most, in the hull's frame, also on the server.
{
  const { Game } = await import('../server/game.js');
  const { TANK_GUN_MAX_PITCH } = await import('../src/armament.ts');
  assert.ok(Math.abs(TANK_GUN_MAX_PITCH - Math.PI / 6) < 1e-12, '30 degrees');
  let now = 100000;
  const game = new Game({ now: () => now, solids: [] });
  const joined = game.join({ code: 'ELEV', name: 'Tireur' }),
    room = game.rooms.get('ELEV'),
    gunner = room.pilots.get(joined.id);
  const car = game.createVehicle(room, 'tank');
  car.state.p = [1, 1, 1];
  car.state.q = [0, 0, 0, 1];
  game.assign(room, gunner, car, 'cannon', null);
  const shoot = (shot, degrees) => {
    gunner.seen = now;
    const a = (degrees * Math.PI) / 180;
    return game.command(room.code, joined.id, 'heavy-fire', {
      vehicle: car.id,
      occupation: gunner.occupation,
      weapon: 'he',
      shot,
      direction: [0, Math.sin(a), -Math.cos(a)],
    });
  };
  assert.throws(() => shoot('too-high', 35), /Butée/);
  shoot('stop', 30);
  now += 5000;
  shoot('level', 5);
  assert.equal(room.ordnance.length, 2, 'the two legal shots are in flight');
}
console.log('tank elevation stop ok');
