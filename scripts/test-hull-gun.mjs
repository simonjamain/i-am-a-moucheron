import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { HULL_GUN_CONE, clampToCone, hullGunDirection } from '../src/hull-gun.ts';

const deg = (r) => (r * 180) / Math.PI;
const angle = (a, b) => deg(a.angleTo(b));
const forward = new T.Vector3(0, 0, -1);
assert.ok(Math.abs(deg(HULL_GUN_CONE) - 15) < 1e-9);
// Inside the cone: untouched.
const inside = new T.Vector3(Math.sin(0.1), 0.05, -Math.cos(0.1)).normalize();
assert.ok(clampToCone(T, inside, forward).distanceTo(inside) < 1e-9);
// Outside (sideways, up, behind): held on the cone edge, same side.
for (const wanted of [
  [1, 0, 0],
  [0, 1, -0.1],
  [-1, -1, -1],
  [0.3, 0, 1],
]) {
  const out = clampToCone(T, new T.Vector3(...wanted), forward);
  assert.ok(Math.abs(angle(out, forward) - 15) < 1e-6, 'on the cone edge');
  assert.ok(Math.abs(out.length() - 1) < 1e-9);
}
assert.ok(clampToCone(T, new T.Vector3(1, 0, 0), forward).x > 0, 'keeps the aimed side');
assert.ok(clampToCone(T, new T.Vector3(-1, 0, 0), forward).x < 0);
// Straight behind: still a valid direction.
assert.ok(Math.abs(angle(clampToCone(T, new T.Vector3(0, 0, 1), forward), forward) - 15) < 1e-6);
// Follows the hull orientation: hull turned 90 degrees left, aim along the world -Z.
const hull = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2);
const turned = hullGunDirection(T, hull, new T.Vector3(0, 0, -1));
assert.ok(Math.abs(angle(turned, new T.Vector3(0, 0, -1).applyQuaternion(hull)) - 15) < 1e-6);
console.log('Hull gun: +/-15 degree cone follows the hull, keeps the aimed side');
