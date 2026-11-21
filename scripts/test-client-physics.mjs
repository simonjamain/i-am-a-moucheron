import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { createSoul, advanceArena } from '../src/purgatory-physics.ts';
const now = Date.now();
// A remote proxy cannot be moved by the local integrator.
const near = createSoul({ id: 101, entity: 'remote', kind: 'player' }, 0, now),
  self = createSoul({ id: 102, entity: 'self', kind: 'player' }, 0, now);
near.x = 0;
near.z = 10;
self.x = 0.3;
self.z = 10;
const pair = { time: now, events: [], bodies: [near, self] };
advanceArena(pair, now + 100, 'self');
assert.equal(near.x, 0);
assert.equal(near.z, 10);
assert.ok(self.x > 0.3);
console.log('PASS: remote proxy ownership: the local integrator never moves a remote body.');
