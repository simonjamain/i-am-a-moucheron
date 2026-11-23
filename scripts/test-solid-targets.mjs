// Prepared solid targets (one matrix/mesh/box pass per frame) must give the same
// hits as testing each model in turn with nearestMeshHit, for every ray.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { nearestMeshHit, nearestSolidHit, solidTarget } from '../src/insect-hits.ts';

let seed = 7;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const scene = new T.Scene();
const make = (x, z, spin) => {
  const group = new T.Group(),
    body = new T.Mesh(new T.BoxGeometry(4, 1, 2), new T.MeshBasicMaterial()),
    wing = new T.Mesh(new T.SphereGeometry(1, 8, 6), new T.MeshBasicMaterial());
  wing.position.set(1, 0.5, 0);
  group.add(body, wing);
  group.position.set(x, 1, z);
  group.rotation.y = spin;
  scene.add(group);
  return group;
};
const models = [make(0, -20, 0.3), make(8, -35, 1.1), make(-6, -50, 2), make(30, 10, 0)];
const ghost = new T.Mesh(new T.BoxGeometry(3, 3, 3), new T.MeshBasicMaterial());
ghost.userData.projectileSolid = false;
models[1].add(ghost);
const ids = ['a', 'b', 'c', 'd'];
const prepare = () =>
  models
    .map((m, i) => solidTarget(T, m, i < 3 ? { vehicle: ids[i] } : { target: ids[i] }))
    .filter(Boolean);
const targets = prepare();
assert.equal(targets.length, 4);

const reference = (ray, skip) => {
  let hit = null;
  models.forEach((m, i) => {
    if (i < 3 && ids[i] === skip) return;
    const h = nearestMeshHit(ray, m);
    if (h && (!hit || h.distance < hit.distance))
      hit = { ...h, ...(i < 3 ? { vehicle: ids[i] } : { target: ids[i] }) };
  });
  return hit;
};
let hits = 0;
for (let i = 0; i < 4000; i++) {
  const origin = new T.Vector3((random() - 0.5) * 10, 0.5 + random() * 1.5, random() * 4);
  const direction = new T.Vector3((random() - 0.5) * 0.5, (random() - 0.5) * 0.1, -1).normalize();
  const far = random() < 0.3 ? 15 : 80;
  const skip = random() < 0.2 ? 'a' : undefined;
  const ray = new T.Raycaster(origin, direction, 0, far);
  const expected = reference(ray, skip),
    actual = nearestSolidHit(T, ray, targets, skip);
  assert.equal(actual?.vehicle, expected?.vehicle, 'same vehicle');
  assert.equal(actual?.target, expected?.target, 'same pilot');
  assert.equal(actual?.distance, expected?.distance, 'same distance');
  if (expected) hits++;
}
assert.ok(hits > 300, 'the random rays must actually hit things: ' + hits);

// A ray that starts inside a target's padded box still reaches its triangles.
const inside = new T.Raycaster(new T.Vector3(0, 1, -20), new T.Vector3(1, 0, 0), 0, 10);
assert.ok(nearestSolidHit(T, inside, targets));
// Hidden solids and targets without meshes are not targets at all.
const empty = new T.Group();
assert.equal(solidTarget(T, empty, { vehicle: 'x' }), null);
// Matrices are refreshed once when the target is prepared: a model moved before
// preparation is hit where it is now.
models[3].position.set(0, 1, -5);
const moved = prepare();
assert.equal(
  nearestSolidHit(T, new T.Raycaster(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, -1), 0, 20), moved)
    ?.target,
  'd',
);
console.log('solid targets ok (' + hits + ' random hits compared)');
