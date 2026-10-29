import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { nearestInsectHit, nearestMeshHit, insectContact, HitEffects } from '../src/insect-hits.js';
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  bug = graphics.insect(),
  origin = new T.Vector3(),
  direction = new T.Vector3(0, 0, -1);
bug.position.set(0, 0, -50);
let bugs = new Map([[1, bug]]);
assert.equal(nearestInsectHit(T, origin, direction, bugs)?.id, 1);
bug.position.x = 5;
assert.ok(
  bug.position.clone().normalize().dot(direction) > 0.985,
  'the old cone falsely accepted this near miss',
);
assert.equal(
  nearestInsectHit(T, origin, direction, bugs),
  null,
  'far near-miss must miss the visible model',
);
bug.position.x = 0;
const nearer = graphics.insect();
nearer.position.set(0, 0, -10);
bugs.set(2, nearer);
assert.equal(nearestInsectHit(T, origin, direction, bugs).id, 2);
assert.equal(nearestInsectHit(T, origin, direction, new Map([[1, bug]]), 20), null);
bug.rotation.y = -Math.PI / 2;
bug.position.set(0, 0, -10);
assert.ok(nearestInsectHit(T, origin, direction, new Map([[1, bug]])));
assert.equal(
  insectContact(T, new T.Vector3(0, 1.2, -10), bug),
  false,
  'no giant spherical collision envelope',
);
assert.equal(insectContact(T, new T.Vector3(0, 0, -10), bug), true);
const camera = new T.PerspectiveCamera(),
  effects = new HitEffects(T, scene, { maxBursts: 2 });
assert.equal(effects.burst(new T.Vector3(1, 2, 3), camera, { key: 'one' }), true);
assert.equal(
  effects.burst(origin, camera, { key: 'one' }),
  false,
  'local and replicated kill cannot duplicate the burst',
);
const first = effects.active[0];
assert.equal(first.sparks.length, 9);
effects.update(0.1, camera);
assert.ok(first.material.opacity < 1 && first.flash.scale.x === 0);
effects.burst(origin, camera, { key: 'two' });
effects.burst(origin, camera, { key: 'three' });
assert.equal(effects.active.length, 2);
effects.update(0.5, camera);
assert.equal(effects.active.length, 0);
assert.equal(first.group.parent, null);
effects.dispose();
console.log(
  'PASS: model-sized ray hits, far near misses, nearest target/range/rotation, tighter body contact and bounded deduplicated impact effects with cleanup',
);

// Real projectile call pattern: aircraft / avatars contain camera-facing labels.
// Neither labels nor invisible geometry may intercept a projectile.
const labelled = new T.Group(),
  hull = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
labelled.add(hull, new T.Sprite());
labelled.position.z = -2;
const projectile = new T.Raycaster(origin, direction, 0, 4);
assert.equal(nearestMeshHit(projectile, labelled)?.object, hull);
hull.visible = false;
assert.equal(nearestMeshHit(projectile, labelled), null);
labelled.visible = false;
assert.equal(nearestMeshHit(projectile, labelled), null);
console.log(
  'PASS: projectile rays ignore Sprite labels without a camera, hit hull meshes, and skip hidden geometry.',
);
