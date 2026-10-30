import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { stepHelicopter } from '../src/helicopter.js';
import { MAP } from '../src/scale.js';
import { VEHICLES, vehiclePad } from '../src/fleet.js';
import { Game } from '../server/game.js';
import { HEAVY } from '../src/armament.js';
const source = readFileSync('src/client.js', 'utf8');
const physics = source.slice(
  source.indexOf('function physics(dt)'),
  source.indexOf('const radar ='),
);
function client(key) {
  const state = { ...vehiclePad('helicopter'), p: [0, 1, 0], q: [0, 0, 0, 1] };
  const c = vm.createContext({
    T,
    stepHelicopter,
    MAP,
    VEHICLES,
    snap: { upgrades: {} },
    respawnAt: 0,
    onFoot: false,
    myVehicle: { type: 'helicopter', state: structuredClone(state) },
    crewSeat: 'pilot',
    controlFocus: { active: true },
    canCapture: () => true,
    remainingFuel: () => 300,
    keys: { [key]: true },
    me: { position: new T.Vector3().fromArray(state.p), quaternion: new T.Quaternion() },
    vel: new T.Vector3(),
    hp: 200,
    wing: 1,
    engine: 1,
    landed: false,
    gas: 0.5,
    heliCollective: 0,
    heliRotorPower: 1,
    mouseDirection: new T.Vector3(0, 0, -1),
    currentFactors: () => ({ controls: 1 }),
    colliders: [],
    upgradedVehicle: (x) => x,
    pad: { fire: false },
    mouseFire: false,
    shooting: false,
    crash: () => assert.fail('Unexpected crash'),
    fireHeavy: () => {},
  });
  vm.runInContext(
    `function localMotion(){return {p:me.position.toArray(),q:me.quaternion.toArray(),v:vel.toArray(),hp,engine,wing,gas,landed,type:'helicopter',collective:myVehicle.state.collective||0};}\n` +
      physics,
    c,
  );
  return c;
}
const o = client('KeyO');
for (let i = 0; i < 120; i++) vm.runInContext('physics(1/120)', o);
assert.ok(
  o.me.position.y > 1.005,
  'O must actually climb through the shipped client physics branch',
);
const z = client('KeyZ');
for (let i = 0; i < 120; i++) vm.runInContext('physics(1/120)', z);
assert.ok(
  Math.abs(o.me.position.y - z.me.position.y) < 1e-10,
  'Z and O must have exactly the same effect',
);
for (const key of ['KeyS', 'ArrowDown']) {
  const c = client(key);
  for (let i = 0; i < 120; i++) vm.runInContext('physics(1/120)', c);
  assert.ok(c.me.position.y < 0.995);
  assert.ok(c.gas < 0.5, 'Descent power is below hover');
}
assert.ok(z.gas > 0.5 && z.gas < 1, 'Requested power rises progressively above hover');
z.keys = {};
for (let i = 0; i < 1200; i++) vm.runInContext('physics(1/120)', z);
assert.ok(Math.abs(z.vel.y) < 1e-6);
assert.ok(Math.abs(z.gas - 0.5) < 1e-6, 'Release returns to hover power');
// A delayed snapshot must not reset the owning pilot's instructor state.
const delayed = client('KeyZ');
for (let i = 0; i < 120; i++) {
  if (i % 6 === 0) delayed.myVehicle.state.collective = 0;
  vm.runInContext('physics(1/120)', delayed);
}
assert.ok(
  Math.abs(delayed.me.position.y - o.me.position.y) < 1e-10,
  'Snapshots cannot rewind the pilot collective',
);
console.log(
  'H2 actual client: Z/O climb, S/down descent, progressive power, released hover and delayed-snapshot continuity.',
);
for (const key of ['ArrowUp', 'KeyW']) {
  const c = client(key);
  for (let i = 0; i < 120; i++) vm.runInContext('physics(1/120)', c);
  assert.ok(Math.abs(c.me.position.y - o.me.position.y) < 1e-10);
}
for (const key of ['KeyZ', 'KeyO', 'KeyS', 'ArrowDown']) {
  const c = client(key);
  c.controlFocus.active = false;
  for (let i = 0; i < 120; i++) vm.runInContext('physics(1/120)', c);
  assert.equal(c.me.position.y, 1, 'Menus/focus loss do not apply vertical input');
}
const directionSource = source.slice(
  source.indexOf('function weaponDirection()'),
  source.indexOf('function nearestStation()'),
);
for (const [pitch, yaw, roll] of [
  [0, 0, 0],
  [0.2, 1.3, -0.1],
  [-0.3, -2, 0.15],
]) {
  const q = new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, roll, 'YXZ'));
  const c = vm.createContext({
    T,
    myVehicle: { type: 'helicopter' },
    crewSeat: 'pilot',
    me: { quaternion: q },
    turretDirection: () => new T.Vector3(1, 0.2, 0).normalize(),
  });
  const d = vm.runInContext(directionSource + ';weaponDirection()', c),
    expected = new T.Vector3(0, 0, -1).applyQuaternion(q);
  assert.ok(d.distanceTo(expected) < 1e-12, 'Client rocket aim follows the hull, not the view');
  let now = 100000;
  const game = new Game({ now: () => now });
  const a = game.join({ code: 'HELICMD', name: 'Pilot' }),
    r = game.rooms.get('HELICMD'),
    p = r.pilots.get(a.id),
    v = game.createVehicle(r, 'helicopter');
  Object.assign(v.state, {
    p: [0, 2, 0],
    q: q.toArray(),
    v: [0.001, 0, 0.002],
    landed: false,
    collective: 0.7,
    gas: 0.85,
  });
  game.assign(r, p, v, 'pilot', null);
  game.command(r.code, p.id, 'heavy-fire', {
    vehicle: v.id,
    occupation: p.occupation,
    weapon: 'rocket',
    shot: 'forward',
    direction: [1, 0, 0],
  });
  const rocket = r.ordnance.at(-1),
    relative = new T.Vector3()
      .fromArray(rocket.v)
      .sub(new T.Vector3().fromArray(v.state.v))
      .normalize();
  assert.ok(
    relative.distanceTo(expected) < 1e-12,
    'Server ignores view direction for pilot rockets',
  );
  assert.equal(v.supplies.ammo.rocket, 29);
  assert.ok(
    Math.abs(
      new T.Vector3().fromArray(rocket.v).sub(new T.Vector3().fromArray(v.state.v)).length() -
        HEAVY.rocket.speed,
    ) < 1e-10,
  );
}
console.log(
  'H2: retained aliases, inactive inputs, client/server rocket hull direction under yaw/pitch/roll and view mismatch passed.',
);

const down = client('KeyS');
for (let i = 0; i < 120; i++) vm.runInContext('physics(1/120)', down);
down.keys = {};
for (let i = 0; i < 1200; i++) vm.runInContext('physics(1/120)', down);
assert.ok(Math.abs(down.vel.y) < 1e-6);
assert.ok(Math.abs(down.gas - 0.5) < 1e-6);
const departing = client('KeyZ');
departing.me.position.y = VEHICLES.helicopter.gear;
departing.landed = true;
for (let i = 0; i < 120; i++) vm.runInContext('physics(1/120)', departing);
assert.ok(departing.me.position.y > VEHICLES.helicopter.gear + 0.005);
assert.equal(departing.landed, false);
const fuelSource = source.slice(
  source.indexOf('function remainingFuel()'),
  source.indexOf('function currentFactors()'),
);
for (const seat of ['pilot', 'copilot']) {
  const c = vm.createContext({
    myVehicle: {
      type: 'helicopter',
      state: { landed: false, engine: 1 },
      supplies: { fuel: 300, servicing: false },
    },
    snap: { receivedAt: 1000 },
    performance: { now: () => 2000 },
    engine: 1,
    gas: 0.5,
    landed: false,
    crewSeat: seat,
  });
  assert.equal(
    vm.runInContext(fuelSource + ';remainingFuel()', c),
    299,
    'Hover fuel remains one second per second, independent of the new power gauge',
  );
}
console.log('H2: return from descent, takeoff and fuel prediction at hover passed.');
