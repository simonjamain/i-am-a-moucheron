// Remodelled Meshy vehicles (scripts/import-meshy-vehicle.py): every source
// triangle kept, articulations, and the physics points shared with the models
// (tank and D2 shell origins, D2 hulls, H2 weapon origins) match what is drawn.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { aimGun } from '../src/sortie.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { VEHICLES } from '../src/fleet.js';
import { tankBarrelOrigin } from '../src/tank-view.js';
import { mobileBarrelOrigin, trailerGunPivot } from '../src/mobile-flak.js';
import { heliWeaponOrigin } from '../src/helicopter.js';
import { VEHICLE_ANCHORS } from '../src/vehicle-anchors.js';
import { MODEL_DATA as SPITFIRE } from '../src/meshy-spitfire-data.js';
import { MODEL_DATA as TANK } from '../src/meshy-tank-data.js';
import { MODEL_DATA as FLAKTRUCK } from '../src/meshy-flaktruck-data.js';
import { H2_DATA } from '../src/meshy-h2-data.js';
import { B3_DATA } from '../src/meshy-b3-data.js';
import { M1_DATA } from '../src/meshy-m1-data.js';
import { MODEL_DATA as STUKA } from '../src/meshy-stuka-data.js';

const SOURCES = {
  spitfire: [SPITFIRE, 'b18e5558feef75463354dee45037b11ed640a4de6f9f0c71cd6e9dbf484026c4', 3002],
  tank: [TANK, 'fb105cc19eefd50573c25ca9eaa233bf15eb4898d04f34cbaa736b618da186e9', 3833],
  flaktruck: [FLAKTRUCK, '3861d4bf21e75d0ca9a7864b40f98189847b0fdcffdf6de5daf1127f71da18ed', 4689],
  helicopter: [H2_DATA, '488832fc140c16321dc54d07addd088ea16e2f3b042f568fa910ec1ee1206a9a', 5102],
  bomber: [B3_DATA, 'a50363b85c21e407839651d5b478bf8900bb340debec3e86cdc68b94b8284307', 5797],
  fighter: [M1_DATA, '7d9ab847ae7086af717f5fc81841c08635104fe3da44236e45fd0b352f1916b0', 2376],
  interceptor: [STUKA, '6290811f303ac480f3b286dd62ee73d6293fa542d824987b378262e5c8ec9ade', 3261],
};
for (const [name, [data, sha, triangles]] of Object.entries(SOURCES)) {
  assert.equal(data.sourceSha256, sha, name + ' source');
  assert.equal(data.triangles, triangles, name + ' keeps every source triangle');
  const parts = new Set(data.parts.map((p) => p.part));
  for (const node of data.rig)
    assert.ok(node.parent === 'body' || data.rig.some((n) => n.name === node.parent));
  for (const anchor of data.anchors)
    assert.ok(anchor.node === 'body' || data.rig.some((n) => n.name === anchor.node));
  assert.ok(parts.has('body'), name + ' hull');
}

const graphics = createGraphics(T, new T.Scene());
const vehicleAt = (model, type) => {
  const state = {
    p: [0.4, 0.9, -0.3],
    q: new T.Quaternion().setFromEuler(new T.Euler(0.1, 0.7, -0.05)).toArray(),
    trailerAngle: 0.35,
  };
  model.position.fromArray(state.p);
  model.quaternion.fromArray(state.q);
  model.scale.setScalar(ACTOR_UNIT);
  return { type, state };
};
const close = (a, b, eps = 1e-9) => new T.Vector3().fromArray(a).distanceTo(b) < eps;

// Wheels (or skids) on the ground at the gear height, for every vehicle.
for (const [type, make] of [
  ['spitfire', 'makeSpitfire'],
  ['tank', 'makeTank'],
  ['flaktruck', 'makeFlakTruck'],
  ['helicopter', 'makeHelicopter'],
  ['bomber', 'makeBomber'],
  ['fighter', 'makePlane'],
  ['interceptor', 'makeStuka'],
]) {
  const model = graphics[make]();
  model.scale.setScalar(ACTOR_UNIT);
  model.position.y = VEHICLES[type].gear;
  model.updateMatrixWorld(true);
  assert.ok(Math.abs(new T.Box3().setFromObject(model).min.y) < 1e-5, type + ' ground contact');
}

// T3: the shell leaves the drawn muzzle, whatever the hull pose and aim.
{
  const model = graphics.makeTank();
  const vehicle = vehicleAt(model, 'tank');
  const mount = model.userData.turrets[0];
  for (const d of [
    [0, 0, -1],
    [0.4, 0.3, -0.8],
    [-0.9, -0.1, 0.3],
  ]) {
    const dir = new T.Vector3(...d).normalize();
    model.updateMatrixWorld(true);
    aimGun(T, mount, dir, mount.parent.getWorldQuaternion(new T.Quaternion()));
    const muzzle = mount.userData.muzzle.getWorldPosition(new T.Vector3());
    assert.ok(close(tankBarrelOrigin(vehicle, dir.toArray()), muzzle), 'tank shell at muzzle');
  }
  // The roof gun is carried by the turret and aims on its own.
  const top = model.userData.turrets[1];
  assert.equal(top.parent, mount, 'roof gun rides the turret');
  model.updateMatrixWorld(true);
  const dir = new T.Vector3(0.2, 0.5, -1).normalize();
  aimGun(T, top, dir, top.parent.getWorldQuaternion(new T.Quaternion()));
  const pivot = top.userData.pitch.getWorldPosition(new T.Vector3());
  const tip = top.userData.muzzle.getWorldPosition(new T.Vector3());
  assert.ok(tip.sub(pivot).normalize().dot(dir) > 0.9999, 'roof gun points where aimed');
  assert.equal(model.userData.pilotMuzzles.length, 1, 'hull machine gun');
}

// D2: trailer swings at the hitch; shell origin and hulls follow the model.
{
  const model = graphics.makeFlakTruck();
  const vehicle = vehicleAt(model, 'flaktruck');
  model.userData.trailer.rotation.y = vehicle.state.trailerAngle;
  const mount = model.userData.turrets[0];
  assert.equal(mount.parent, model.userData.trailer, 'gun carriage rides the trailer');
  for (const d of [
    [0, 0.6, -0.8],
    [0.7, 0.7, 0.1],
  ]) {
    const dir = new T.Vector3(...d).normalize();
    model.updateMatrixWorld(true);
    aimGun(T, mount, dir, mount.parent.getWorldQuaternion(new T.Quaternion()));
    const muzzle = mount.userData.muzzle.getWorldPosition(new T.Vector3());
    assert.ok(close(mobileBarrelOrigin(vehicle, dir.toArray()), muzzle), 'D2 shell at muzzle');
  }
  // The gun pivot used by the physics is the drawn elevation pivot.
  model.position.set(0, 0, 0);
  model.quaternion.identity();
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  const pitch = mount.userData.pitch.getWorldPosition(new T.Vector3());
  assert.ok(close(trailerGunPivot(vehicle.state.trailerAngle), pitch, 1e-6));
}
{
  // Collision boxes enclose the drawn tractor and trailer (gun at rest).
  const { tractorBox, trailerBox, hitch } = VEHICLE_ANCHORS.flaktruck;
  const model = graphics.makeFlakTruck();
  model.updateMatrixWorld(true);
  const tractor = new T.Box3(),
    trailer = new T.Box3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    let p = o,
      onTrailer = false;
    while (p) {
      if (p === model.userData.trailer) onTrailer = true;
      p = p.parent;
    }
    (onTrailer ? trailer : tractor).expandByObject(o);
  });
  const inside = (box, [lo, hi], shift = [0, 0, 0]) =>
    ['x', 'y', 'z'].every(
      (k, i) => box.min[k] >= lo[i] + shift[i] - 0.25 && box.max[k] <= hi[i] + shift[i] + 0.25,
    );
  assert.ok(inside(tractor, tractorBox), 'tractor hull box');
  assert.ok(inside(trailer, trailerBox, hitch), 'trailer hull box around the hitch');
}

// H2: rockets and missiles start at the drawn pods and rails, on both sides.
{
  const model = graphics.makeHelicopter();
  const vehicle = vehicleAt(model, 'helicopter');
  model.updateMatrixWorld(true);
  const vertices = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      vertices.push(o.localToWorld(new T.Vector3().fromBufferAttribute(p, i)));
  });
  for (const weapon of ['rocket', 'missile'])
    for (const side of [-1, 1]) {
      const origin = new T.Vector3().fromArray(heliWeaponOrigin(vehicle, weapon, side));
      const nearest = Math.min(...vertices.map((v) => v.distanceTo(origin)));
      assert.ok(nearest < 0.25 * ACTOR_UNIT, `${weapon} ${side} at the drawn launcher`);
    }
  const [rotor, tail] = [model.userData.rotor, model.userData.tailRotor];
  assert.ok(rotor.children.some((o) => o.isMesh) && tail.children.some((o) => o.isMesh));
}

// B3: three gunner turrets in seat order; each muzzle lies on its aim line.
{
  const model = graphics.makeBomber();
  const [dorsal, tail, ventral] = model.userData.turrets;
  model.updateMatrixWorld(true);
  const world = (o) => o.getWorldPosition(new T.Vector3());
  assert.ok(world(dorsal).y > 0.5 && world(ventral).y < 0 && world(tail).z > 3.5, 'seat order');
  const rest = (mount) => world(mount.userData.muzzle).sub(world(mount.userData.pitch)).normalize();
  assert.ok(rest(tail).z > 0.9, 'tail guns face backward at rest');
  assert.ok(rest(ventral).y < -0.5, 'ventral guns hang down at rest');
  for (const mount of [dorsal, tail, ventral]) {
    const dir = new T.Vector3(0.3, -0.2, -0.9).normalize();
    aimGun(T, mount, dir, mount.parent.getWorldQuaternion(new T.Quaternion()));
    model.updateMatrixWorld(true);
    assert.ok(rest(mount).dot(dir) > 0.9999, 'muzzle on the aim line');
  }
  assert.equal(model.userData.props.length, 2);
  assert.ok(world(model.userData.props[0]).x < 0 && world(model.userData.props[1]).x > 0);
}

// Spitfire: six wing guns, symmetric, and the propeller on the nose axis.
{
  const model = graphics.makeSpitfire();
  model.updateMatrixWorld(true);
  const guns = model.userData.pilotMuzzles.map((m) => m.getWorldPosition(new T.Vector3()));
  assert.equal(guns.length, 6);
  assert.equal(guns.filter((g) => g.x < 0).length, 3);
  assert.ok(
    guns.every((g) => g.z < -1 && Math.abs(g.x) > 1),
    'guns in the wing leading edge',
  );
  assert.ok(Math.abs(model.userData.prop.position.x) < 0.05 && model.userData.prop.position.z < -2);
  assert.ok(
    model.userData.pilotMuzzles.every((m) => m.parent === model.userData.wing),
    'guns ride the wing',
  );
}
// M1 and Stuka: propeller on the nose axis, symmetric guns, damageable wing.
for (const make of ['makePlane', 'makeStuka']) {
  const model = graphics[make]();
  model.updateMatrixWorld(true);
  const guns = model.userData.pilotMuzzles.map((m) => m.getWorldPosition(new T.Vector3()));
  assert.equal(guns.length, 2, make + ' guns');
  assert.ok(
    Math.abs(guns[0].x + guns[1].x) < 0.05 && guns[0].z < -1,
    make + ' symmetric front guns',
  );
  assert.ok(Math.abs(model.userData.prop.position.x) < 0.05 && model.userData.prop.position.z < -2);
  assert.ok(
    model.userData.wing.children.some((o) => o.isMesh),
    make + ' wing mesh',
  );
}
console.log('Meshy vehicles: sources, rigs, ground contact and physics anchors match the models');
