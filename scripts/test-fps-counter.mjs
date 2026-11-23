import assert from 'node:assert/strict';
import { FpsMeter, FPS_WINDOW } from '../src/fps-counter.ts';

const meter = new FpsMeter();
let updates = 0;
for (let t = 0; t < 2; t += 1 / 60) if (meter.tick(1 / 60)) updates++;
assert.ok(updates >= 3 && updates <= 5, 'une mesure par demi-seconde');
assert.equal(meter.value, 60);
assert.equal(meter.tick(0), false, 'dt nul ignoré');
assert.equal(meter.tick(NaN), false, 'dt invalide ignoré');
const slow = new FpsMeter();
while (!slow.tick(1 / 20));
assert.equal(slow.value, 20);
assert.ok(FPS_WINDOW > 0);
console.log('FPS counter: rolling measure per half-second window OK');
