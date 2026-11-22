// VIP lane of the purgatory (docs/purgatory-queue.md): a roped lane whose gate only
// lets paid souls through, Saint Pierre's second window served once the insect at
// his first window is done, and the pass paid from the common fund at the wave's
// price (refused when the fund cannot pay it).
import assert from 'node:assert/strict';
import { bodyMotion } from '../src/walk-arena.ts';
import {
  advancePurgatory,
  createSoul,
  deskOccupant,
  inVipDesk,
  SOUL_ENTRANCE,
  VIP_DESK,
  VIP_GATE_Z,
  VIP_GUARD,
  VIP_LANE,
  vipPrice,
} from '../src/purgatory-queue.ts';
import { Game } from '../server/game.js';

assert.deepEqual([0, 1, 2, 3, 7.9].map(vipPrice), [1, 1, 2, 3, 7], 'wave N costs N $');

// Physics: the gate stops a soul without the pass, not one with it.
const arena = (bodies) => ({ bodies, time: 0, events: [], eventSeq: 0, obstacles: VIP_LANE });
function walkIn(vip) {
  const b = createSoul({ id: 1, entity: 'p', kind: 'player' }, 0, 0);
  Object.assign(b, { x: VIP_DESK.x, z: VIP_GATE_Z + 1.5, vip });
  const a = arena([b]);
  for (let t = 0; t < 4000; t += 50) {
    b.input = { x: 0, z: -1 };
    b.inputAt = a.time;
    advancePurgatory(a, a.time + 50, 'p');
  }
  return b;
}
assert.ok(walkIn(false).z > VIP_GATE_Z, 'no pass: the rope gate holds');
assert.ok(inVipDesk(walkIn(true)), 'with the pass: down the lane to the VIP window');
assert.ok(
  Math.hypot(SOUL_ENTRANCE.x - VIP_GUARD.x, SOUL_ENTRANCE.z - VIP_GUARD.z) < 4.5,
  'souls appear a few steps from the guard',
);

// Desk: Saint Pierre finishes the insect he started, then serves the VIP.
const insect = createSoul({ id: 2, entity: null, kind: 'enemy' }, 0, 0);
const vip = createSoul({ id: 9, entity: 'v', kind: 'player' }, 0, 0);
Object.assign(insect, { x: 0, z: 1.1 });
Object.assign(vip, { x: VIP_DESK.x, z: VIP_DESK.z, vip: true });
const desk = arena([insect, vip]);
insect.served = 600;
assert.equal(deskOccupant(desk).id, insect.id, 'the insect in progress is finished first');
insect.served = 0;
assert.equal(deskOccupant(desk).id, vip.id, 'then the VIP window');
vip.vip = false;
assert.equal(deskOccupant(desk).id, insect.id, 'no pass, no VIP window');
vip.vip = true;
// While the VIP signs, the insect at the first window waits.
for (let t = 0; t < 3000; t += 100) {
  vip.inputAt = desk.time;
  advancePurgatory(desk, desk.time + 100, null);
}
assert.equal(insect.gone, undefined, 'the insect waits for the VIP');
assert.equal(deskOccupant(desk).id, vip.id);

// Server: the pass costs the wave's price once, refused when the fund is short.
let now = 100000;
const game = new Game({ now: () => now, roomTTL: 30000 });
const a = game.join({ code: 'VIPTEST', name: 'Alpha' });
const room = game.rooms.get('VIPTEST');
const call = (path, body = {}) => game.command('VIPTEST', a.id, path, body);
call('death', { incarnation: 0 });
call('enter-purgatory', { incarnation: room.pilots.get(a.id).incarnation });
game.arena(room, 'purgatory');
const body = room.purgatory.bodies.find((b) => b.entity === a.id);
assert.ok(Math.hypot(body.x - SOUL_ENTRANCE.x, body.z - SOUL_ENTRANCE.z) < 2, 'at the entrance');
assert.equal(room.purgatory.obstacles, VIP_LANE, 'ropes in the purgatory');
const incarnation = room.pilots.get(a.id).incarnation;
const pass = () =>
  call('vip-pass', { signature: true, epoch: room.base.epoch, incarnation, bed: -1 });
room.wave = 3;
room.dollars = 2;
assert.throws(pass, /insuffisante.*3 \$/, 'refused when the fund is short');
assert.equal(room.dollars, 2);
room.dollars = 10;
pass();
assert.equal(room.dollars, 7, 'wave 3: 3 $ from the common fund');
pass();
assert.equal(room.dollars, 7, 'paid once');
game.arena(room, 'purgatory');
assert.equal(body.vip, true, 'the body carries the pass');
assert.throws(() => call('vip-pass', { signature: false, epoch: room.base.epoch, incarnation }));
// The paid soul signs at the VIP window, even with insects at the first one.
for (let form = 1; form <= 3; form++) {
  Object.assign(body, { x: VIP_DESK.x, z: VIP_DESK.z, vx: 0, vz: 0 });
  call('sign', {
    form,
    signature: true,
    ground: { epoch: room.purgatory.epoch, body: bodyMotion(body) },
  });
}
assert.equal(room.pilots.get(a.id).life, 'alive', 'back to the base through the VIP window');
console.log(
  'Purgatory VIP: rope gate, VIP window after the insect in progress, pass at the wave price from the common fund, refused when short, signed at the VIP window.',
);
