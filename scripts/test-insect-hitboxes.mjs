// Insect hit volumes in Rapier (src/insect-hitboxes.ts): a sphere for a midge, a capsule for the
// other species, placed on the model every frame; shots only, no collision.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { capsuleOf, declaredShape } from '../src/insect-hitboxes.ts';
import { hitboxes, nearestInsectHit } from './insect-harness.mjs';

const model = (data, position = [0, 0, 0], scale = 1) => {
  const g = new T.Group();
  g.userData = data;
  g.position.set(...position);
  g.scale.setScalar(scale);
  return g;
};
const ray = (id, from, to, insects, max = 10, excluded = null) =>
  nearestInsectHit(T, new T.Vector3(...from), new T.Vector3(...to), new Map(insects), max, excluded)
    ?.id ?? null;

// Shapes: equal radii are a sphere; otherwise a capsule along the longest axis that holds the body.
assert.deepEqual(capsuleOf([1, 1, 1]), { radius: 1, halfHeight: 0, axis: 'y', centre: [0, 0, 0] });
const ant = capsuleOf([0.4, 0.3, 1.2], [0, 0.1, 0]);
assert.equal(ant.axis, 'z');
assert.equal(ant.radius, 0.4, 'the wider of the other two radii');
assert.ok(Math.abs(ant.halfHeight + ant.radius - 1.2) < 1e-12, 'as long as the body');
assert.equal(capsuleOf([2, 0.5, 0.5]).axis, 'x');
assert.equal(declaredShape(model({ sphereRadius: 1.2 })).halfHeight, 0, 'a midge is a sphere');
assert.equal(declaredShape(model({})), null, 'no declared proxy: fitted to the model');

// A capsule along z is long in z and thin in x.
const long = model({ hitEllipsoid: [0.2, 0.2, 1] }, [0, 0, -5]);
assert.equal(ray(1, [0, 0, 0], [0, 0, -1], [[1, long]]), 1, 'head-on');
assert.equal(ray(1, [0, 0, -6.5], [1, 0, 0], [[1, long]]), null, 'beyond the end, sideways');
assert.equal(ray(1, [0, 0, -4.5], [1, 0, 0], [[1, long]]), 1, 'along the body, sideways');
assert.equal(ray(1, [0.5, 0, 0], [0, 0, -1], [[1, long]]), null, 'wide of the body');
// Turning the model turns the capsule.
long.rotation.y = Math.PI / 2;
assert.equal(ray(1, [-3, 0, -5], [1, 0, 0], [[1, long]]), 1, 'now long in x');
assert.equal(ray(1, [0, 0, 0], [0, 0, -1], [[1, long]]), 1, 'and still hit from the front');
assert.equal(ray(1, [0.5, 0, 0], [0, 0, -1], [[1, long]]), 1, 'wider in x');
// A moved model moves its volume; scale and tolerance size it.
long.rotation.y = 0;
long.position.set(0, 0, -8);
assert.equal(ray(1, [0, 0, 0], [0, 0, -1], [[1, long]], 20), 1, 'moved');
assert.equal(ray(1, [0, 0, 0], [0, 0, -1], [[1, long]], 5), null, 'beyond the range');
const small = model({ hitEllipsoid: [0.2, 0.2, 1], hitTolerance: 1 }, [0, 0, -3], 0.5);
assert.equal(ray(2, [0.15, 0, 0], [0, 0, -1], [[2, small]]), null, 'scale 0.5: radius 0.1');
small.userData.hitTolerance = 2;
assert.equal(ray(2, [0.15, 0, 0], [0, 0, -1], [[2, small]]), 2, 'tolerance 2: radius 0.2');

// The nearest of several, a hidden or killed one is out of play, a removed one is gone.
const near = model({ sphereRadius: 1.2 * 0.3 }, [0, 0, -2]),
  far = model({ sphereRadius: 1.2 * 0.3 }, [0, 0, -4]);
const both = [
  [1, far],
  [2, near],
];
assert.equal(ray(0, [0, 0, 0], [0, 0, -1], both), 2, 'the nearest, whatever the order');
assert.equal(ray(0, [0, 0, 0], [0, 0, -1], both, 10, new Set([2])), 1, 'the killed one is skipped');
near.visible = false;
assert.equal(ray(0, [0, 0, 0], [0, 0, -1], both), 1, 'a hidden one is not hit');
near.visible = true;
assert.equal(ray(0, [0, 0, 0], [0, 0, -1], [[1, far]]), 1, 'a removed one is gone');
assert.equal(ray(0, [0, 0, 0], [0, 0, -1], both), 2, 'and back');
const hit = nearestInsectHit(T, new T.Vector3(), new T.Vector3(0, 0, -3), new Map(both), 10);
assert.ok(
  Math.abs(hit.distance - (2 - 0.3)) < 1e-4,
  'distance to the surface, direction unnormalised',
);
assert.ok(Math.abs(hit.point.z + 1.7) < 1e-4, 'and the point');
assert.equal(hitboxes.contact(new T.Vector3(0, 0, -2.2), 0), 2, 'a point inside touches');
assert.equal(hitboxes.contact(new T.Vector3(0, 0, -3), 0), null, 'a point away does not');
assert.equal(hitboxes.contact(new T.Vector3(0, 0, -2.5), 0.3), 2, 'padding reaches it');

// A packed swarm: the earliest in the line is hit, whatever the insertion order, within budget.
const swarm = new Map();
for (let id = 0; id < 900; id++)
  swarm.set(id, model({ sphereRadius: 1.2 * 0.05 }, [0, 0, -1 - id * 0.1]));
assert.equal(ray(0, [0, 0, 0], [0, 0, -1], [...swarm], 200), 0);
const started = performance.now();
for (let frame = 0; frame < 20; frame++) {
  for (const m of swarm.values()) m.position.x += 0.001;
  hitboxes.sync(swarm);
}
const perFrame = (performance.now() - started) / 20;
assert.ok(perFrame < 20, `900 insects moved and synchronised in ${perFrame.toFixed(2)} ms a frame`);
console.log(
  `Insect hit volumes: spheres and capsules on the models, shots only; 900 insects in ${perFrame.toFixed(2)} ms a frame.`,
);
