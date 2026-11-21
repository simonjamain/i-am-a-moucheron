// Every aircraft must take off from a flat surface, and air routes must stay
// below the cloud layer that did not follow the raised flight ceiling.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { stepFlight, ROLLING_FRICTION, LIFTOFF_SPEED } from '../src/flight.ts';
import { VEHICLES } from '../src/fleet.ts';
import { enemyRoute } from '../src/routes.js';
import { OFFICE_CLOUD_TOP, FOG_START_RATIO } from '../src/office-fog.ts';

const dt = 1 / 60;
const planes = ['fighter', 'bomber', 'interceptor', 'spitfire', 'helicopter', 'stuka'].filter(
  (k) => VEHICLES[k],
);
assert.ok(planes.includes('fighter') && planes.includes('bomber'));
for (const kind of planes) {
  const profile = VEHICLES[kind];
  const q = new T.Quaternion(),
    vel = new T.Vector3(),
    omega = new T.Vector3(),
    wind = new T.Vector3();
  let y = 0,
    landed = true,
    airborne = null;
  for (let t = 0; t < 40 && airborne === null; t += dt) {
    stepFlight(
      T,
      {
        q,
        vel,
        omega,
        wind,
        gas: 1,
        engine: 1,
        pitch: landed ? 0 : 0.35,
        roll: 0,
        yaw: 0,
        scale: 1,
        profile,
      },
      dt,
    );
    y += vel.y * dt;
    if (landed) {
      vel.y = 0;
      y = Math.max(0, y);
      vel.x *= Math.exp(-dt * ROLLING_FRICTION);
      vel.z *= Math.exp(-dt * ROLLING_FRICTION);
      if (vel.length() > LIFTOFF_SPEED) {
        q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.7 * dt));
        vel.y = 2;
        y += 0.016;
        landed = false;
      }
    } else {
      assert.ok(y > 0, `${kind} retombe au sol après le décollage`);
      if (y > 1.5) airborne = t;
    }
  }
  assert.ok(airborne !== null, `${kind} doit décoller depuis une surface plane`);
  assert.ok(airborne < 15, `${kind} décolle en moins de 15 s (${airborne.toFixed(1)} s)`);
}

const cloudStart = OFFICE_CLOUD_TOP * FOG_START_RATIO;
for (let portalIndex = 0; portalIndex < 4; portalIndex++) {
  const { samples } = enemyRoute({ routeSeed: 1, portalIndex });
  // The first metres leave the vent itself; the travelling route stays clear.
  const top = Math.max(...samples.slice(48).map((s) => s.p[1]));
  assert.ok(top <= cloudStart, `trajectoire ${portalIndex} sous les nuages (${top} m)`);
}
console.log('takeoff ok');
