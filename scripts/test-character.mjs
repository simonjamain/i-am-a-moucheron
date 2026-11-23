// Issue #111: the player character (Meshy + Mixamo skeleton) replaces the
// procedural humanoid without changing the hit volumes; nobody carries a weapon.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { CHARACTER_DATA } from '../src/character-data.ts';
import {
  createCharacter,
  CHARACTER_CLIPS,
  CHARACTER_HEIGHT,
  LEGACY_HEIGHT,
  GAIT,
} from '../src/character-model.ts';
import { createGraphics } from '../src/graphics.js';
import { HUMAN_SCALE, MAP } from '../src/scale.ts';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, label + ': ' + a + ' vs ' + b);
const world = (o) => o.getWorldPosition(new T.Vector3());

// 1. Data: provenance, skeleton, clips and sizes stay within the import budget.
assert.equal(
  CHARACTER_DATA.source.sha256,
  '29cbb213d02d447ddd1624a4e2e4ffaf31c1c8d99715850f90c983b53b0eed0d',
);
assert.equal(CHARACTER_DATA.bones.length, 44);
for (const clip of Object.values(CHARACTER_CLIPS)) assert.ok(CHARACTER_DATA.clips[clip], clip);

// 2. Instances: own bones and mixer, shared geometry/material/clips.
const a = createCharacter(T),
  b = createCharacter(T);
assert.notEqual(a.skeleton, b.skeleton);
assert.equal(a.mesh.geometry, b.mesh.geometry);
assert.equal(a.mesh.material, b.mesh.material);
const box = new T.Box3().setFromObject(a.container);
near(box.max.y, CHARACTER_HEIGHT, 1e-4, 'bind-pose height');
near(box.min.y, 0, 1e-4, 'feet on the ground');

// 3. Gait follows the ground speed (m/s), clips play at the matching rate.
assert.equal(a.gait(), 'idle');
a.update(0.05, { speed: 1.4 });
assert.equal(a.gait(), 'walk');
a.update(0.05, { speed: 6 });
assert.equal(a.gait(), 'run');
a.update(0.05, { speed: 6, seated: true });
assert.equal(a.gait(), 'idle');
a.update(0.05, { speed: 0.1 });
assert.equal(a.gait(), 'idle');
assert.ok(GAIT.walk < GAIT.run);

// 4. Procedural poses orient segments in world space whatever the bone axes.
const c = createCharacter(T);
c.container.rotation.y = 1.1;
const forward = new T.Vector3(0, 0, 1).applyQuaternion(c.container.quaternion);
const segment = (from, to) =>
  world(c.bones['mixamorig' + to])
    .sub(world(c.bones['mixamorig' + from]))
    .normalize();
for (let i = 0; i < 4; i++) c.update(0.05, { seated: true });
for (const side of ['Left', 'Right']) {
  assert.ok(segment(side + 'UpLeg', side + 'Leg').dot(forward) > 0.85, side + ' thigh forward');
  assert.ok(segment(side + 'Leg', side + 'Foot').y < -0.9, side + ' shin down');
}
for (let i = 0; i < 4; i++) c.update(0.05, { falling: true });
for (const side of ['Left', 'Right'])
  assert.ok(
    Math.abs(segment(side + 'Arm', side + 'ForeArm').y) < 0.3,
    side + ' arm spread horizontally in freefall',
  );
// 5. Game humanoid: 1.8 m tall, the same unarmed character in the office and
// the purgatory: its arms keep the run clip (within the clip blending noise).
const scene = new T.Scene(),
  graphics = createGraphics(T, scene);
const human = graphics.humanoid('#8bc9d6');
human.scale.setScalar(HUMAN_SCALE);
human.rotation.y = 0.4;
scene.add(human);
near(new T.Box3().setFromObject(human).max.y, MAP.metres(1.8), 1e-7, 'human height');
const unarmed = graphics.humanoid('#8bc9d6'),
  reference = createCharacter(T);
for (let i = 0; i < 6; i++) {
  unarmed.userData.animate(0.05, { speed: 6 });
  reference.update(0.05, { speed: 6 });
}
assert.equal(unarmed.userData.arms, undefined, 'no weapon frame');
const drift = (person, name) =>
  person.userData.character.bones[name].quaternion.angleTo(reference.bones[name].quaternion);
for (const name of ['mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigLeftArm'])
  assert.ok(drift(unarmed, name) < 0.05, name + ' follows the clip');
assert.ok(LEGACY_HEIGHT > CHARACTER_HEIGHT);
console.log(
  'Character: Meshy/Mixamo skeleton, shared resources, idle/walk/run gait, seated/falling poses, unarmed clip everywhere.',
);
