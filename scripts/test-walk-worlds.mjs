// A person walks, runs and is filmed the same way in the office and the
// purgatory (scale.ts WALK_WORLDS): same height, same camera framing relative to
// that height, same top speed in metres, so the same gait clip plays.
import assert from 'node:assert/strict';
import { advanceArena } from '../src/walk-arena.ts';
import { createSoul, PURGATORY_RULES } from '../src/purgatory-queue.ts';
import { OFFICE_RULES } from '../src/base.ts';
import {
  ACTOR_UNIT,
  HUMAN_SCALE,
  MAP,
  REFERENCE,
  WALK_WORLDS,
  humanoidScale,
  walkAcceleration,
  walkSpeed,
} from '../src/scale.ts';
import { GAIT } from '../src/character-model.ts';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);
const { office, purgatory } = WALK_WORLDS;

// Model size: 1.8 m in scene units of each world.
near(humanoidScale(office), HUMAN_SCALE, 1e-15, 'office humanoid scale');
near(humanoidScale(purgatory), 1, 1e-12, 'the purgatory is drawn in humanoid units');
// Camera: the shoulder camera's scale is scene units per metre in both worlds.
for (const world of [office, purgatory])
  near(humanoidScale(world) * 2.46, world.sceneScale * 1.8, 1e-12, 'person = 1.8 camera metres');
// The office law is unchanged.
near(walkAcceleration(office), (MAP.metres(REFERENCE.walk) / ACTOR_UNIT) * 7.45, 1e-9, 'office');

// Same top speed in metres: walk 4 s straight ahead under each world's own rules.
function topSpeed(world, rules) {
  const b = createSoul({ id: 1, entity: 'p', kind: 'player' }, 0, 0);
  Object.assign(b, { x: 40, z: 40 }); // open floor, far from the counter
  const a = { bodies: [b], time: 0, events: [], eventSeq: 0 };
  for (let t = 0; t < 4000; t += 50) {
    b.input = { x: 0, z: 1 };
    b.inputAt = a.time;
    advanceArena(a, a.time + 50, rules, 'p');
  }
  return walkSpeed(world, b);
}
const officeSpeed = topSpeed(office, OFFICE_RULES),
  soulSpeed = topSpeed(purgatory, PURGATORY_RULES);
near(soulSpeed, officeSpeed, 1e-6, 'same top speed (m/s)');
assert.ok(soulSpeed > GAIT.run, `both run (${soulSpeed.toFixed(2)} m/s)`);
console.log(
  `Walk worlds: same height, camera framing and top speed (${soulSpeed.toFixed(2)} m/s, run clip) in the office and the purgatory.`,
);
