import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { HELI, stepHelicopter, stepHeliAim } from '../src/helicopter.js';
import { VEHICLES, vehiclePad } from '../src/fleet.js';
import { MAP } from '../src/scale.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
// Half-turn takes a full second; diagonal motion shares the same angular budget.
for (const hz of [30, 60, 144]) {
  const actual = { yaw: 0, pitch: 0 },
    desired = { yaw: Math.PI, pitch: 0 };
  for (let i = 0; i < hz / 2; i++) stepHeliAim(actual, desired, 1 / hz);
  near(actual.yaw, Math.PI / 2);
  for (let i = 0; i < hz / 2; i++) stepHeliAim(actual, desired, 1 / hz);
  near(Math.abs(actual.yaw), Math.PI);
}
const wrapped = { yaw: Math.PI - 0.1, pitch: -0.2 };
stepHeliAim(wrapped, { yaw: -Math.PI + 0.1, pitch: -0.2 }, 0.1);
near(wrapped.yaw, -Math.PI + 0.1);
const diagonal = { yaw: 0, pitch: 0 };
stepHeliAim(diagonal, { yaw: 2, pitch: -1 }, 0.1);
near(Math.hypot(diagonal.yaw, diagonal.pitch), Math.PI * 0.1);
const down = { yaw: 0, pitch: 0 };
stepHeliAim(down, { yaw: 8 * Math.PI + 0.7, pitch: -4 }, 2);
near(down.yaw, 0.7);
near(down.pitch, HELI.minPitch);
// Actual physics: near-vertical pitch and fast descent, then released hover.
const state = { ...vehiclePad('helicopter'), p: [0, 2, 0], q: [0, 0, 0, 1], landed: false };
const direction = [0, -Math.sin(HELI.maxTilt), -Math.cos(HELI.maxTilt)];
for (let i = 0; i < 480; i++)
  stepHelicopter(T, state, { direction, collective: 0 }, [], 1 / 120, VEHICLES.helicopter);
const euler = new T.Euler().setFromQuaternion(new T.Quaternion().fromArray(state.q), 'YXZ');
assert.ok(Math.abs(euler.x) > (84 * Math.PI) / 180);
assert.equal(state.hp, 200);
const descent = { ...vehiclePad('helicopter'), p: [0, 2, 0], q: [0, 0, 0, 1], landed: false };
for (let i = 0; i < 480; i++)
  stepHelicopter(T, descent, { collective: -1 }, [], 1 / 120, VEHICLES.helicopter);
assert.ok(descent.v[1] < -MAP.metres(29));
for (let i = 0; i < 1200; i++) stepHelicopter(T, descent, {}, [], 1 / 120, VEHICLES.helicopter);
assert.ok(Math.abs(descent.v[1]) < MAP.metres(0.001));
assert.equal(descent.hp, 200);
console.log(
  'PASS: H2 85-degree pitch, fast descent and released hover; 360-degree turret, shortest wrap and 180 degrees/s at 30/60/144 Hz.',
);

// Execute the shipped direction path: a sudden pointer jump must not redirect a shot.
const source = readFileSync('src/client.js', 'utf8');
const context = vm.createContext({
  T,
  myVehicle: { type: 'helicopter' },
  crewSeat: 'copilot',
  turretAim: { yaw: Math.PI, pitch: 0 },
  heliTurretAim: { yaw: 0, pitch: 0 },
  me: { quaternion: new T.Quaternion() },
});
vm.runInContext(
  source.slice(
    source.indexOf('function turretDirection('),
    source.indexOf('function nearestStation()'),
  ),
  context,
);
near(vm.runInContext('weaponDirection().x', context), 0);
near(vm.runInContext('weaponDirection().z', context), -1);
stepHeliAim(context.heliTurretAim, context.turretAim, 0.5);
near(vm.runInContext('weaponDirection().x', context), -1);
near(vm.runInContext('weaponDirection().z', context), 0);
console.log(
  'PASS: shipped client shot direction follows actual mount rather than instant pointer target.',
);
