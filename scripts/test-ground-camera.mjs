import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  FLOOR_CLEARANCE,
  GROUND_VIEW_DISTANCE,
  GROUND_VIEW_PITCH,
  SHOULDER_HEIGHT,
  shoulderCamera,
} from '../src/personal-aim.ts';

const scale = 0.003;
const feet = { x: 0.2, y: 0.1, z: -0.3 };
// Default view: the closest zoom that used to be the maximum.
assert.equal(GROUND_VIEW_DISTANCE.initial, 3.2);
assert.equal(GROUND_VIEW_DISTANCE.min, 3.2);
assert.ok(SHOULDER_HEIGHT > 1.55, 'pivot sits higher than the old 1.55');

for (const distance of [3.2, 5.8, 9]) {
  for (let pitch = -1.52; pitch <= 1.52; pitch += 0.19) {
    for (const yaw of [0, 1.1, Math.PI]) {
      const view = shoulderCamera(T, feet, yaw, pitch, distance, scale);
      // The camera never sinks under the floor, however high the player looks.
      assert.ok(
        view.eye.y >= feet.y + FLOOR_CLEARANCE * scale - 1e-9,
        `eye above the floor (pitch ${pitch.toFixed(2)}, distance ${distance})`,
      );
      // The view direction always follows the mouse pitch.
      assert.ok(Math.abs(view.forward.y + Math.sin(pitch)) < 1e-9, 'forward.y follows the pitch');
      assert.ok(Math.abs(view.forward.length() - 1) < 1e-9);
    }
  }
}
// Looking at the sky: the camera stays low and tilts up.
const sky = shoulderCamera(T, feet, 0.5, -1.4, 3.2, scale);
assert.ok(sky.tilted && sky.forward.y > 0.9, 'looking up tilts the camera');
// In the normal range the old behaviour holds: the camera looks at the pivot.
const normal = shoulderCamera(T, feet, 0.5, GROUND_VIEW_PITCH, 3.2, scale);
assert.ok(!normal.tilted);
assert.ok(normal.forward.distanceTo(normal.offset.clone().normalize().negate()) < 1e-9);
// The camera can go as low as the floor margin permits, further than before.
const low = shoulderCamera(T, feet, 0, -0.45, 3.2, scale);
assert.ok(!low.tilted, 'orbit reaches about -29 degrees before tilting');
console.log(
  'Ground camera: closest zoom by default, higher pivot, sky view without sinking into the floor.',
);
