// The two helicopters as Rapier rigid bodies (src/heli-physics.ts), headless against the
// vendor Rapier the browser loads. Feel still needs a real flight.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MAP } from '../src/scale.ts';
import { VEHICLES } from '../src/fleet.ts';
import { loadRapier } from '../src/physics-world.ts';
import { HELI_CRASH_IMPACT, HELI_TYPES, HeliRig, heliSpec } from '../src/heli-physics.ts';
import { ParkedHost } from '../src/parked-host.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const m = (v) => MAP.metres(v);
const altitude = (s) => s.p[1] / m(1);
const horizontal = (s) => Math.hypot(s.v[0], s.v[2]) / m(1);
const climb = (s) => s.v[1] / m(1);
const hold = { collective: 0, pitch: 0, roll: 0, yaw: 0 };
assert.deepEqual([...HELI_TYPES].sort(), ['flyingcastor', 'helicopter']);

for (const type of HELI_TYPES) {
  const spec = heliSpec(type),
    profile = VEHICLES[type];
  const restHeight = spec.gears[0].rest - spec.gears[0].y - spec.sag; // hubs' bottoms on the floor
  const fresh = (y, extra = {}) => ({
    p: [0, m(y), 0],
    q: [0, 0, 0, 1],
    v: [0, 0, 0],
    omega: [0, 0, 0],
    hp: 100,
    engine: 1,
    rotorPower: 1,
    landed: false,
    ...extra,
  });
  const fly = (state, controls, seconds, rig = new HeliRig(RAPIER, type), each = () => {}) => {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      const c = typeof controls === 'function' ? controls(t, state) : controls;
      rig.step(state, c, [], dt, profile);
      each(state, rig, t);
    }
    return rig;
  };

  // Neutral controls hold the altitude and the position.
  {
    const s = fresh(40);
    fly(s, hold, 6);
    assert.ok(Math.abs(altitude(s) - 40) < 0.5, `${type}: hovers (${altitude(s).toFixed(2)} m)`);
    assert.ok(horizontal(s) < 0.2, type + ': stays put');
  }
  // Collective: climb at 8 m/s, descend at up to 30 m/s.
  {
    const s = fresh(40);
    fly(s, { ...hold, collective: 1 }, 5);
    assert.ok(climb(s) > 7 && climb(s) < 8.5, `${type}: climbs at 8 m/s (${climb(s).toFixed(1)})`);
    const d = fresh(200);
    fly(d, { ...hold, collective: -1 }, 4);
    assert.ok(climb(d) < -25, `${type}: descends fast (${climb(d).toFixed(1)})`);
  }
  // Tilting the nose down accelerates, up to a top speed set by the drag, at constant height.
  {
    const s = fresh(60);
    fly(s, { ...hold, pitch: -1 }, 14);
    assert.ok(
      horizontal(s) > 0.85 * profile.maxSpeed * 0.9 && horizontal(s) < profile.maxSpeed,
      `${type}: top speed (${horizontal(s).toFixed(1)} m/s)`,
    );
    assert.ok(Math.abs(altitude(s) - 60) < 5, type + ': the altitude is held in the dive');
    const e = new T.Euler().setFromQuaternion(new T.Quaternion(...s.q), 'YXZ');
    assert.ok(Math.abs(e.x) <= Math.PI / 4 + 0.08, `${type}: tilt within 45° (${e.x.toFixed(2)})`);
  }
  // Mouse aim: turn right by 60° and look 15° up: the nose follows, the helicopter does not fall.
  {
    const s = fresh(80);
    const dir = new T.Vector3(0, 0, -1).applyEuler(
      new T.Euler((15 * Math.PI) / 180, (-60 * Math.PI) / 180, 0, 'YXZ'),
    );
    fly(s, { collective: 0, direction: dir.toArray() }, 6);
    const forward = new T.Vector3(0, 0, -1).applyQuaternion(new T.Quaternion(...s.q));
    assert.ok(
      forward.angleTo(dir) < 0.35,
      `${type}: follows the mouse (${forward.angleTo(dir).toFixed(2)} rad)`,
    );
    assert.ok(altitude(s) > 60, type + ': keeps flying');
  }
  // Engine off: the rotor spins down and the helicopter falls.
  {
    const s = fresh(60, { engine: 0 });
    fly(s, hold, 3);
    assert.ok(climb(s) < -8, `${type}: falls without the engine (${climb(s).toFixed(1)})`);
  }
  // On the ground with neutral controls it sits on its gear; a climb order lifts it.
  {
    const s = fresh(restHeight + 0.05),
      rig = fly(s, hold, 5);
    assert.ok(
      rig.compression.every((c) => c > 0),
      type + ': rests on all its gear',
    );
    assert.ok(s.landed && horizontal(s) < 0.1 && s.hp > 0, type + ': sits still, undamaged');
    fly(s, { ...hold, collective: 1 }, 4, rig);
    assert.ok(altitude(s) > restHeight + 8, `${type}: takes off (${altitude(s).toFixed(1)} m)`);
  }
  // A gentle landing is fine, a fall at full descent is a crash.
  {
    const s = fresh(20);
    fly(s, { ...hold, collective: -0.1 }, 12);
    assert.ok(s.hp > 0 && s.landed, `${type}: lands gently (${altitude(s).toFixed(1)} m)`);
    const c = fresh(30);
    fly(c, { ...hold, collective: -1 }, 5);
    assert.ok(c.hp <= 0, type + ': crashes at full descent');
    assert.ok(HELI_CRASH_IMPACT > 0);
  }

  // Left by its pilot (the server's world): the rotor spins down, it settles on its gear on a
  // 7° slope without creeping, and falls asleep.
  for (const [name, sign] of [
    ['nose uphill', 1],
    ['nose downhill', -1],
  ]) {
    const host = new ParkedHost(RAPIER, null, []);
    const slope = (7 * Math.PI) / 180;
    host.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(40, 0.5, 40)
        .setTranslation(0, -0.5 + 0.0, 0)
        .setRotation({
          x: Math.sin((sign * slope) / 2),
          y: 0,
          z: 0,
          w: Math.cos((sign * slope) / 2),
        }),
    );
    host.sync([
      {
        id: 'h',
        type,
        profile,
        state: fresh(restHeight + 0.4, { landed: true, gas: 0 }),
      },
    ]);
    let last = null,
      destroyed = false;
    for (let t = 0; t < 14000; t += 50)
      for (const u of host.step(t)) {
        last = u;
        destroyed ||= u.destroyed;
      }
    assert.ok(!destroyed, `${type} ${name}: not destroyed`);
    assert.ok(Math.hypot(...last.state.v) < m(0.1), `${type} ${name}: at rest`);
    assert.ok(host.asleep('h'), `${type} ${name}: asleep`);
    assert.ok((last.state.rotorPower ?? 1) < 0.02, `${type} ${name}: rotor stopped`);
  }
}
console.log('test-heli-physics ok');
