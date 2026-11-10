// Damaged aircraft smoke from their engines, more as damage grows; damage
// never changes an aircraft's shape any more (no shrinking wings).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import {
  EngineSmoke,
  SMOKE_THRESHOLD,
  damageRatio,
  engineAnchors,
  smokeLook,
  smokeRate,
} from '../src/engine-smoke.js';
import { ACTOR_UNIT } from '../src/scale.js';

assert.equal(damageRatio(100, 100), 0);
assert.equal(damageRatio(50, 200), 0.75);
assert.equal(damageRatio(-5, 100), 1);
assert.equal(smokeRate(0), 0, 'intact aircraft do not smoke');
assert.equal(smokeRate(SMOKE_THRESHOLD), 0, 'light scratches do not smoke');
// Strictly more smoke, bigger, longer-lived and darker as damage grows.
let previous = { rate: 0, look: smokeLook(SMOKE_THRESHOLD) };
for (const damage of [0.3, 0.5, 0.7, 0.9, 1]) {
  const rate = smokeRate(damage),
    look = smokeLook(damage);
  assert.ok(rate > previous.rate, 'rate grows with damage');
  assert.ok(look.endSize > previous.look.endSize && look.life > previous.look.life);
  assert.ok(look.shade < previous.look.shade, 'darker');
  assert.ok(look.opacity > previous.look.opacity, 'denser');
  previous = { rate, look };
}

const scene = new T.Scene();
const graphics = createGraphics(T, scene);
// Engines: behind each propeller (two on the B3), under the H2 rotor.
const engines = {
  makePlane: 1,
  makeStuka: 1,
  makeSpitfire: 1,
  makeBomber: 2,
  makeHelicopter: 1,
};
for (const [make, count] of Object.entries(engines)) {
  const model = graphics[make]();
  assert.equal(engineAnchors(T, model).length, count, make + ' engines');
  assert.equal(engineAnchors(T, model), model.userData.engines, 'anchors created once');
}

const smoke = new EngineSmoke(T, scene, { random: () => 0.5 });
const plane = graphics.makePlane();
plane.scale.setScalar(ACTOR_UNIT);
plane.position.set(0.2, 1, -0.4);
assert.equal(smoke.emit(plane, 0, 1), 0, 'full health: nothing');
assert.equal(smoke.emit(plane, 0.1, 1), 0);
const light = smoke.emit(plane, 0.4, 1);
smoke.clear();
const heavy = smoke.emit(plane, 0.95, 1);
assert.ok(light >= 1 && heavy > light * 3, `${light} light vs ${heavy} heavy puffs per second`);
// Puffs start at the engine, then rise and fade; the cloud uses one draw call.
plane.updateMatrixWorld(true);
const engine = plane.userData.engines[0].getWorldPosition(new T.Vector3());
assert.ok(smoke.puffs[0].p.distanceTo(engine) < 0.3 * ACTOR_UNIT);
const y0 = smoke.puffs[0].p.y,
  alive = smoke.update(0.1, new T.PerspectiveCamera(62, 1.5, 0.001, 40), 800);
assert.equal(alive, heavy);
assert.ok(smoke.puffs[0].p.y > y0, 'smoke rises');
assert.equal(smoke.points.geometry.drawRange.count, heavy);
assert.ok(smoke.alphas[0] > 0 && smoke.alphas[0] < 1);
smoke.update(10, null, 800);
assert.equal(smoke.puffs.length, 0, 'puffs fade out');
// Bounded memory, whatever the number of burning aircraft.
const small = new EngineSmoke(T, scene, { capacity: 20 });
for (let i = 0; i < 10; i++) small.emit(plane, 1, 1);
assert.ok(small.puffs.length <= 20);

// Damage never changes an aircraft's shape: no wing scaling left in the client.
const client = readFileSync('src/client.js', 'utf8');
assert.doesNotMatch(client, /wing\.scale/);
assert.match(client, /engineSmoke\.emit\(/);
console.log('Engine smoke: grows with damage, from the engines, bounded; no shape change');
