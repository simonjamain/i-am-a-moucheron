import assert from 'node:assert/strict';
import { stepHeliAim, HELI } from '../src/helicopter.js';
for (const hz of [30, 60, 144]) {
  const actual = { yaw: 0, pitch: -0.2 },
    pending = { yaw: 100, pitch: -1 };
  stepHeliAim(actual, pending, 1 / hz);
  const stopped = { ...actual };
  stepHeliAim(actual, pending, 1 / hz);
  assert.deepEqual(
    actual,
    stopped,
    'no new mouse movement must stop immediately, without chasing pending target',
  );
  pending.yaw -= 100;
  const before = actual.yaw;
  stepHeliAim(actual, pending, 1 / hz);
  assert.ok(actual.yaw < before, 'reverse starts from actual position');
  assert.ok(Math.abs(actual.yaw - before) <= HELI.turretSpeed / hz + 1e-12);
}
console.log(
  'Issue #10: consumed input stops next frame and reverses without old backlog at 30/60/144 Hz.',
);

// The shipped focus/menu reset must discard input before reacquiring control.
const { readFileSync } = await import('node:fs');
const vm = await import('node:vm');
const source = readFileSync('src/client.js', 'utf8');
const actual = { yaw: 0.7, pitch: -0.2 },
  pending = { yaw: 100, pitch: -1 };
const context = vm.createContext({
  myVehicle: { type: 'helicopter' },
  crewSeat: 'copilot',
  turretAim: pending,
  heliTurretAim: actual,
  gunSalvos: { clear() {} },
  freeLook: {},
  holdZoom: { reset() {} },
  keys: { KeyQ: true },
  keyBindings: new Map(),
  uiWeaponFire: true,
  mouseFire: true,
  shooting: true,
  mousePrevious: 1,
});
vm.runInContext(
  source.slice(source.indexOf('function clearControls()'), source.indexOf('const keyBindings =')),
  context,
);
vm.runInContext('clearControls()', context);
assert.deepEqual(pending, actual, 'focus/menu reset discards pending motion');
stepHeliAim(actual, pending, 1 / 60);
assert.deepEqual(actual, { yaw: 0.7, pitch: -0.2 });
