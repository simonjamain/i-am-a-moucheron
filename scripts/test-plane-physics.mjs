// The biplane as a Rapier rigid body flown with forces (src/plane-physics.ts),
// headless against the vendor Rapier the browser loads. Feel still needs a real flight.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { mouseFlightControls } from '../src/mouse-flight.ts';
import { MAP } from '../src/scale.ts';
import { VEHICLES } from '../src/fleet.ts';
import { BIPLANE_DATA } from '../src/meshy-biplane-data.ts';
import { BIPLANE_BOMBER_DATA } from '../src/meshy-biplane-bomber-data.ts';
import { M1_DATA } from '../src/meshy-m1-data.ts';
import { B3_DATA } from '../src/meshy-b3-data.ts';
import { MODEL_DATA as STUKA } from '../src/meshy-stuka-data.ts';
import { MODEL_DATA as SPITFIRE } from '../src/meshy-spitfire-data.ts';
import { loadRapier, toPhysics } from '../src/physics-world.ts';
import {
  PLANE_TYPES,
  planeSpec,
  MODEL_TO_REF,
  K,
  PLANE_PARAMS,
  PlaneRig,
  liftCoefficient,
  dragCoefficient,
  controlAuthority,
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
    rig.step(state, c, [], dt, VEHICLES[rig.spec.type]);
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
  const angle = slope; // surface rising towards -z (the nose): rotation about x
  const half = [40, 0.5, 400];
  rig.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...half)
      .setTranslation(0, -0.5 * Math.cos(slope), 0)
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
// 9. The physics are where the model is: the main springs sit on the model's wheel hubs
// (the wheels are parts of the model, lifted by the compression), the tail wheel has half
// the travel of the mains, and at rest the aircraft rests on its three wheels, tail down.
{
  const hubs = ['wheelL', 'wheelR'].map((name) => BIPLANE_DATA.rig.find((n) => n.name === name));
  assert.ok(hubs.every(Boolean), 'the model has its two wheel parts');
  hubs.forEach((hub, i) => {
    const gear = planeSpec('fighter').gears[i];
    assert.ok(Math.abs(gear.x - hub.pivot[0] * MODEL_TO_REF) < 0.05, 'wheel ' + i + ' across');
    assert.ok(Math.abs(gear.z - hub.pivot[2] * MODEL_TO_REF) < 0.05, 'wheel ' + i + ' along');
  });
  const fighterGears = planeSpec('fighter').gears;
  assert.ok(
    Math.abs(fighterGears[2].rest * 2 - fighterGears[0].rest) < 1e-9,
    'tail travel is half the mains',
  );
  const parked = fresh({ y: 1.85, gas: 0 });
  const rig = fly(parked, none, 4, new PlaneRig(RAPIER));
  assert.ok(
    rig.compression.every((c) => c > 0),
    'rests on its three wheels',
  );
  assert.ok(
    Math.abs(rig.compression[0] - planeSpec('fighter').sag) < 0.06,
    'main springs sag about their static value',
  );
  assert.ok(rig.compression[2] <= fighterGears[2].rest, 'the tail spring stays within its travel');
  const e = new T.Euler().setFromQuaternion(new T.Quaternion(...parked.q), 'YXZ');
  assert.ok(e.x > 0.15 && e.x < 0.35, `three-point attitude, nose up (${e.x.toFixed(2)} rad)`);
}
// 10. Every aircraft flown by the engine: it has wheel parts that match its springs, rests
// on three wheels, takes off, flies level when released at its trim speed, turns to the
// mouse aim without stalling, and a dive is a hard impact.
const MODELS = {
  fighter: BIPLANE_DATA,
  bomber: BIPLANE_BOMBER_DATA,
  lightfighter: M1_DATA,
  medbomber: B3_DATA,
  interceptor: STUKA,
  spitfire: SPITFIRE,
};
assert.deepEqual([...PLANE_TYPES].sort(), Object.keys(MODELS).sort(), 'every aircraft is covered');
for (const type of PLANE_TYPES) {
  const spec = planeSpec(type),
    vehicle = VEHICLES[type],
    vs = spec.params.stallSpeed;
  const hubs = ['wheelL', 'wheelR'].map((name) => MODELS[type].rig.find((n) => n.name === name));
  assert.ok(hubs.every(Boolean), type + ': the model has its two wheel parts');
  hubs.forEach((hub, i) => {
    assert.ok(
      Math.abs(Math.abs(spec.gears[i].x) - Math.abs(hub.pivot[0]) * MODEL_TO_REF) < 0.15,
      type + ' wheel across',
    );
    assert.ok(
      Math.abs(spec.gears[i].z - hub.pivot[2] * MODEL_TO_REF) < 0.15,
      type + ' wheel along',
    );
  });
  assert.ok(
    Math.abs(spec.gears[2].rest * 2 - spec.gears[0].rest) < 1e-9,
    type + ': half tail travel',
  );
  const height = spec.gears[0].rest - spec.gears[0].y - spec.sag; // wheels' bottoms on the floor
  const onGround = (gas = 0) => ({
    p: [0, m(height + 0.05), 0],
    q: [0, 0, 0, 1],
    v: [0, 0, 0],
    omega: [0, 0, 0],
    hp: 100,
    gas,
    landed: true,
  });
  // Rests on three wheels, nose up, without damage.
  {
    const state = onGround(),
      rig = fly(state, none, 6, new PlaneRig(RAPIER, type));
    assert.ok(
      rig.compression.every((c) => c > 0),
      type + ': rests on its three wheels',
    );
    const e = new T.Euler().setFromQuaternion(new T.Quaternion(...state.q), 'YXZ');
    assert.ok(e.x > 0.05 && e.x < 0.45, `${type}: nose-up rest attitude (${e.x.toFixed(2)} rad)`);
    assert.ok(speedOf(state) < 0.5, type + ': stays put');
  }
  // Takes off: full throttle, pull back near flying speed.
  {
    const state = onGround(1);
    let airborne = false;
    fly(
      state,
      (t, s) => ({ pitch: speedOf(s) > 1.35 * vs ? 0.5 : 0, roll: 0, yaw: 0 }),
      45,
      new PlaneRig(RAPIER, type),
      (s) => {
        if (altitude(s) > height + 6) airborne = true;
      },
    );
    assert.ok(airborne, type + ': takes off');
  }
  // Released at its trim speed (about 2.3 times the stall speed), it keeps its height.
  {
    const speed = 2.34 * vs,
      state = fresh({ y: 80, speed, gas: 0.7 });
    fly(state, none, 6, new PlaneRig(RAPIER, type));
    assert.ok(
      Math.abs(altitude(state) - 80) < 14,
      `${type}: level flight (${altitude(state).toFixed(1)} m)`,
    );
  }
  // Full stick back with speed to spare: the best turn the wings give, never a stall.
  {
    const state = fresh({ y: 200, speed: 1.9 * vs, gas: 1 });
    let worst = 0;
    // (once the turn has bled the speed below 1.5 times the stall speed, stalling is fair)
    fly(state, { pitch: 1, roll: 0, yaw: 0 }, 3, new PlaneRig(RAPIER, type), (s, rig) => {
      if (speedOf(s) > 1.5 * vs)
        worst = Math.max(worst, Math.abs(rig.alpha + spec.params.zeroLift));
    });
    assert.ok(
      worst < spec.params.stallAngle,
      `${type}: no stall pulling hard at speed (${worst.toFixed(2)} rad)`,
    );
  }
  // Mouse aim: right and up by 60° and 15°, without stalling.
  {
    const state = fresh({ y: 90, speed: 2.34 * vs, gas: 0.8 });
    const target = new T.Vector3(0, 0, -1).applyEuler(
      new T.Euler((15 * Math.PI) / 180, (-60 * Math.PI) / 180, 0, 'YXZ'),
    );
    let best = Infinity,
      slowest = Infinity;
    fly(
      state,
      (t, s) => {
        const q = new T.Quaternion(...s.q),
          w = new T.Vector3(...s.omega).applyQuaternion(q.clone().invert());
        return mouseFlightControls(T, { q, omega: w, direction: target }, {});
      },
      18,
      new PlaneRig(RAPIER, type),
      (s) => {
        slowest = Math.min(slowest, speedOf(s));
        best = Math.min(
          best,
          new T.Vector3(0, 0, -1).applyQuaternion(new T.Quaternion(...s.q)).angleTo(target),
        );
      },
    );
    assert.ok(best < 0.25, `${type}: the nose reaches the target (${best.toFixed(2)} rad)`);
    assert.ok(slowest > vs * 0.8, `${type}: stays above stall speed (${slowest.toFixed(1)})`);
  }
  // A dive into the floor is a hard impact.
  {
    const state = fresh({ y: 30, speed: 2 * vs, pitch: -1.2, gas: 0.5, climb: -1.6 * vs });
    let worst = 0;
    fly(state, none, 6, new PlaneRig(RAPIER, type), (s) => {
      worst = Math.max(worst, s.impact ?? 0);
    });
    assert.ok(worst > 12, `${type}: a dive hits hard (${worst.toFixed(1)} m/s)`);
  }
}
console.log('test-plane-physics ok', { K: +K.toFixed(4), toPhysics: +toPhysics(m(1)).toFixed(4) });

// The Spitfire lifts at a modest speed: its stall speed is a fifth of its top speed, well
// under the third the other planes have, and its control surfaces bite from a lower speed.
{
  const spit = planeSpec('spitfire').params.stallSpeed;
  assert.ok(
    spit <= 0.2 * VEHICLES.spitfire.maxSpeed + 0.05,
    'Spitfire stalls at 20 % of top speed',
  );
  assert.ok(spit < 0.32 * VEHICLES.spitfire.maxSpeed * 0.7, 'and well below the old 32 %');
  assert.ok(
    controlAuthority(20, 1, true, VEHICLES.spitfire, planeSpec('spitfire').params).pitch > 0.6,
    'the Spitfire steers at 20 m/s',
  );
}

// The room's walls are contacts of the engine, like any decor: an aircraft flying into any of
// the four (the room has no front wall in the model) is stopped in the room and feels the
// speed change as an impact above the crash threshold. Nothing else is needed to crash.
{
  const { PLANE_CRASH_IMPACT } = await import('../src/plane-physics.ts');
  for (const heading of [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
  ]) {
    const s = {
      p: [0, 1.0, 0],
      q: [0, 0, 0, 1],
      v: heading.map((c) => c * m(40)),
      omega: [0, 0, 0],
      hp: 100,
      gas: 1,
      landed: false,
    };
    const rig = new PlaneRig(RAPIER);
    let worst = 0;
    for (let i = 0; i < 2400; i++) {
      rig.step(s, none, [], 1 / 60, VEHICLES.fighter);
      worst = Math.max(worst, s.impact);
    }
    assert.ok(
      Math.abs(s.p[0]) < 4.4 && Math.abs(s.p[2]) < 3.8,
      'stays inside the walls ' + heading,
    );
    assert.ok(
      worst > PLANE_CRASH_IMPACT,
      'a wall hit crashes: ' + worst.toFixed(1) + ' ' + heading,
    );
  }
}
