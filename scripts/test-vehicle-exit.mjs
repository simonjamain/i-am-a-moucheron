import assert from 'node:assert/strict';
import { VEHICLES, HULL_HALF_WIDTH, doorOffset, vehicleEntry } from '../src/fleet.ts';
import { MAP } from '../src/scale.ts';
import { walkerWorld } from './walker-harness.mjs';

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

// Sur un meuble : le joueur apparaît au-dessus de la surface, jamais sous elle.
{
  const { EXIT_LIFT } = await import('../src/fleet.ts');
  const surface = 0.4;
  for (const type of ['fighter', 'bomber', 'helicopter', 'tank'].filter((t) => VEHICLES[t])) {
    const v = { type, state: { p: [0, surface + VEHICLES[type].gear, 0], q: [0, 0, 0, 1] } };
    const y = vehicleEntry(v, 'pilot').y;
    assert.ok(y > surface, type + ' : sortie sous la surface');
    assert.ok(Math.abs(y - surface - EXIT_LIFT) < 1e-9);
  }
  console.log('Sortie : apparition au-dessus de la surface (meubles) OK');
}

// Le marcheur posé là se pose sur le meuble ; sous la surface il la traverserait.
{
  const { stepWalker } = await import('../src/sortie.ts');
  const { OFFICE_LAYOUT } = await import('../src/layout.ts');
  const { EXIT_LIFT } = await import('../src/fleet.ts');
  const { ACTOR_UNIT } = await import('../src/scale.ts');
  const o = OFFICE_LAYOUT.base,
    top = 0.4,
    desk = {
      min: { x: o.originX - 1, y: 0, z: o.originZ - 1 },
      max: { x: o.originX + 1, y: top, z: o.originZ + 1 },
    };
  const settle = (y) => {
    const body = { x: 0, z: 0, y, vy: 0, grounded: true };
    for (let i = 0; i < 60; i++) stepWalker(body, 1 / 60, walkerWorld([desk]));
    return body.y;
  };
  assert.ok(settle(top + EXIT_LIFT) > top, 'sortie sur un meuble : reste dessus');
  assert.ok(settle(top - 0.2 * ACTOR_UNIT) < top, 'témoin : trop bas, le marcheur traverse');
}
