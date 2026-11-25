import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { VEHICLES, pilotFireInterval, isRotorcraft } from '../src/fleet.ts';
import {
  fullAmmo,
  ammoCapacity,
  advanceSupplies,
  serviceEligible,
  inRadarCoverage,
  vehicleHue,
  installationCount,
} from '../src/logistics.ts';
import { shopPrice } from '../src/equipment.ts';
import { createGraphics } from '../src/graphics.ts';
import { paintVehicle, updateInscriptions } from '../src/vehicle-livery.ts';
import * as T from '../vendor/three.webgpu.min.js';
// Documents can no longer be torn: no tear button nor handler.
const clientSource = readFileSync('src/client.js', 'utf8');
assert.doesNotMatch(clientSource, /paperTear|replacementCounter/);
assert.doesNotMatch(readFileSync('src/index.html', 'utf8'), /paperTear|Déchirer/);
for (const type of Object.keys(VEHICLES)) {
  const ammo = fullAmmo(type),
    state = { p: [0, 1, 0], v: [0, 0, -0.1], landed: false, hp: 100, engine: 1, gas: 1 };
  let supply = { fuel: 300, ammo };
  for (let i = 0; i < 3000; i++) supply = advanceSupplies(supply, state, type, [], 0.1);
  assert.ok(supply.fuel < 1e-8);
  assert.equal(
    advanceSupplies({ fuel: 300, ammo }, { ...state, gas: 0.5 }, type, [], 300).fuel,
    isRotorcraft(type) ? 0 : 150,
  );
  assert.equal(
    advanceSupplies({ fuel: 100, ammo }, { ...state, engine: 0 }, type, [], 300).fuel,
    100,
  );
  for (const seat of VEHICLES[type].seats.filter(
    () => !['tank', 'spitfire', 'helicopter', 'flaktruck', 'castor'].includes(type),
  ))
    assert.ok(
      !ammo[seat] ||
        Math.abs(
          ammoCapacity(type, seat) * (seat === 'pilot' ? pilotFireInterval(type) : 0.09) - 60,
        ) < 0.05,
    );
  const station = { kind: 'refuel', x: 0, y: 0.9, z: 0 };
  const parked = { ...state, p: [0, 0.9 + VEHICLES[type].gear, 0], v: [0, 0, 0], landed: true };
  assert.ok(serviceEligible(parked, [station], type));
  for (const bad of [
    { ...parked, landed: false },
    { ...parked, v: [0.001, 0, 0] },
    { ...parked, p: [0.501, parked.p[1], 0] },
    { ...parked, p: [0, parked.p[1] + 0.1, 0] },
  ])
    assert.ok(!serviceEligible(bad, [station], type));
  const empty = { fuel: 0, ammo: Object.fromEntries(Object.keys(ammo).map((s) => [s, 0])) };
  const half = advanceSupplies(empty, parked, type, [station, station], 5);
  assert.equal(half.fuel, 150);
  const full = advanceSupplies(half, parked, type, [station], 5);
  assert.equal(full.fuel, 300);
  assert.deepEqual(full.ammo, ammo);
  assert.deepEqual(advanceSupplies(full, parked, type, [station], 30).ammo, ammo);
}
const radar = { kind: 'radar', x: 0, y: 0, z: 0 };
assert.ok(!inRadarCoverage({ x: 0, y: 0, z: 0 }, []));
assert.ok(inRadarCoverage({ x: 0, y: 1, z: 0 }, [radar]));
assert.ok(inRadarCoverage({ x: 0, y: 100, z: 0 }, [radar]));
assert.ok(!inRadarCoverage({ x: 2.0001, y: 0, z: 0 }, [radar]));
assert.ok(inRadarCoverage({ x: 1.5, y: 0, z: 0 }, [radar, { ...radar, x: 1 }]));
assert.equal(shopPrice('refuel', 2), 24);
assert.equal(shopPrice('radar', 0), 10);
assert.equal(
  installationCount(
    [{ kind: 'refuel', free: true }, { kind: 'radar' }, { kind: 'refuel' }],
    'refuel',
  ),
  1,
);
// Real mesh paint and hull inscription lifecycle.
const scene = new T.Scene(),
  graphics = createGraphics(T, scene);
const model = graphics.makeBomber('#c5ba92');
paintVehicle(T, model, 1, '#c5ba92');
const canvases = [];
const factory = () => {
  const c = { width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) };
  canvases.push(c);
  return c;
};
const v = {
  type: 'bomber',
  seats: [
    { seat: 'pilot', pilot: 'a' },
    { seat: 'tail', pilot: 'b' },
  ],
};
updateInscriptions(
  T,
  model,
  v,
  [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  factory,
);
assert.equal(model.userData.inscriptions.length, 4);
assert.ok(
  model.userData.inscriptions.every(
    (m) => m.isMesh && !m.isSprite && m.userData.projectileSolid === false,
  ),
);
const old = model.userData.inscriptions;
let disposed = 0;
old.forEach((m) => m.material.map.addEventListener('dispose', () => disposed++));
updateInscriptions(
  T,
  model,
  v,
  [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  factory,
);
assert.equal(canvases.length, 2);
updateInscriptions(T, model, { ...v, seats: [] }, [], factory);
assert.equal(disposed, 4);
assert.equal(model.userData.inscriptions.length, 0);
assert.notEqual(vehicleHue(1), vehicleHue(2));
assert.equal(vehicleHue(3), vehicleHue(3));
console.log(
  'PASS: golden-angle paint/hull inscriptions, no tearing, refuel eligibility/parallel filling, install price curves and spherical radar coverage.',
);
