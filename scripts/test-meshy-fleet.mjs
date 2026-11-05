import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { VEHICLES } from '../src/fleet.js';
import { paintVehicle } from '../src/vehicle-livery.js';
const graphics = createGraphics(T, new T.Scene());
for (const [type, factory] of [
  ['interceptor', 'makeStuka'],
  ['spitfire', 'makeSpitfire'],
  ['tank', 'makeTank'],
  ['flaktruck', 'makeFlakTruck'],
]) {
  const a = graphics[factory]('#7f8844'),
    b = graphics[factory]('#7f8844');
  const parts = [];
  a.traverse((o) => {
    if (o.name.startsWith('meshy-')) parts.push(o);
  });
  const other = [];
  b.traverse((o) => {
    if (o.name.startsWith('meshy-')) other.push(o);
  });
  assert.ok(parts.length >= 2);
  let count = 0;
  for (const [i, mesh] of parts.entries()) {
    assert.equal(mesh.geometry, other[i].geometry, 'shared GPU geometry');
    const geometry = mesh.geometry;
    count += geometry.attributes.position.count / 3;
    for (const attribute of Object.values(geometry.attributes))
      assert.ok(attribute.array.every(Number.isFinite));
  }
  assert.ok(count <= 3000 && count >= 2900, 'hull triangle budget');
  const fixed = parts.find((o) => o.material.vertexColors);
  const fixedMaterial = fixed.material;
  paintVehicle(T, a, 4, '#7f8844');
  assert.equal(fixed.material, fixedMaterial, 'camouflage accents remain unchanged');
  assert.ok(
    parts.some((o) => o.material === a.userData.paint),
    'livery still identifies vehicle',
  );
  if (type === 'interceptor' || type === 'spitfire') {
    const span = new T.Box3().setFromObject(a.userData.wing).getSize(new T.Vector3()).x;
    a.userData.wing.scale.x = 0.52;
    assert.ok(new T.Box3().setFromObject(a.userData.wing).getSize(new T.Vector3()).x < span * 0.53);
    a.userData.prop.rotation.z = 1;
    assert.equal(b.userData.prop.rotation.z, 0);
  }
  if (type === 'flaktruck') {
    const trailer = a.userData.trailer;
    const body = parts.find((o) => o.parent === a);
    a.updateMatrixWorld(true);
    const before = body.matrixWorld.clone();
    const muzzle = a.userData.turrets[0].userData.muzzle;
    const tip = muzzle.getWorldPosition(new T.Vector3());
    trailer.rotation.y = 0.5;
    a.updateMatrixWorld(true);
    assert.ok(body.matrixWorld.equals(before), 'tractor stays fixed when trailer turns');
    const expected = tip
      .clone()
      .sub(trailer.position)
      .applyAxisAngle(new T.Vector3(0, 1, 0), 0.5)
      .add(trailer.position);
    assert.ok(muzzle.getWorldPosition(new T.Vector3()).distanceTo(expected) < 1e-10);
    assert.ok(expected.distanceTo(tip) > 0.1);
    assert.equal(b.userData.trailer.rotation.y, 0);
    assert.ok(parts.filter((o) => o.parent === trailer).length >= 1);
  }
  b.scale.setScalar(ACTOR_UNIT);
  b.position.y = VEHICLES[type].gear;
  assert.ok(Math.abs(new T.Box3().setFromObject(b).min.y) < 0.02 * ACTOR_UNIT, 'wheel contact');
  console.log(`${type}: ${count} hull triangles; sharing, livery, contact and articulation OK`);
}
