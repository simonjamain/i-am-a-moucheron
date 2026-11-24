import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as T from '../vendor/three.webgpu.min.js';
import { loadRapier } from '../src/physics-world.ts';
import { SolidQuery } from '../src/solid-query.ts';
import { nearestInsectHit, nearestSolidHit } from '../src/insect-hits.ts';
import { colliderNormal } from '../src/oriented-collider.ts';
import { MAP } from '../src/scale.ts';
import { bounce, grazingAngle, ricochetLimit, MAX_BOUNCES, SPEED_LOSS } from '../src/ricochet.ts';
import { MATERIALS, vehicleMaterial, insectMaterial } from '../src/materials.ts';
import { PROJECTILES } from '../src/projectiles.ts';

// What the client's solidRayHit does for boxes: Rapier ray queries (src/solid-query.ts).
const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const solidQuery = new SolidQuery(RAPIER);
const boxHitter = (colliders) => (ray, far) => {
  solidQuery.sync(colliders);
  return solidQuery.hit(ray.origin.toArray(), ray.direction.toArray(), far);
};

const deg = (a) => (a * Math.PI) / 180;
// Floor (normal up); direction at `a` degrees from the surface, moving along -z and down.
const dir = (a) => [0, -Math.sin(deg(a)), -Math.cos(deg(a))];
const up = [0, 1, 0];

// Angle: 0 is tangent, 90 head-on.
assert.ok(Math.abs(grazingAngle(dir(0), up)) < 1e-9);
assert.ok(Math.abs(grazingAngle(dir(7), up) - 7) < 1e-9);
assert.ok(Math.abs(grazingAngle([0, -1, 0], up) - 90) < 1e-9);
assert.equal(grazingAngle(dir(30), [0, -1, 0]) > 29.99, true, 'the normal may face either way');

// Limit = min(type, material).
assert.equal(ricochetLimit('mg', 'decor'), 10);
assert.equal(ricochetLimit('mg', 'armor'), 20, 'tank armour: only the bullet limit counts');
assert.equal(ricochetLimit('mg', 'carapace'), 12);
assert.equal(ricochetLimit('rocket', 'armor'), 0, 'angle 0 never ricochets');
assert.equal(ricochetLimit('mg', 'hull'), 0);

// Below the limit: ricochet; above: the projectile hits as before.
assert.equal(bounce(dir(9.9), up, 'mg', 'decor', 0).kind, 'ricochet');
assert.equal(bounce(dir(10.1), up, 'mg', 'decor', 0), null);
assert.equal(bounce(dir(5), up, 'mg', 'hull', 0), null, 'vehicles other than the tank');
assert.equal(bounce(dir(5), up, 'rocket', 'armor', 0), null);
assert.equal(bounce(dir(15), up, 'mg', 'armor', 0).kind, 'ricochet');
assert.equal(bounce(dir(25), up, 'mg', 'armor', 0), null, 'steeper than the bullet allows');
assert.equal(bounce(dir(11), up, 'mg', 'carapace', 0).kind, 'ricochet');
assert.equal(bounce(dir(13), up, 'mg', 'carapace', 0), null);
assert.equal(bounce(dir(0), up, 'mg', 'flesh', 0), null);

// Perfect reflection and speed loss proportional to the angle.
const grazing = bounce(dir(0), up, 'mg', 'decor', 0);
assert.ok(Math.abs(grazing.speedFactor - 1) < 1e-9, 'a perfectly grazing shot keeps its speed');
const limit = bounce(dir(9.999), up, 'mg', 'decor', 0);
assert.ok(Math.abs(limit.speedFactor - (1 - SPEED_LOSS)) < 1e-3);
const mid = bounce(dir(5), up, 'mg', 'decor', 0);
assert.ok(Math.abs(mid.speedFactor - (1 - SPEED_LOSS / 2)) < 1e-9);
const [rx, ry, rz] = mid.direction;
assert.ok(
  Math.abs(rx) < 1e-9 &&
    Math.abs(ry - Math.sin(deg(5))) < 1e-9 &&
    Math.abs(rz + Math.cos(deg(5))) < 1e-9,
);

// At most five ricochets; the next eligible contact ends the projectile, without damage.
for (let n = 0; n < MAX_BOUNCES; n++)
  assert.equal(bounce(dir(3), up, 'mg', 'decor', n).kind, 'ricochet');
assert.equal(bounce(dir(3), up, 'mg', 'decor', MAX_BOUNCES).kind, 'spent');
assert.equal(
  bounce(dir(50), up, 'mg', 'decor', MAX_BOUNCES),
  null,
  'a steep hit still hurts at the end',
);

// Materials and types.
assert.equal(vehicleMaterial('tank'), 'armor');
for (const type of [
  'fighter',
  'bomber',
  'spitfire',
  'helicopter',
  'castor',
  'flaktruck',
  'flyingcastor',
])
  assert.equal(vehicleMaterial(type), 'hull');
assert.equal(insectMaterial('brute'), 'carapace');
for (const type of ['ant', 'roach', 'midge', 'guard', 'spider', 'rat'])
  assert.equal(insectMaterial(type), 'flesh');
assert.equal(MATERIALS.decor.ricochetMaxAngle, 10);
for (const id of ['rocket', 'missile', 'bomb', 'proximity', 'dcaHeavy', 'antitank', 'flak'])
  assert.equal(PROJECTILES[id].ricochetMaxAngle, 0, id);
assert.ok(PROJECTILES.mg.ricochetMaxAngle > 0);

// Box normals, axis-aligned and rotated.
const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 1, z: 2 } };
assert.deepEqual(colliderNormal(box, [1, 1, 1]), [0, 1, 0]);
assert.deepEqual(colliderNormal(box, [2, 0.5, 1]), [1, 0, 0]);
assert.deepEqual(colliderNormal(box, [1, 0.5, 0]), [0, 0, -1]);
const turned = {
  ...box,
  oriented: {
    x: 0,
    z: 0,
    c: Math.cos(Math.PI / 2),
    s: Math.sin(Math.PI / 2),
    bounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } },
  },
};
const n = colliderNormal(turned, [0, 1, 0]);
assert.ok(Math.abs(n[1] - 1) < 1e-9);
console.log(
  'PASS: ricochet limit = min(type, material), reflection, speed loss, 5 bounces, normals.',
);

// The live projectile step: a shallow bullet skids off the floor, a steep one hits it.
const src = readFileSync('src/client.js', 'utf8');
const step = src.slice(
  src.indexOf('function contactOf('),
  src.indexOf('// Fixed timestep flight:'),
);
function fly(angle, bounces = 0, slices = 1, owned = true) {
  const model = new T.Object3D();
  model.userData.dispose = () => {};
  model.position.set(0, 0.5, 0);
  const speed = 100;
  const trail = {
    m: model,
    v: new T.Vector3(0, -Math.sin(deg(angle)) * speed, -Math.cos(deg(angle)) * speed),
    life: 3,
    owned,
    projectile: 'mg',
    bounces,
    baseDamage: 75,
    travelled: 0,
    shot: 's',
  };
  let hits = 0,
    bursts = 0,
    sounds = 0;
  const trails = [trail];
  // Hit-test a floor (top at y = 0) along the first slices only.
  const colliders = [new T.Box3(new T.Vector3(-50, -2, -500), new T.Vector3(50, 0, 500))];
  runInNewContext(step + `;for (let i = 0; i < ${slices}; i++) stepProjectileSlice(0.05)`, {
    T,
    // Saint Pierre's sky is not drawn in this test: nothing to hit there.
    nearestSkyTarget: () => null,
    purgatoryTargets: () => [],
    reportSkyHits: () => {},
    solidRayHit: boxHitter(colliders),
    nearestSolidHit,
    projectileRay: new T.Raycaster(),
    office: { decor: null },
    solidTargets: () => [],
    scene: new T.Scene(),
    trails,
    colliders,
    insects: new Map(),
    nearestInsectHit,
    insectIndex: null,
    camera: null,
    stepBallisticVelocity() {},
    action() {
      hits++;
    },
    updateTracer() {},
    sound: { play: () => sounds++ },
    hitEffects: { burst: () => bursts++ },
    bounce,
    vehicleMaterial,
    insectMaterial,
    currentRoster: () => [],
    MAP,
    respawnAt: 0,
    snap: { wave: 1, vehicles: [] },
    localKills: new Set(),
    damageEnemy() {
      hits++;
    },
  });
  return { trail, trails, hits, bursts, sounds };
}
const skid = fly(6);
assert.equal(skid.trails.length, 1, 'still flying');
assert.equal(skid.trail.bounces, 1);
assert.ok(skid.trail.v.y > 0, 'now going up');
assert.ok(skid.trail.v.z < 0, 'still going forward');
assert.ok(
  skid.trail.v.length() < 100 && skid.trail.v.length() > 100 * (1 - SPEED_LOSS),
  'lost speed',
);
assert.equal(skid.hits, 0, 'a ricochet does no damage');
assert.equal(skid.bursts, 1, 'same impact animation');
assert.equal(skid.sounds, 1, 'and a ricochet sound');
assert.ok(skid.trail.m.position.y > 0, 'above the surface after the bounce');
const steep = fly(40);
assert.equal(steep.trails.length, 0, 'a steep bullet is stopped as before');
assert.equal(steep.trail.bounces, 0);
const last = fly(6, MAX_BOUNCES);
assert.equal(last.trails.length, 0, 'the sixth eligible contact ends the bullet');
assert.equal(last.hits, 0, 'and still does no damage');
console.log(
  'PASS: live projectile step skids shallow bullets, stops steep ones, ends after five bounces.',
);

// Another player's tracer is display only: it skids like any bullet, or ends on the fixed decor,
// and never reports damage.
const remoteSkid = fly(6, 0, 1, false);
assert.equal(remoteSkid.trails.length, 1);
assert.equal(remoteSkid.trail.bounces, 1);
assert.equal(remoteSkid.hits, 0);
const remoteStop = fly(40, 0, 1, false);
assert.equal(remoteStop.trails.length, 0, 'a steep remote tracer ends on the floor');
assert.equal(remoteStop.bursts, 1, 'with the impact flash');
assert.equal(remoteStop.hits, 0, 'and no damage');
// A round the shooter reports against a moving surface turns the matching remote tracer.
const { RemoteRounds } = await import('../src/remote-rounds.ts');
const model = new T.Object3D();
const mine = {
  m: model,
  v: new T.Vector3(0, 0, -50),
  shooter: 'alice',
  round: 7,
  owned: false,
  bounces: 0,
};
const other = { ...mine, m: new T.Object3D(), v: new T.Vector3(0, 0, -50), round: 8 };
let flashes = 0;
const skidContext = {
  RemoteRounds,
  trails: [mine, other],
  T,
  updateTracer() {},
  camera: null,
  hitEffects: { burst: () => flashes++ },
  remoteShotCount: () => 0,
  Number,
  Array,
};
const rounds = src.slice(
  src.indexOf('const remoteRounds = new RemoteRounds()'),
  src.indexOf('function remoteShotCount('),
);
const entry = [7, 1, 1, 2, 3, 0, 10, -5];
const apply = runInNewContext(
  rounds + '; (motion) => applyRemoteSkids("alice", motion)',
  skidContext,
);
apply({ skids: [entry] });
assert.deepEqual(mine.m.position.toArray(), [1, 2, 3]);
assert.deepEqual(mine.v.toArray(), [0, 10, -5]);
assert.equal(mine.bounces, 1);
assert.deepEqual(other.v.toArray(), [0, 0, -50], 'another round of the same shooter is untouched');
apply({ skids: [entry] });
assert.equal(flashes, 1, 'the same report, repeated in later motion states, applies once');
apply({ skids: [[7, 1, 9, 9, 9, 9, 9, 9]] });
assert.deepEqual(mine.m.position.toArray(), [1, 2, 3], 'an older bounce never overwrites');
const fired = runInNewContext(
  rounds + '; (shooter, motion, dt) => remoteFired({}, "pilot", shooter, motion, dt, 0.05, true)',
  { ...skidContext },
);
assert.deepEqual(fired('bob', { rounds: 5 }, 0.016), [], 'first sight only syncs');
assert.deepEqual(fired('bob', { rounds: 7 }, 0.016), [6], 'new numbers leave one by one');
assert.deepEqual(fired('bob', { rounds: 7 }, 0.06), [7]);
console.log(
  'PASS: remote tracers end or skid on the decor; reported ricochets and rounds are replayed.',
);
