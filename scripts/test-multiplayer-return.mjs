import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Game } from '../server/game.js';
import { VEHICLES } from '../src/fleet.js';
import { SHOP, shopPrice, supportedPlacement } from '../src/equipment.js';
import { MAP, ACTOR_UNIT, INSECT_SCALE } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { OFFICE_SOLIDS } from '../worker/assets.js';
import { fullAmmo, inRadarCoverage } from '../src/logistics.js';
import { WALKER_FALL, stepWalkerFall, impactDamage } from '../src/field-physics.js';
import { createGraphics } from '../src/graphics.js';
import { insectScale } from '../src/insect-status.js';
import { nearestInsectHit } from '../src/insect-hits.js';
import { playerInitials, identifyPlayer } from '../src/player-livery.js';
import { controlHints, cursorStats } from '../src/live-hud.js';
import { GunSalvos } from '../src/salvos.js';
import { makeShotTrace, TracerPool } from '../src/tracers.js';
import { wavePlan, swarmFrame } from '../src/waves.js';
import { enemyRoute } from '../src/routes.js';
import { blockedSegment } from '../src/route-navigation.js';
import { HEAVY, heavyDamage } from '../src/armament.js';
import { createOrdnance } from '../src/ordnance.js';
let now = 100000;
const game = new Game({ now: () => now, solids: OFFICE_SOLIDS });
const joined = game.join({ code: 'RETURN', name: 'Jean Dupont' }),
  r = game.rooms.get('RETURN'),
  p = r.pilots.get(joined.id);
const mate = game.join({ code: 'RETURN', name: 'Jean Dupont' }),
  q = r.pilots.get(mate.id);
const cmd = (path, b = {}, person = p) => game.command(r.code, person.id, path, b);
const v = [...r.vehicles.values()].find((v) => v.type === 'bomber');
game.assign(r, p, v, 'pilot', null);
game.kill(r, p, p.incarnation);
assert.equal(p.state.awaitingPurgatory, true);
assert.equal(v.seats.has('pilot'), false);
assert.equal([...r.souls.values()].filter((s) => s.kind === 'player').length, 0);
assert.equal(
  r.base.bodies.some((b) => b.entity === p.id && !b.gone),
  false,
);
assert.throws(() => cmd('buy', { item: 'engine', request: 'forbidden-buy' }), /purgatoire/);
assert.throws(() => cmd('enter-purgatory', { incarnation: p.incarnation - 1 }), /périmé/);
cmd('enter-purgatory', { incarnation: p.incarnation });
cmd('enter-purgatory', { incarnation: p.incarnation });
assert.equal(
  [...r.souls.values()].filter((s) => s.kind === 'player' && s.status === 'waiting').length,
  1,
);
game.kill(r, p, p.incarnation);
assert.equal(p.state.awaitingPurgatory, true);
assert.equal(p.state.realm, 'super');
cmd('enter-purgatory', { incarnation: p.incarnation });
game.kill(r, p, p.incarnation);
assert.equal(p.state.awaitingPurgatory, false);
assert.equal(p.state.realm, 'super');
assert.equal(
  [...r.souls.values()].filter((s) => s.kind === 'player' && s.status === 'waiting').length,
  1,
);
cmd('reset');
assert.equal(p.life, 'alive');
assert.ok(!p.state.awaitingPurgatory);
assert.notEqual(p.colorSequence, q.colorSequence);
const beforeColor = p.colorSequence;
const rejoin = game.join({ code: r.code, resumeKey: joined.resumeKey, name: p.name });
assert.equal(r.pilots.get(rejoin.id).colorSequence, beforeColor);
console.log(
  'Observation: immediate seat/body removal, no soul before click, inactive controls, idempotent click, super-super rule, reset and stable identity colour.',
);

// One ready reserve per starter; active and returned hulls are never removed.
for (const type of ['fighter', 'bomber'])
  for (let i = 0; i < 4; i++) {
    const reserved = [...r.vehicles.values()].filter(
      (v) => v.type === type && v.origin === 'starter' && v.ready && v.state.hp > 0,
    );
    assert.equal(reserved.length, 1);
    const plane = reserved[0];
    game.assign(r, p, plane, 'pilot', null);
    game.sync(r, p, {
      mode: 'flight',
      occupation: p.occupation,
      state: {
        ...plane.state,
        landed: false,
        p: [plane.state.p[0], plane.state.p[1] + 0.1, plane.state.p[2]],
      },
    });
    game.fleet(r);
    game.fleet(r);
    assert.equal(
      [...r.vehicles.values()].filter((v) => v.type === type && v.ready && v.state.hp > 0).length,
      1,
    );
    plane.state.landed = true;
    game.fleet(r);
    assert.equal(plane.ready, 0);
    game.release(r, p);
    p.mode = 'foot';
  }
assert.equal([...r.vehicles.values()].filter((v) => v.origin === 'starter').length, 10);
console.log(
  'Reserves: successive takeoffs keep used aircraft, produce one ready reserve, returning aircraft never trigger another spawn.',
);

// Every type has a prepaid contract, a full footprint, floor placement and no debit at E.
r.dollars = 300;
assert.throws(() => cmd('buy', { item: 'spitfire', request: 'direct-bypass' }), /Signez/);
for (const [index, type] of Object.keys(VEHICLES).entries()) {
  const request = 'vehicle-order-' + type,
    price = shopPrice(type);
  const before = r.dollars;
  cmd('purchase-sign', {
    item: type,
    request,
    signature: true,
    expectedPrice: price,
    epoch: r.base.epoch,
    incarnation: p.incarnation,
  });
  assert.equal(r.dollars, before - price);
  const body = game.base(r, p);
  let position;
  for (let x = -3.6; x < 3.5 && !position; x += 0.2)
    for (let z = 2.7; z > 1.5 && !position; z -= 0.2) {
      const candidate = supportedPlacement(
        { x, y: 0, z },
        OFFICE_SOLIDS,
        [...r.vehicles.values()].map((v) => ({
          x: v.state.p[0],
          y: v.state.p[1],
          z: v.state.p[2],
          clearance: MAP.metres(VEHICLES[v.type].span),
        })),
        type,
      );
      if (candidate) position = candidate;
    }
  assert.ok(position, type + ' has a supported free floor footprint');
  Object.assign(body, {
    x: (position.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - position.z) / ACTOR_UNIT,
    y: position.y,
    grounded: true,
    parachute: false,
  });
  const payload = { token: request, position, epoch: r.base.epoch, incarnation: p.incarnation };
  assert.throws(() => cmd('place-purchase', payload, q), /appartient/);
  cmd('place-purchase', payload);
  cmd('place-purchase', payload);
  const bought = [...r.vehicles.values()].filter((v) => v.origin === 'purchase' && v.type === type);
  assert.equal(bought.length, 1);
  assert.equal(bought[0].state.p[0], position.x);
  assert.equal(bought[0].state.p[1], position.y + VEHICLES[type].gear);
  assert.equal(r.dollars, before - price);
}
assert.equal(SHOP.fighter.cost, 8);
assert.equal(SHOP.bomber.cost, 16);
assert.equal(fullAmmo('spitfire').pilot, 1000);
const salvo = new GunSalvos(),
  departures = [];
salvo.enqueue('s', 100, 6);
salvo.update('s', 100, (i) => departures.push(i));
assert.deepEqual(departures, [0]);
salvo.update('s', 110, (i) => departures.push(i));
assert.deepEqual(departures, [0, 1, 2, 3, 4, 5]);
salvo.enqueue('s', 200, 4);
salvo.update('new-role', 300, (i) => departures.push(i));
assert.equal(departures.length, 6, 'occupation invalidates pending guns');
console.log(
  'Vehicle shop: all seven types sign/prepay/place on floor, ownership/replay, complete footprint, no automatic pad spawn; six staggered barrels and partial salvos.',
);

assert.equal(WALKER_FALL.gravity, 0.02943);
for (const height of [0.1, 0.9, 2]) {
  const body = { y: height, vy: 0, grounded: false };
  let time = 0;
  while (body.y > 0 && time < 120) {
    stepWalkerFall(body, 1 / 240);
    time += 1 / 240;
  }
  assert.ok(time > Math.sqrt((2 * height) / 9.81) * 4);
  assert.ok(-body.vy <= 0.162 + 1e-8);
  assert.ok(impactDamage(-body.vy) > 0);
}
const inherited = { y: 1, vy: -0.5, parachute: true };
stepWalkerFall(inherited, 0.01);
assert.ok(inherited.vy < -0.49, 'no instantaneous velocity truncation');
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  origin = new T.Vector3(0, 0, 0),
  dir = new T.Vector3(0, 0, -1);
const trace = makeShotTrace(T, scene, origin, dir, '#ffe');
trace.updateWorldMatrix(true, true);
assert.ok(trace.userData.core.getWorldPosition(new T.Vector3()).dot(dir) > 0);
for (const scale of [MAP.ratio, 1])
  for (const pitch of [-1.52, -0.8, 0, 0.8, 1.52]) {
    const { shoulderView, muzzleAim, aimPistol } = await import('../src/personal-aim.js');
    const cam = new T.PerspectiveCamera();
    const view = shoulderView(T, { x: 0, y: 0, z: 0 }, 1, pitch, 5.8, scale);
    cam.position.copy(view.eye);
    cam.lookAt(view.target);
    cam.updateMatrixWorld();
    const person = graphics.humanoid('#abc');
    person.scale.setScalar(scale);
    const muzzle = new T.Object3D();
    muzzle.position.set(0, -0.64, 0.05);
    person.userData.arms[1].elbow.add(muzzle);
    const forward = cam.getWorldDirection(new T.Vector3());
    aimPistol(T, person, forward);
    const aim = muzzleAim(
      T,
      cam,
      muzzle,
      view.target.clone().addScaledVector(forward, 150 * scale),
      150 * scale,
    );
    assert.ok(aim);
    assert.ok(aim.direction.dot(forward) > 0.99);
  }
console.log(
  'Fall/aim: scaled .02943 gravity, long desk fall, inherited velocity preserved, forward static tracer and almost vertical aim in both scales.',
);

const midge = graphics.insect('midge');
midge.scale.setScalar(insectScale('midge', INSECT_SCALE));
midge.position.set(0, 0, -0.1);
assert.equal(midge.userData.hitTolerance, 1.2);
assert.equal(insectScale('midge', 1), 1.35 * 1.5 * 3);
let tolerant = 0,
  exact = 0;
for (let x = -0.008; x <= 0.008; x += 0.0001) {
  const point = new T.Vector3(x, 0, 0);
  midge.userData.hitTolerance = 1;
  exact += !!nearestInsectHit(T, point, dir, new Map([[0, midge]]), 1);
  midge.userData.hitTolerance = 1.2;
  tolerant += !!nearestInsectHit(T, point, dir, new Map([[0, midge]]), 1);
}
assert.ok(tolerant > exact);
assert.equal(nearestInsectHit(T, new T.Vector3(1, 1, 0), dir, new Map([[0, midge]]), 1), null);
for (const type of ['dart', 'guard', 'brute', 'ant', 'roach'])
  assert.equal(graphics.insect(type).userData.hitTolerance, 1);
const pool = new TracerPool(T, scene, 8);
for (let i = 0; i < 1000; i++) {
  const model = pool.acquire(origin, dir, '#abc');
  model.userData.dispose();
}
assert.equal(pool.all.size, 1);
pool.dispose();
assert.equal(pool.all.size, 0);
assert.equal(playerInitials('Jean Dupont'), 'JD');
assert.equal(playerInitials('Élodie'), 'ÉL');
assert.equal(playerInitials(''), '?');
function canvas() {
  return { width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) };
}
const human = graphics.humanoid('#abc');
identifyPlayer(T, human, { name: 'Jean Dupont', colorSequence: 3 }, canvas);
const identity = human.userData.initials;
identifyPlayer(T, human, { name: 'Jean Dupont', colorSequence: 3 }, canvas);
assert.equal(human.userData.initials, identity);
assert.equal(identity.length, 2);
for (const y of [0, 3.2, 100]) {
  assert.ok(inRadarCoverage({ x: 2, y, z: 0 }, [{ kind: 'radar', x: 0, y: 0.9, z: 0 }]));
  assert.ok(!inRadarCoverage({ x: 2.0001, y, z: 0 }, [{ kind: 'radar', x: 0, y: 0.9, z: 0 }]));
}
console.log(
  'Presentation: current threefold further midge scale, extra 20% tolerance only for midges, bounded reusable tracers, stable contrasting initials, radar horizontal 2m at all altitudes.',
);

for (let seed = 0; seed < 8; seed++)
  for (const wave of [1, 4, 8]) {
    const plan = wavePlan('EXTENT' + seed, wave, 1234);
    if (wave === 1) {
      assert.equal(plan.roster.filter((e) => e.type === 'midge').length, 20);
      assert.equal(plan.roster.filter((e) => e.type === 'ant').length, 4);
    }
    for (const enemy of [
      plan.roster.find((e) => e.ground),
      plan.roster.find((e) => !e.ground),
    ].filter(Boolean)) {
      const route = enemyRoute(enemy),
        xs = route.samples.map((s) => s.p[0]),
        zs = route.samples.map((s) => s.p[2]);
      assert.ok(Math.max(...xs) - Math.min(...xs) > 5.5);
      assert.ok(Math.max(...zs) - Math.min(...zs) > 5);
      assert.ok(enemy.duration > 100);
      for (let i = 1; i < route.samples.length - 2; i++)
        assert.ok(
          !blockedSegment(route.samples[i - 1].p, route.samples[i].p, !!enemy.ground),
          enemy.type + ' route crosses solid',
        );
      assert.ok(swarmFrame([enemy], enemy.spawn + enemy.duration - 0.1)[0]);
      assert.equal(swarmFrame([enemy], enemy.spawn + enemy.duration + 0.1)[0], null);
    }
  }
const bombVehicle = {
  id: 'b',
  type: 'bomber',
  state: { p: [0, 1, 0], q: [0, 0, 0, 1], v: [0, 0, 0] },
  supplies: { sequence: 3 },
};
const bomb = createOrdnance({
  shot: 'radius',
  weapon: 'bomb',
  vehicle: bombVehicle,
  shooter: p.id,
  direction: [0, 0, -1],
  now,
  wave: 1,
});
assert.equal(bomb.radiusFactor, 2);
bombVehicle.type = 'interceptor';
assert.equal(
  createOrdnance({
    shot: 'radius2',
    weapon: 'bomb',
    vehicle: bombVehicle,
    shooter: p.id,
    direction: [0, 0, -1],
    now,
    wave: 1,
  }).radiusFactor,
  1,
);
assert.equal(heavyDamage('bomb', HEAVY.bomb.radius * 2, 1, 2), 60);
assert.equal(heavyDamage('bomb', HEAVY.bomb.radius * 2 + 0.00001, 1, 2), 0);
assert.equal(heavyDamage('bomb', 0, 1, 2), 240);
assert.match(
  controlHints({ vehicle: { type: 'tank' }, seat: 'cannon' }),
  /Clic : canon.*Espace : coaxiale/,
);
assert.match(controlHints({}), /jet/);
assert.match(controlHints({ airborne: true }), /parachute/);
assert.deepEqual(
  cursorStats({
    vehicle: { supplies: { ammo: { bomb: 50 } } },
    seat: 'pilot',
    hp: 67,
    speed: 123.4,
    ammo: 0,
  }),
  { speed: 123, hp: 67, ammo: 0, bombs: 50 },
);
const source = readFileSync('src/client.js', 'utf8');
const canCapture = source.slice(
  source.indexOf('function canCapture() {'),
  source.indexOf('function toggleControl()'),
);
assert.equal(
  vm.runInNewContext(canCapture + ';canCapture()', { joined: true, spectating: true }),
  false,
);
console.log(
  'Routes/HUD/bombs: room-wide air/ground routes with valid solids/deadlines, early ants, bomber-only double radius, permanent contextual hints and live vehicle statistics.',
);

assert.match(controlHints({ turret: true }), /fusée/);
assert.ok(
  !controlHints({
    vehicle: { type: 'bomber', supplies: { ammo: { bomb: 50 } } },
    seat: 'pilot',
  }).includes('Clic : MG'),
);
