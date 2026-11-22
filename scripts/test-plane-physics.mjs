// The biplane as a Rapier rigid body flown with forces (src/plane-physics.ts),
// headless against the vendor Rapier the browser loads. Feel still needs a real flight.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { mouseFlightControls } from '../src/mouse-flight.ts';
import { MAP } from '../src/scale.ts';
import { VEHICLES } from '../src/fleet.ts';
import { loadRapier, toPhysics } from '../src/physics-world.ts';
import {
  K,
  PLANE_PARAMS,
  PlaneRig,
  liftCoefficient,
  dragCoefficient,
} from '../src/plane-physics.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const profile = VEHICLES.fighter;
const m = (v) => MAP.metres(v); // reference metres -> world
const quat = (pitch = 0, yaw = 0) => {
  const [sx, cx, sy, cy] = [
    Math.sin(pitch / 2),
    Math.cos(pitch / 2),
    Math.sin(yaw / 2),
    Math.cos(yaw / 2),
  ];
  // yaw about y, then pitch about x
  return [cy * sx, sy * cx, -sy * sx, cy * cx];
};
const fresh = ({ y, speed = 0, pitch = 0, gas = 0, climb = 0 }) => ({
  p: [0, m(y), 0],
  q: quat(pitch),
  v: [0, m(climb), -m(speed)],
  omega: [0, 0, 0],
  hp: 100,
  gas,
  landed: false,
});
const fly = (state, controls, seconds, rig = new PlaneRig(RAPIER), each = () => {}) => {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    const c = typeof controls === 'function' ? controls(t, state, rig) : controls;
    rig.step(state, c, [], dt, profile);
    each(state, rig, t);
  }
  return rig;
};
const altitude = (s) => s.p[1] / MAP.metres(1);
const speedOf = (s) => Math.hypot(...s.v) / MAP.metres(1);
const none = { pitch: 0, roll: 0, yaw: 0 };

// 1. Lift curve: linear, stalls, keeps a little lift after, more drag when stalled.
const stall = PLANE_PARAMS.stallAngle;
assert.ok(liftCoefficient(stall * 0.5) > 0 && liftCoefficient(-stall * 0.5) < 0);
assert.ok(liftCoefficient(stall) > liftCoefficient(stall * 1.8), 'lift falls past the stall');
assert.ok(liftCoefficient(stall * 1.8) > 0, 'but does not vanish');
assert.ok(dragCoefficient(stall * 1.8) > 3 * dragCoefficient(0.05), 'stalled wing drags');

// 2. Cruise: at 40 m/s with some throttle the aircraft keeps flying (no NaN, no fall).
{
  const s = fresh({ y: 60, speed: 40, gas: 0.7 });
  fly(s, none, 6);
  assert.ok(s.p.every(Number.isFinite) && s.v.every(Number.isFinite), 'finite state');
  assert.ok(
    Math.abs(altitude(s) - 60) < 8,
    `released at cruise speed it flies level (altitude ${altitude(s).toFixed(1)} m)`,
  );
  assert.ok(speedOf(s) > 25 && speedOf(s) < PLANE_PARAMS.thrustLimit, 'speed stays sane');
}

// 3. Take-off on the floor: throttle up, roll, pull back at flying speed, leave the ground.
{
  const s = fresh({ y: 1.85, gas: 1 });
  let airborne = false,
    topSpeed = 0;
  fly(
    s,
    (t, state) => ({ pitch: speedOf(state) > 23 ? 0.5 : 0, roll: 0, yaw: 0 }),
    30,
    new PlaneRig(RAPIER),
    (state) => {
      topSpeed = Math.max(topSpeed, speedOf(state));
      if (altitude(state) > 6) airborne = true;
    },
  );
  assert.ok(airborne, `takes off (top speed ${topSpeed.toFixed(1)} m/s)`);
  assert.ok(topSpeed > 18 && topSpeed < 75);
}

// 4. A stall: nose up, no power, slow: the angle of attack passes the stall angle, the
// nose drops by itself and the aircraft loses height.
{
  const s = fresh({ y: 80, speed: 24, gas: 0 });
  let peak = 0;
  const start = altitude(s);
  fly(s, { pitch: 1, roll: 0, yaw: 0 }, 8, new PlaneRig(RAPIER), (state, rig) => {
    peak = Math.max(peak, Math.abs(rig.alpha));
  });
  assert.ok(
    peak > PLANE_PARAMS.stallAngle,
    `angle of attack passed the stall (${peak.toFixed(2)})`,
  );
  assert.ok(altitude(s) < start, 'a stalled aircraft loses height');
}

// 5. Uneven ground: glide onto a 7° slope; the aircraft lands on its wheels, follows the
// slope and does not crash.
{
  const rig = new PlaneRig(RAPIER);
  const slope = (7 * Math.PI) / 180;
  const angle = -slope; // surface rising towards -z (the nose): rotation about x
  const half = [40, 0.5, 400];
  rig.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...half)
      .setTranslation(0, -0.5 * Math.cos(slope), -150 * 0.17)
      .setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) })
      .setFriction(1),
  );
  const s = fresh({ y: 14, speed: 24, pitch: 0.02, gas: 0.15, climb: -2.2 });
  let worst = 0,
    landed = false;
  fly(
    s,
    (t, state) => ({ pitch: altitude(state) < 8 ? 0.25 : 0, roll: 0, yaw: 0 }),
    14,
    rig,
    (state) => {
      worst = Math.max(worst, state.impact ?? 0);
      if (state.landed) landed = true;
    },
  );
  assert.ok(landed, 'touches down on its wheels');
  assert.ok(worst < 6, `a gentle landing is not a crash (impact ${worst.toFixed(2)} m/s)`);
  assert.ok(s.hp > 0);
}

// 6. A dive into the floor is a hard impact, reported in reference m/s.
{
  const s = fresh({ y: 25, speed: 40, pitch: -1.2, gas: 0.5, climb: -35 });
  let worst = 0;
  fly(s, none, 4, new PlaneRig(RAPIER), (state) => {
    worst = Math.max(worst, state.impact ?? 0);
  });
  assert.ok(worst > 12, `a dive hits hard (${worst.toFixed(1)} m/s)`);
}
// 7. Mouse aim (the instructor of src/mouse-flight.ts, War Thunder style): the pilot points
// at a direction, the aircraft banks and pulls round to it by itself and keeps flying.
for (const [name, yawDeg, pitchDeg] of [
  ['right and up', 60, 15],
  ['left and down', -90, -10],
]) {
  const s = fresh({ y: 80, speed: 40, gas: 0.8 });
  const target = new T.Vector3(0, 0, -1).applyEuler(
    new T.Euler((pitchDeg * Math.PI) / 180, (-yawDeg * Math.PI) / 180, 0, 'YXZ'),
  );
  let slowest = Infinity,
    best = Infinity;
  fly(
    s,
    (t, state) => {
      const q = new T.Quaternion(...state.q),
        w = new T.Vector3(...state.omega).applyQuaternion(q.clone().invert());
      return mouseFlightControls(T, { q, omega: w, direction: target });
    },
    14,
    new PlaneRig(RAPIER),
    (state) => {
      slowest = Math.min(slowest, speedOf(state));
      const f = new T.Vector3(0, 0, -1).applyQuaternion(new T.Quaternion(...state.q));
      best = Math.min(best, f.angleTo(target));
    },
  );
  assert.ok(best < 0.2, `${name}: the nose reaches the target (closest ${best.toFixed(2)} rad)`);
  assert.ok(
    slowest > PLANE_PARAMS.stallSpeed * 0.8,
    `${name}: stays above stall speed (${slowest.toFixed(1)})`,
  );
  assert.ok(altitude(s) > 5, `${name}: does not fall out of the sky`);
}
// 8. On the ground the controls need air. Engine off and standing still, the stick does
// nothing: no roll, no pitch, no turn. With a little power the propeller blows over the
// rudder, so the aircraft can be pointed once it moves; the ailerons stay dead.
{
  const euler = (state) => new T.Euler().setFromQuaternion(new T.Quaternion(...state.q), 'YXZ');
  const idle = fresh({ y: 1.85, gas: 0 });
  fly(idle, { pitch: 1, roll: 1, yaw: 1 }, 3);
  const e = euler(idle);
  assert.ok(
    Math.abs(e.z) < 0.02 && Math.abs(e.y) < 0.02,
    'engine off: stick roll and rudder do nothing',
  );
  assert.ok(
    Math.abs(e.x - euler(fresh({ y: 1.85 })).x) < 0.05 || Math.abs(e.x) < 0.3,
    'no pitch authority',
  );
  assert.ok(speedOf(idle) < 0.5, 'and it stays put');
  const aileron = fresh({ y: 1.85, gas: 0.35 });
  let roll = 0;
  fly(aileron, { pitch: 0, roll: 1, yaw: 0 }, 6, new PlaneRig(RAPIER), (state) => {
    roll = Math.max(roll, Math.abs(euler(state).z));
  });
  assert.ok(
    roll < 0.05,
    `taxiing with full aileron does not roll the aircraft (${roll.toFixed(3)} rad)`,
  );
  const rudder = fresh({ y: 1.85, gas: 0.35 });
  fly(rudder, { pitch: 0, roll: 0, yaw: 1 }, 6);
  assert.ok(
    Math.abs(euler(rudder).y) > 0.1,
    'the rudder in the propeller wash turns it once it moves',
  );
}
console.log('test-plane-physics ok', { K: +K.toFixed(4), toPhysics: +toPhysics(m(1)).toFixed(4) });
