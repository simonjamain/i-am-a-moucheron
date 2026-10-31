import { TracerPool } from '../src/tracers.js';
import { GunSalvos } from '../src/salvos.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import { SHOP, shopPrice, purchaseCount, supportedPlacement } from '../src/equipment.js';
import { fullAmmo, advanceSupplies } from '../src/logistics.js';
import { HEAVY } from '../src/armament.js';
import { VEHICLES, vehicleEntry } from '../src/fleet.js';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { OFFICE_SOLIDS } from '../worker/assets.js';
import { createGraphics } from '../src/graphics.js';
import { stepFlight } from '../src/flight.js';
import { AircraftFire } from '../src/aircraft-fire.js';
import { wavePlan, swarmFrame } from '../src/waves.js';
import { collisionDamage, washTarget, WASH } from '../src/vehicle-care.js';
import { ballisticMarks } from '../src/tank-reticle.js';
import { integrateOrdnance } from '../src/ordnance.js';
import { PurchaseUI } from '../src/purchase-ui.js';
let now = 100000;
const game = new Game({ now: () => now, solids: OFFICE_SOLIDS });
const a = game.join({ code: 'CLEAN', name: 'A' }),
  b = game.join({ code: 'CLEAN', name: 'B' });
const r = game.rooms.get('CLEAN'),
  p = r.pilots.get(a.id),
  q = r.pilots.get(b.id);
const command = (path, body = {}, who = p) => game.command('CLEAN', who.id, path, body);
const signed = (item, request, price, who = p) =>
  command(
    'purchase-sign',
    {
      item,
      request,
      expectedPrice: price,
      signature: true,
      epoch: r.base.epoch,
      incarnation: who.incarnation,
    },
    who,
  );
r.dollars = 200;
for (const key of ['dca', 'radar', 'refuel', 'bed']) {
  const before = r.dollars,
    price = shopPrice(key, r.upgrades, purchaseCount(game.snapshot(r), key));
  signed(key, 'purchase-' + key, price);
  assert.equal(r.dollars, before - price);
  signed(key, 'purchase-' + key, price);
  assert.equal(r.dollars, before - price, 'retry spends once');
  assert.equal(shopPrice(key, r.upgrades, purchaseCount(game.snapshot(r), key)), price + 2);
  assert.throws(() => signed(key, 'competing-' + key, price, q), /tarif/);
}
assert.throws(() => signed('radar', 'unsigned-000', 4), /tarif/);
assert.throws(
  () =>
    command('purchase-sign', {
      item: 'radar',
      request: 'unsigned-000',
      signature: false,
      epoch: r.base.epoch,
      incarnation: p.incarnation,
    }),
  /Signez/,
);
const radar = r.purchases.get('purchase-radar');
const ground = game.base(r, p),
  w = {
    x: OFFICE_LAYOUT.base.originX + 0.1,
    y: OFFICE_LAYOUT.base.deckY,
    z: OFFICE_LAYOUT.base.originZ + 0.08,
  };
Object.assign(ground, {
  x: (w.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
  z: (OFFICE_LAYOUT.base.originZ - w.z) / ACTOR_UNIT,
  y: w.y,
  grounded: true,
});
let position;
for (let dx = -0.02; dx <= 0.02 && !position; dx += 0.005)
  for (let dz = -0.02; dz <= 0.02 && !position; dz += 0.005) {
    const candidate = supportedPlacement(
      { ...w, x: w.x + dx, z: w.z + dz },
      OFFICE_SOLIDS,
      [],
      'radar',
    );
    if (candidate) position = candidate;
  }
assert.ok(position);
Object.assign(game.base(r, p), {
  x: (position.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
  z: (OFFICE_LAYOUT.base.originZ - position.z) / ACTOR_UNIT,
  y: position.y,
  grounded: true,
});
const poseBody = { token: radar.token, epoch: r.base.epoch, incarnation: p.incarnation, position };
assert.throws(() => command('place-purchase', poseBody, q), /appartient/);
const cash = r.dollars;
command('place-purchase', poseBody);
command('place-purchase', poseBody);
assert.equal(r.equipment.filter((e) => e.kind === 'radar').length, 1);
assert.equal(r.dollars, cash, 'prepaid pose never debits twice');
assert.equal(radar.placed, true);
assert.equal(purchaseCount(game.snapshot(r), 'radar'), 1);
assert.throws(
  () =>
    command('place-purchase', {
      ...poseBody,
      token: 'purchase-bed',
      position: { x: 100, y: 100, z: 100 },
    }),
  /près/,
);
assert.equal(r.dollars, cash);
assert.ok(!r.purchases.get('purchase-bed').placed, 'invalid/cancelled pose stays owned');
const oldCash = r.dollars;
r.dollars = 0;
assert.throws(() => signed('bed', 'insufficient-1', 6), /assez/);
r.dollars = oldCash;
// Personal pending order ownership is lost only on expiry, with a single refund.
const refund = [...r.purchases.values()].filter((o) => !o.placed).reduce((s, o) => s + o.price, 0);
p.seen = now - 12001;
game.advance(r);
assert.equal(r.dollars, oldCash + refund);
game.advance(r);
assert.equal(r.dollars, oldCash + refund);
console.log(
  'Purchases: live quotes, signed prepayment, stale quote/funds/concurrency, ownership, invalid/cancelled/resumed placement, idempotent pose, expiry refund.',
);

// Bomb cadence and stocks via the real authority, including duplicate commands.
const pilot = q,
  bomber = [...r.vehicles.values()].find((v) => v.type === 'bomber');
game.assign(r, pilot, bomber, 'pilot', null);
bomber.state.p = [0, 2, 0];
bomber.state.landed = false;
assert.equal(bomber.supplies.ammo.bomb, 50);
for (let i = 0; i < 50; i++) {
  now += 500;
  pilot.seen = now;
  command('heavy-fire', { weapon: 'bomb', shot: 'drop-' + i, direction: [0, 0, -1] }, pilot);
  command('heavy-fire', { weapon: 'bomb', shot: 'drop-' + i, direction: [0, 0, -1] }, pilot);
  assert.equal(bomber.supplies.ammo.bomb, 49 - i);
  if (i < 49)
    assert.throws(
      () =>
        command('heavy-fire', { weapon: 'bomb', shot: 'fast-' + i, direction: [0, 0, -1] }, pilot),
      /recharge/,
    );
}
now += 500;
pilot.seen = now;
assert.throws(
  () => command('heavy-fire', { weapon: 'bomb', shot: 'empty', direction: [0, 0, -1] }, pilot),
  /vide/,
);
assert.equal(fullAmmo('interceptor').bomb, 6);
const filled = advanceSupplies(
  bomber.supplies,
  { ...bomber.state, p: [0, 0.9 + VEHICLES.bomber.gear, 0], v: [0, 0, 0], landed: true },
  'bomber',
  [{ kind: 'refuel', x: 0, y: 0.9, z: 0 }],
  10,
);
assert.equal(filled.ammo.bomb, 50);
assert.equal(HEAVY.bomb.interval, 0.5);

// Spitfire price, exclusive role, real six physical barrels and 45-second stock.
assert.equal(shopPrice('spitfire'), 2 * shopPrice('interceptor'));
game.release(r, pilot);
pilot.mode = 'foot';
r.dollars = 100;
game.buy(r, pilot, { item: 'spitfire', request: 'spitfire-buy' }); // Internal fixture: public signed placement has its own regression.
const spit = [...r.vehicles.values()].find((v) => v.type === 'spitfire');
assert.ok(spit);
assert.equal(r.dollars, 76);
assert.deepEqual(VEHICLES.spitfire.seats, ['pilot']);
assert.equal(fullAmmo('spitfire').bomb, undefined);
assert.equal(fullAmmo('spitfire').pilot, 1000);
const model = createGraphics(T, new T.Scene()).makeSpitfire('#fff');
model.scale.setScalar(ACTOR_UNIT);
model.updateWorldMatrix(true, true);
assert.equal(
  new Set(
    model.userData.muzzles.map((n) => n.getWorldPosition(new T.Vector3()).toArray().join(',')),
  ).size,
  6,
);
const supplies = { ammo: fullAmmo('spitfire'), revision: 0 };
let spent = 0;
const fire = new AircraftFire(
  async (req) => {
    spent += req.shots.length;
    supplies.ammo.pilot -= req.shots.length;
    supplies.revision++;
    return { ...supplies, vehicle: req.vehicle, seat: req.seat, shots: req.shots };
  },
  () => 'occupation',
  { schedule: () => null, session: 'test' },
);
for (let salvo = 0; salvo < 167; salvo++) {
  for (let gun = 0; gun < Math.min(6, 1000 - salvo * 6); gun++)
    assert.ok(fire.fire(spit.id, 'pilot', supplies));
  await fire.flush();
}
assert.equal(spent, 1000);
assert.equal(fire.available(spit.id, 'pilot', supplies), 0);
assert.ok(!fire.fire(spit.id, 'pilot', supplies));
assert.equal(Math.ceil(1000 / 6), 167);
function flight(profile, speed) {
  const state = {
    q: new T.Quaternion(),
    vel: new T.Vector3(0, 0, -speed),
    omega: new T.Vector3(),
    wind: new T.Vector3(),
    gas: 1,
    engine: 1,
    wing: 1,
    pitch: 1,
    roll: 1,
    yaw: 1,
    profile,
  };
  stepFlight(T, state, 1 / 120);
  return state;
}
const reference = flight(VEHICLES.fighter, 30),
  fast = flight(VEHICLES.spitfire, 30);
assert.ok(Math.abs(fast.omega.x / reference.omega.x - 1.45) < 1e-10);
assert.ok(Math.abs(fast.omega.z / reference.omega.z - 1.45) < 1e-10);
assert.ok(
  Math.abs(
    flight(VEHICLES.spitfire, 200).vel.length() / flight(VEHICLES.fighter, 200).vel.length() - 1.75,
  ) < 1e-10,
);
spit.state.hp = 0;
game.advance(r);
assert.equal(
  [...r.vehicles.values()].filter((v) => v.type === 'spitfire' && v.state.hp > 0).length,
  0,
);
console.log(
  'Weapons: 50 bombs, bounded 500ms authority cadence, repeat/empty/refill; Spitfire 24$, six barrels, 1000 rounds/partial final salvo and measured 1.75/1.45 physics ratios.',
);

// Impact uses enemy remaining health once, all vehicle roles share the same dirt.
const cg = new Game({ now: () => now });
const cj = cg.join({ code: 'CONTACT' });
const cr = cg.rooms.get('CONTACT');
cr.phase = 'combat';
cr.wave = 1;
cr.started = now - 10000;
const plan = wavePlan(cr.code, cr.wave, cr.started),
  frames = swarmFrame(plan.roster, 10),
  index = frames.findIndex(Boolean);
assert.ok(index >= 0);
const hull = [...cr.vehicles.values()].find((v) => v.type === 'bomber'),
  point = frames[index].p;
hull.state.p = [...point];
hull.state.hp = 100;
cr.enemyDamage[index] = 40;
const expected = collisionDamage(plan.roster[index].hp, 40);
cg.vehicleContacts(cr, now);
assert.equal(hull.state.hp, 100 - expected);
assert.equal(hull.dirt, WASH.dirtPerImpact);
cg.vehicleContacts(cr, now);
assert.equal(hull.state.hp, 100 - expected, 'persistent contact does not repeat');
hull.state.p = [point[0] + 1, point[1], point[2]];
cg.vehicleContacts(cr, now);
cg.vehicleContacts(cr, now);
hull.state.p = [...point];
cg.vehicleContacts(cr, now);
assert.equal(hull.state.hp, 100 - 2 * expected);
assert.equal(hull.dirt, 2 * WASH.dirtPerImpact);
cr.kills.add(index);
cg.vehicleContacts(cr, now);
assert.equal(hull.state.hp, 100 - 2 * expected);
console.log(
  'Contacts: 5% remaining enemy HP, wounded enemy, persistent contact, separation/reimpact, killed enemy exclusion, shared hull dirt.',
);

// Cleaning ray: real range and first obstruction; authority rate and clean event.
const wg = new Game({ now: () => now }),
  wj = wg.join({ code: 'WASH' }),
  wk = wg.join({ code: 'WASH' }),
  wr = wg.rooms.get('WASH');
const people = [wr.pilots.get(wj.id), wr.pilots.get(wk.id)];
const target = [...wr.vehicles.values()][0];
target.state.p = [0, 0.6, -0.5];
target.dirt = 1;
target.state.landed = false;
const origin = [0, 0.6, 0],
  dir = [0, 0, -1];
assert.equal(washTarget(origin, dir, [target], []), target);
assert.equal(washTarget(origin, [0, 0, 1], [target], []), null);
assert.equal(washTarget([0, 0.6, 3], dir, [target], []), null);
assert.equal(
  washTarget(
    origin,
    dir,
    [target],
    [{ min: { x: -1, y: 0, z: -0.2 }, max: { x: 1, y: 1, z: -0.1 } }],
  ),
  null,
);
for (const person of people)
  Object.assign(wg.base(wr, person), {
    x: (0 - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: OFFICE_LAYOUT.base.originZ / ACTOR_UNIT,
    y: 0.6 - MAP.metres(0.9),
    grounded: true,
  });
const wash = (person) =>
  wg.command('WASH', person.id, 'wash', {
    direction: dir,
    epoch: wr.base.epoch,
    incarnation: person.incarnation,
  });
wash(people[0]);
for (let i = 0; i < 25; i++) {
  now += 200;
  people.forEach((p) => (p.seen = now));
  wash(people[0]);
}
assert.ok(Math.abs(target.dirt - 0.5) < 1e-8);
wash(people[1]);
for (let i = 0; i < 13; i++) {
  now += 200;
  people.forEach((p) => (p.seen = now));
  wash(people[0]);
  wash(people[1]);
}
assert.equal(target.dirt, 0);
assert.equal(wr.effects.filter((e) => e.kind === 'clean').length, 1);
wash(people[0]);
assert.equal(wr.effects.filter((e) => e.kind === 'clean').length, 1);
wg.assign(wr, people[0], target, 'pilot', null);
assert.throws(() => wash(people[0]), /Sortez/);
wg.command('WASH', people[1].id, 'reset');
assert.equal(
  [...wr.vehicles.values()].some((v) => v.dirt),
  false,
);
console.log(
  'Cleaning: 2 world metres, wrong direction/range/solid blocked, 10s single flow, additive cooperation, one clean event, occupants forbidden, reset.',
);

// Reticle shares authority integration, sampled at physical world distances.
for (const type of ['he', 'ap'])
  for (const mark of ballisticMarks(type)) {
    const projectile = { p: [0, 0, 0], v: [0, 0, -HEAVY[type].speed], age: 0 };
    while (-projectile.p[2] < mark.metres) {
      const before = [...projectile.p];
      integrateOrdnance(projectile, 1 / 120);
      if (-projectile.p[2] >= mark.metres) {
        const t = (mark.metres + before[2]) / (before[2] - projectile.p[2]);
        assert.ok(
          Math.abs(mark.point[1] - (before[1] + (projectile.p[1] - before[1]) * t)) < 1e-12,
        );
      }
    }
    assert.ok(mark.point[1] < 0);
  }
assert.ok(
  Math.abs(ballisticMarks('he').at(-1).point[1]) > Math.abs(ballisticMarks('ap').at(-1).point[1]),
);

// Actual key handler: physical Digit1 independent of key/Shift, same seat-request
// command as button; forms/editable fields and E repeats cannot bypass contracts.
const source = readFileSync('src/client.js', 'utf8');
const keyHandler = source.slice(
  source.indexOf("addEventListener('keydown', (event) => {"),
  source.indexOf("addEventListener('keyup', (event) => {"),
);
let handler,
  placed = 0;
const requests = [];
const c = {
  addEventListener: (_, h) => (handler = h),
  $: () => ({ classList: { contains: () => true } }),
  spectating: false,
  joined: true,
  purchaseUI: { opened: false },
  bedUI: { opened: false },
  bankUI: { opened: false },
  myVehicle: { type: 'tank' },
  respawnAt: 0,
  crewSeat: 'pilot',
  turretIndex: -1,
  VEHICLES,
  canCapture: () => true,
  action: (path, b) => requests.push({ path, ...b }),
  gameKey: (e) => e.code,
  equipmentExitAction: () => null,
  placingEquipment: false,
  controlFocus: { active: false },
  placePurchased: () => placed++,
};
vm.runInNewContext(keyHandler, c);
const event = {
  code: 'Digit2',
  key: 'é',
  target: { tagName: 'CANVAS' },
  repeat: false,
  preventDefault() {},
};
handler(event);
handler({ ...event, key: '2', shiftKey: true });
assert.equal(requests.length, 2);
assert.ok(requests.every((r) => r.path === 'seat-request' && r.seat === 'cannon'));
handler({ ...event, target: { tagName: 'INPUT' } });
assert.equal(requests.length, 2);
c.canCapture = () => false;
handler(event);
assert.equal(requests.length, 2);
c.canCapture = () => true;
c.placingEquipment = true;
handler({ ...event, code: 'KeyE', repeat: true });
handler({ ...event, code: 'KeyE' });
assert.equal(placed, 1);
console.log(
  'Input/reticle: actual physical key handlers, contract request path, repeat/modal/text guards; HE/AP ticks agree with authoritative integrator.',
);

// Actual shared form: no purchase on cancel, one request on valid release, ACK only.
class Element {
  constructor() {
    this.map = new Map();
    this.classList = { add() {}, remove() {} };
    this.width = 800;
    this.height = 200;
  }
  querySelector(k) {
    if (!this.map.has(k)) this.map.set(k, new Element());
    return this.map.get(k);
  }
  getContext() {
    return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture() {}
  toDataURL() {
    return 'ink';
  }
}
const root = new Element(),
  ss = { base: { epoch: 'test' }, upgrades: {}, equipment: [] };
let submitted = 0,
  archived = 0;
const ui = new PurchaseUI({
  root,
  snapshot: () => ss,
  ground: () => null,
  command: async () => {
    submitted++;
    return ss;
  },
  accept() {},
  archive() {
    archived++;
  },
  onOpen() {},
  onClose() {},
});
ui.open('dca', { life: 'alive', incarnation: 0 });
assert.equal(ui.price, 4);
assert.match(root.querySelector('[data-bed-text]').textContent, /4 \$/);
const e = { pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} };
ui.canvas.onpointerdown(e);
ui.canvas.onpointercancel();
ui.canvas.onpointerup({ ...e, clientX: 90 });
assert.equal(submitted, 0);
ui.canvas.onpointerdown(e);
ui.canvas.onpointerup({ ...e, clientX: 90 });
await new Promise((r) => setImmediate(r));
assert.equal(submitted, 1);
assert.equal(archived, 1);
console.log(
  'Purchase UI: live price, actual pointer cancel and release, single signed command and ACK archive.',
);

// Execute the actual six-gun volley AND bullet gate with exactly six rounds.
// A per-volley six-round check inside each barrel would drop the last five shots.
const realFire = new AircraftFire(
  async () => {},
  () => 'live',
  { schedule: () => null, session: 'last-six' },
);
let emitted = 0;
const fireContext = {
  T,
  MAP,
  ACTOR_UNIT,
  performance,
  gunSalvos: new GunSalvos(),
  TracerPool,
  renderer: { isWebGLRenderer: true },
  GunSalvos,
  scene: new T.Scene(),
  myVehicle: {
    id: 's6',
    type: 'spitfire',
    state: { v: [0, 0, 0] },
    supplies: { ammo: { pilot: 6 }, revision: 0 },
  },
  crewSeat: 'pilot',
  aircraftFire: realFire,
  currentAmmoKey: () => 'pilot',
  currentFactors: () => ({ damage: 1 }),
  snap: { wave: 1 },
  vel: new T.Vector3(),
  me: model,
  spreadDirection: (_, d) => d.clone(),
  vehicleColor: () => '#fff',
  emitBullet: () => emitted++,
  hasAmmo: () => realFire.available('s6', 'pilot', fireContext.myVehicle.supplies) >= 6,
};
vm.createContext(fireContext);
vm.runInContext(
  source.slice(source.indexOf('function bullet('), source.indexOf('const aircraftFire =')) +
    source.slice(source.indexOf('function shoot('), source.indexOf('function explosion(')),
  fireContext,
);
vm.runInContext(
  'shoot(new T.Vector3(0,0,-1));gunSalvos.update("s6:pilot",performance.now()+20,index=>bullet(me.userData.muzzles[index].getWorldPosition(new T.Vector3()),new T.Vector3(0,0,-1),"#fff",true))',
  fireContext,
);
assert.equal(emitted, 6);
assert.equal(realFire.available('s6', 'pilot', fireContext.myVehicle.supplies), 0);
console.log(
  'Actual six-gun volley consumes and emits all six final rounds, without waiting for an ACK.',
);

// Render actual heavy meshes without a GPU: type and persistent colour survive
// removal of the originating vehicle, so late snapshots keep their provenance.
const { vehicleHue } = await import('../src/logistics.js');
const renderScene = new T.Scene();
const graphics = createGraphics(T, renderScene);
const visualContext = {
  T,
  MAP,
  scene: renderScene,
  makeBomb: graphics.makeBomb,
  vehicleHue,
  clockOffset: 0,
  snap: {
    ordnance: ['he', 'ap', 'bomb'].map((weapon, i) => ({
      shot: weapon,
      weapon,
      sequence: i + 4,
      p: [0, 1, 0],
      v: [0, 0, -1],
      updated: Date.now(),
    })),
  },
};
vm.createContext(visualContext);
vm.runInContext(
  source.slice(
    source.indexOf('const ordnanceModels = new Map();'),
    source.indexOf('const contextHUD ='),
  ),
  visualContext,
);
vm.runInContext('updateOrdnance(0)', visualContext);
const visualModels = vm.runInContext('ordnanceModels', visualContext);
assert.equal(visualModels.get('he').geometry.type, 'CylinderGeometry');
assert.equal(visualModels.get('ap').geometry.type, 'ConeGeometry');
for (const [i, type] of ['he', 'ap', 'bomb'].entries()) {
  const expected = new T.Color().setHSL(vehicleHue(i + 4) / 360, 0.58, 0.57);
  visualModels.get(type).traverse((o) => {
    if (o.isMesh) assert.ok(o.material.color.equals(expected));
  });
}
visualContext.snap.ordnance = [];
vm.runInContext('updateOrdnance(0)', visualContext);
assert.equal(visualModels.size, 0);

// Execute the real audio updater: siren is Stuka-only, and the loop leaves the
// keep set on exit/destruction rather than merely lowering its volume.
const { diveIntensity } = await import('../src/combat.js');
let kept = new Set();
const soundModels = new Map();
const audioVehicles = Object.keys(VEHICLES).map((type) => ({
  id: type,
  type,
  seats: [{ seat: 'pilot' }],
  state: { v: [0, -0.3, 0] },
}));
for (const v of audioVehicles) {
  const g = new T.Group();
  g.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 3);
  soundModels.set(v.id, g);
}
const audioContext = {
  T,
  MAP,
  ACTOR_UNIT,
  VEHICLES,
  diveIntensity,
  spectating: false,
  joined: true,
  respawnAt: 0,
  camera: new T.PerspectiveCamera(),
  sound: {
    scene: 'flight',
    setScene() {},
    listener() {},
    loop() {},
    play() {},
    keep: (s) => (kept = new Set(s)),
  },
  snap: { vehicles: audioVehicles, phase: 'prep', next_wave_at: 0, fan: false },
  clockOffset: 0,
  onFoot: true,
  myVehicle: null,
  others: new Map(),
  fleetModels: soundModels,
  insects: new Map(),
  audioHUD() {},
};
vm.createContext(audioContext);
vm.runInContext(
  source.slice(
    source.indexOf('let lastCountdownTick = null;'),
    source.indexOf('let prev = performance.now()'),
  ),
  audioContext,
);
vm.runInContext('updateAudio()', audioContext);
assert.deepEqual(
  [...kept].filter((k) => k.startsWith('dive-')),
  ['dive-interceptor'],
);
audioVehicles.find((v) => v.type === 'interceptor').seats = [];
vm.runInContext('updateAudio()', audioContext);
assert.ok(!kept.has('dive-interceptor'));
audioVehicles.find((v) => v.type === 'interceptor').seats = [{ seat: 'pilot' }];
soundModels.get('interceptor').visible = false;
vm.runInContext('updateAudio()', audioContext);
assert.ok(!kept.has('dive-interceptor'));
console.log(
  'Actual visuals/audio: typed HE/AP meshes, persistent bomb/shell hues, disposal, Stuka-only dive and loop cleanup on exit/destruction.',
);

// Copilot audio follows shared engine state, even when local pilot globals disagree.
const heliAudio = {
  id: 'audio-h2',
  type: 'helicopter',
  state: { hp: 200, engine: 1, gas: 0.5, rotorPower: 1, v: [0, 0, 0] },
  supplies: { fuel: 300 },
  seats: [{ seat: 'copilot' }],
};
Object.assign(audioContext, {
  myVehicle: heliAudio,
  crewSeat: 'copilot',
  engine: 0,
  gas: 0,
  remainingFuel: () => 300,
  me: new T.Group(),
});
audioContext.snap.vehicles.push(heliAudio);
vm.runInContext('updateAudio()', audioContext);
assert.ok(kept.has('engine-self'));
heliAudio.state.engine = 0;
audioContext.engine = 1;
vm.runInContext('updateAudio()', audioContext);
assert.ok(!kept.has('engine-self'));
console.log('Copilot engine audio: shared engine on/off overrides stale local pilot state.');
