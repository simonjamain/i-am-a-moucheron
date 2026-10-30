import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../vendor/three.module.min.js';
import { MAP } from '../src/scale.js';
import * as delivery from '../src/delivery.js';
import { Game } from '../server/game.js';
import { wavePlan, ENEMY_TYPES } from '../src/waves.js';
const source = readFileSync('src/client.js', 'utf8');
// #15: execute the real crate renderer between authoritative snapshots.
let now = 100000;
const snapshot = {
  receivedAt: 0,
  deliveries: [
    {
      token: 'crate',
      item: 'radar',
      x: 0,
      y: 0.95,
      z: 0,
      fromY: 0.95,
      startedAt: now,
      at: now,
      landingY: 0.90005,
    },
  ],
};
const ctx = vm.createContext({
  T,
  MAP,
  ...delivery,
  snap: snapshot,
  scene: new T.Scene(),
  Date: { now: () => now },
  performance: { now: () => now - 100000 },
  clockOffset: 0,
});
vm.runInContext(
  source.slice(source.indexOf('const deliveryModels ='), source.indexOf('const vacantAircraft =')),
  ctx,
);
vm.runInContext('renderDeliveries()', ctx);
now += 3000;
vm.runInContext('renderDeliveries()', ctx);
const visualY = vm.runInContext("deliveryModels.get('crate').position.y", ctx);
assert.ok(
  Math.abs(visualY - 0.947) < 1e-8,
  'crate must visibly descend between snapshots at the reference speed',
);
snapshot.deliveries = [];
vm.runInContext('renderDeliveries()', ctx);
assert.equal(ctx.scene.children.length, 0);
console.log(
  '#15 real renderer: continuous descent between snapshots and removal after reset/receipt.',
);
// #17: compare the current plans with measured pre-change fixtures.
for (const fixture of JSON.parse(
  readFileSync('scripts/fixtures/ground-speeds-before-17.json', 'utf8'),
)) {
  const roster = wavePlan(fixture.code, fixture.wave, fixture.started).roster;
  assert.equal(
    crypto
      .createHash('sha256')
      .update(JSON.stringify(roster.map(({ travelSpeed, duration, ...rest }) => rest)))
      .digest('hex'),
    fixture.composition,
    'composition, sizes, stats and route seeds unchanged',
  );
  for (const old of fixture.ground.filter((e) => e.type === 'ant'))
    assert.ok(
      Math.abs(roster[old.id].travelSpeed - old.speed / 2) < 1e-12,
      'ants must slow by another factor two',
    );
  for (const old of fixture.air)
    assert.equal(roster[old.id].travelSpeed, old.speed, 'air speed unchanged');
  const ants = roster.filter((e) => e.type === 'ant');
  for (const e of roster.filter((e) => e.ground && e.type !== 'ant'))
    assert.ok(
      e.travelSpeed < Math.min(...ants.map((e) => e.travelSpeed)),
      'larger terrestrial species slower than every ant in the wave',
    );
}
console.log(
  '#17 frozen before/after fixtures: ants half-speed, larger ground types slower, air and composition unchanged.',
);

// #16: real keyboard handler must not swallow pilot Shift/Ctrl as weapon selection.
const { contextKey } = await import('../src/equipment-controls.js');
const { gameKey, equipmentExitAction, equipmentEnterAllowed } =
  await import('../src/control-focus.js');
let keyHandler;
const input = {
  addEventListener: (_, h) => (keyHandler = h),
  $: () => ({ classList: { contains: () => true } }),
  spectating: false,
  joined: true,
  purchaseUI: { opened: false },
  bedUI: { opened: false },
  bankUI: { opened: false },
  myVehicle: { type: 'helicopter' },
  crewSeat: 'pilot',
  respawnAt: 0,
  turretIndex: -1,
  onFoot: false,
  placingEquipment: false,
  gameKey,
  equipmentExitAction,
  equipmentEnterAllowed,
  contextKey,
  activeMissile: () => null,
  keys: {},
  keyBindings: new Map(),
  controlFocus: { active: true },
  canCapture: () => true,
};
vm.runInNewContext(
  source.slice(
    source.indexOf("addEventListener('keydown', (event) => {"),
    source.indexOf("addEventListener('keyup', (event) => {"),
  ),
  input,
);
for (const code of ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'])
  keyHandler({ code, target: { tagName: 'CANVAS' }, preventDefault() {} });
assert.ok(Object.values(input.keys).every(Boolean));
assert.equal(Object.keys(input.keys).length, 4);
input.crewSeat = 'copilot';
input.keys = {};
keyHandler({ code: 'ControlLeft', target: { tagName: 'CANVAS' }, preventDefault() {} });
assert.equal(input.heliWeapon, 'missile');
assert.equal(input.keys.ControlLeft, undefined);
keyHandler({ code: 'ShiftLeft', target: { tagName: 'CANVAS' }, preventDefault() {} });
assert.equal(input.heliWeapon, 'copilot');
console.log(
  '#16 real keyboard routing: pilot modifiers reach flight, copilot modifiers select weapons.',
);

// #15: actual signed purchase/sync/snapshot path with two clients, not a direct
// call that jumps to the end of the delivery. Keep sessions alive while falling.
for (const surfaceY of [0, 0.9]) {
  now = 100000;
  const solids = [
    { min: { x: -0.45, y: surfaceY - 0.05, z: -0.45 }, max: { x: 0.45, y: surfaceY, z: 0.45 } },
  ];
  const game = new Game({ now: () => now, solids });
  const a = game.join({ code: 'DROP15', name: 'Pilot' }),
    b = game.join({ code: 'DROP15', name: 'Observer' });
  const room = game.rooms.get('DROP15'),
    p = room.pilots.get(a.id),
    peer = room.pilots.get(b.id);
  const carrier = game.createVehicle(room, 'helicopter', 'purchase', {
    x: 0,
    y: surfaceY + 0.03,
    z: 0,
  });
  carrier.state.landed = false;
  Object.assign(p, { vehicle_id: carrier.id, seat: 'pilot', mode: 'flight' });
  carrier.seats.set('pilot', p.id);
  room.dollars = 100;
  const order = {
    item: 'radar',
    request: 'airdrop-15',
    signature: true,
    epoch: room.base.epoch,
    incarnation: p.incarnation,
    expectedPrice: 4,
  };
  let s = game.command(room.code, p.id, 'purchase-sign', order);
  const initial = s.deliveries[0].y;
  const balance = s.dollars;
  game.command(room.code, p.id, 'purchase-sign', order);
  assert.equal(room.dollars, balance);
  now += 3000;
  let owner = game.command(room.code, p.id, 'sync', { mode: 'flight', state: carrier.state });
  let observer = game.command(room.code, peer.id, 'sync', { mode: 'foot', state: peer.state });
  assert.ok(Math.abs(owner.deliveries[0].y - (initial - 0.003)) < 1e-9);
  assert.equal(owner.deliveries[0].y, observer.deliveries[0].y);
  assert.equal(room.equipment.length, 0, 'no deployment in flight');
  for (let tick = 0; tick < 500 && room.deliveries.length; tick++) {
    now += 250;
    owner = game.command(room.code, p.id, 'sync', { mode: 'flight', state: carrier.state });
    observer = game.command(room.code, peer.id, 'sync', { mode: 'foot', state: peer.state });
    assert.deepEqual(owner.deliveries, observer.deliveries);
  }
  assert.equal(room.deliveries.length, 0);
  assert.equal(room.equipment.length, 1);
  assert.ok(Math.abs(room.equipment[0].y - surfaceY - 0.00005) < 1e-9);
  game.snapshot(room);
  assert.equal(room.equipment.length, 1, 'single deployment');
  game.command(room.code, p.id, 'reset', { epoch: room.base.epoch });
  assert.equal(room.deliveries.length, 0);
  assert.equal(room.equipment.length, 0);
}
console.log(
  '#15 signed purchases: slow but real descent, two client snapshots, ground/table receipt, once-only debit/deploy and reset.',
);

// #17: old arrival time must no longer complete the wave or leak early.
now = 100000;
const timingGame = new Game({ now: () => now });
const join = timingGame.join({ code: 'TIMING17', name: 'Timing' });
const timingRoom = timingGame.rooms.get('TIMING17');
timingGame.command(timingRoom.code, join.id, 'start');
now += 10000;
timingGame.advance(timingRoom);
const plan = wavePlan(timingRoom.code, timingRoom.wave, timingRoom.started),
  ant = plan.roster.find((e) => e.type === 'ant');
for (const e of plan.roster) if (e.id !== ant.id) timingRoom.kills.add(e.id);
now =
  timingRoom.started + 1000 * (ant.spawn + ant.entryHold + (ant.duration - ant.entryHold) / 2) + 1;
timingGame.advance(timingRoom);
assert.equal(timingRoom.phase, 'combat');
assert.equal(timingRoom.infestation, 0);
now = timingRoom.started + 1000 * (ant.spawn + ant.duration) + 1;
timingGame.advance(timingRoom);
assert.equal(timingRoom.phase, 'prep');
assert.equal(timingRoom.infestation, 1);
console.log(
  '#17 server deadline: no leak/completion at the old arrival, correct completion at the new one.',
);
