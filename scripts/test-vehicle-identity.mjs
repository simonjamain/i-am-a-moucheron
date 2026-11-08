// Issue #106: no colour identity per player/vehicle, original colours kept,
// uniform white role pictograms on the seat entry circles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { paintVehicle } from '../src/vehicle-livery.js';
import { drawSeatIcon, seatRole, SEAT_ROLE_NAMES } from '../src/seat-icons.js';
import { VEHICLES } from '../src/fleet.js';

// Procedural model: the original base colour is kept for every sequence.
const make = () => {
  const g = new T.Group();
  g.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color: '#7b8155' })));
  g.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color: '#222222' })));
  return g;
};
const first = make(),
  second = make();
paintVehicle(T, first, 1, '#7b8155');
paintVehicle(T, second, 9, '#7b8155');
assert.ok(first.children[0].material.color.equals(new T.Color('#7b8155')));
assert.ok(first.children[0].material.color.equals(second.children[0].material.color));
assert.notEqual(first.children[0].material, second.children[0].material, 'private paint for dirt');
assert.ok(first.userData.baseColor.equals(new T.Color('#7b8155')));
assert.equal(first.userData.identification, undefined);
// Meshy model: untouched.
const meshy = make();
meshy.userData.preserveTexture = true;
const original = meshy.children[0].material;
paintVehicle(T, meshy, 3, '#7b8155');
assert.equal(meshy.children[0].material, original);
assert.equal(meshy.children.length, 2, 'no floating disk added');

// Every seat of every vehicle maps to a named role with a white pictogram.
for (const [type, spec] of Object.entries(VEHICLES))
  for (const seat of spec.seats)
    assert.ok(SEAT_ROLE_NAMES[seatRole(type, seat)], type + ':' + seat);
assert.equal(seatRole('tank', 'pilot'), 'driver');
assert.equal(seatRole('castor', 'pilot'), 'driver');
assert.equal(seatRole('flaktruck', 'pilot'), 'driver');
assert.equal(seatRole('fighter', 'pilot'), 'pilot');
assert.equal(seatRole('helicopter', 'copilot'), 'copilot');
assert.equal(seatRole('bomber', 'tail'), 'gunner');
assert.equal(seatRole('tank', 'cannon'), 'cannon');
assert.equal(seatRole('flaktruck', 'cannon'), 'gunner');
for (const role of Object.keys(SEAT_ROLE_NAMES)) {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (target, key) => (key in target ? target[key] : (...args) => calls.push([key, ...args])),
      set: (target, key, value) => {
        target[key] = value;
        if (key === 'strokeStyle' || key === 'fillStyle') assert.equal(value, '#ffffff');
        return true;
      },
    },
  );
  drawSeatIcon(ctx, role, 128);
  assert.ok(
    calls.some(([name]) => name === 'stroke'),
    role + ' draws',
  );
  assert.ok(!calls.some(([name]) => name === 'fillText'), role + ' uses no letter');
}

const client = readFileSync('src/client.js', 'utf8');
assert.doesNotMatch(client, /vehicleHue|userData\.identification/);
assert.doesNotMatch(client, /pilot: 'P', dorsal: 'D'/, 'no seat letters');
assert.match(client, /function roleEntry\(type, seat, role = seatRole\(type, seat\)\)/);
assert.match(client, /drawSeatIcon\(c\.getContext\('2d'\), role, 128\)/);
// Occupiable equipment circles carry an icon too: canon for the heavy gun.
assert.match(client, /roleEntry\(null, null, st\.kind === 'antitank' \? 'cannon' : 'gunner'\)/);
assert.match(client, /ring = roleEntry\(vehicle\.type, seat\)/);
console.log(
  'Vehicle identity: no colour markers, original colours, white role icons for every seat.',
);
