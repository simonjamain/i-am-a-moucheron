// Issue #103: tank sight graduations reach the far end of the office and sit on
// the authoritative shell trajectory (same integrator and step as the server).
import assert from 'node:assert/strict';
import { ballisticMarks, TANK_MARKS } from '../src/tank-reticle.js';
import { HEAVY } from '../src/armament.js';
import { integrateOrdnance } from '../src/ordnance.js';
import { GROUND_BOUNDS } from '../src/ground-defense.js';
import { MAP } from '../src/scale.js';

const width = GROUND_BOUNDS[2] - GROUND_BOUNDS[0],
  depth = GROUND_BOUNDS[3] - GROUND_BOUNDS[1];
const farEnd = Math.max(width, depth);
assert.ok(TANK_MARKS.at(-1) >= farEnd, 'graduations reach across the office');
assert.deepEqual(
  [...TANK_MARKS].sort((a, b) => a - b),
  [...TANK_MARKS],
  'ordered labels',
);

function flight(weapon, pitch, until) {
  const d = [0, Math.sin(pitch), -Math.cos(pitch)];
  const shell = { weapon, p: [0, 0, 0], v: d.map((v) => v * HEAVY[weapon].speed), age: 0 };
  while (shell.age < HEAVY[weapon].lifetime && -shell.p[2] < until)
    integrateOrdnance(shell, 1 / 120);
  return shell;
}
for (const weapon of ['he', 'ap']) {
  for (const pitch of [0, 0.05, 0.15]) {
    const direction = [0, Math.sin(pitch), -Math.cos(pitch)];
    const marks = ballisticMarks(weapon, direction);
    assert.equal(marks.length, TANK_MARKS.length, weapon + ' shows every graduation at ' + pitch);
    marks.forEach((mark, i) => {
      assert.ok(
        Math.abs(mark.metres - TANK_MARKS[i]) < 1e-9,
        'label is the distance',
      );
      // Independent replay of the trajectory up to the mark's along-axis distance.
      const shell = {
        weapon,
        p: [0, 0, 0],
        v: direction.map((v) => v * HEAVY[weapon].speed),
        age: 0,
      };
      const along = (p) => p[1] * direction[1] + p[2] * direction[2];
      let before = [...shell.p];
      while (along(shell.p) < mark.metres) {
        before = [...shell.p];
        integrateOrdnance(shell, 1 / 120);
      }
      const t = (mark.metres - along(before)) / (along(shell.p) - along(before));
      const expected = before.map((v, k) => v + (shell.p[k] - v) * t);
      assert.ok(Math.hypot(...expected.map((v, k) => v - mark.point[k])) < 1e-12, 'on trajectory');
    });
    for (let i = 1; i < marks.length; i++)
      assert.ok(
        marks[i].point[1] - direction[1] * marks[i].metres <
          marks[i - 1].point[1] - direction[1] * marks[i - 1].metres,
        'drop below the bore line grows with distance',
      );
  }
  // An elevated shot is still alive when it reaches the far wall: aiming there works.
  const far = flight(weapon, 0.2, farEnd);
  assert.ok(
    -far.p[2] >= farEnd && far.age < HEAVY[weapon].lifetime,
    weapon + ' reaches the far wall',
  );
}
assert.ok(
  Math.abs(ballisticMarks('he').at(-1).point[1]) > Math.abs(ballisticMarks('ap').at(-1).point[1]),
  'slower HE drops more than AP',
);
console.log('Tank graduations: 15 cm to 9 m (real office metres) on the real HE/AP trajectories, far wall reachable.');
