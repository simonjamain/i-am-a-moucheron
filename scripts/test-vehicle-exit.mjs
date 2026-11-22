import assert from 'node:assert/strict';
import { VEHICLES, HULL_HALF_WIDTH, doorOffset, vehicleEntry } from '../src/fleet.ts';
import { MAP } from '../src/scale.ts';

// Leaving a vehicle puts the player beside the hull, never at the wingtip or the rotor tip.
for (const type of Object.keys(VEHICLES)) {
  const hull = HULL_HALF_WIDTH[type] ?? VEHICLES[type].span / 2;
  const door = doorOffset(type);
  assert.ok(door > hull, type + ': the door is outside the hull');
  assert.ok(door <= hull + 1.5, type + ': the door stays close to the hull');
  if (HULL_HALF_WIDTH[type] !== undefined)
    assert.ok(door < VEHICLES[type].span / 2 / 2, type + ': well inside the wing / rotor span');
}
// Entry point of every seat: lateral distance equals the door offset (identity attitude).
const state = { p: [0, 0, 0], q: [0, 0, 0, 1], hp: 100 };
for (const [type, profile] of Object.entries(VEHICLES))
  for (const seat of profile.seats) {
    const e = vehicleEntry({ type, state }, seat);
    assert.ok(
      Math.abs(Math.abs(e.x) - doorOffset(type) * MAP.ratio) < 1e-9,
      type + '/' + seat + ': lateral offset is the door offset',
    );
  }
console.log('Vehicle exit: door beside the hull for every vehicle and seat');
