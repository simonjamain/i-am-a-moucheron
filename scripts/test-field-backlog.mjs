import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game } from '../server/game.js';
import { VEHICLES, vehicleEntry, vehicleAccess } from '../src/fleet.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
const source = readFileSync('src/client.js', 'utf8');
const eligibility =
  source.slice(
    source.indexOf('function renderPaper() {'),
    source.indexOf('  const visible =', source.indexOf('function renderPaper() {')),
  ) + '\nreturn eligible; }';
for (const type of ['bomber', 'tank'])
  for (const seat of VEHICLES[type].seats) {
    const game = new Game(),
      joined = game.join({ code: 'SEAT' }),
      room = game.rooms.get('SEAT'),
      p = room.pilots.get(joined.id);
    const vehicle =
      type === 'tank'
        ? game.createVehicle(room, 'tank')
        : [...room.vehicles.values()].find((v) => v.type === type);
    const entry = vehicleEntry(vehicle, seat),
      ground = {
        x: (entry.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
        z: (OFFICE_LAYOUT.base.originZ - entry.z) / ACTOR_UNIT,
        y: entry.y,
        grounded: true,
        parachute: false,
      };
    Object.assign(game.base(room, p), ground);
    game.command(room.code, p.id, 'vehicle-select', { vehicle: vehicle.id, seat, ground });
    const snapshot = game.snapshot(room),
      v = snapshot.vehicles.find((v) => v.id === vehicle.id);
    const context = {
      joined: true,
      snap: snapshot,
      id: p.id,
      activeTransfer: null,
      respawnAt: 0,
      onFoot: true,
      myVehicle: null,
      turretIndex: -1,
      selectedEquipment: null,
      boardingOpen: true,
      selectedVehicle: v.id,
      selectedSeat: seat,
      boardingBusy: false,
      paperSubmission: null,
      baseWorld: () => entry,
      selfBase: () => ground,
      vehicleAccess,
    };
    vm.createContext(context);
    vm.runInContext(eligibility, context);
    assert.equal(
      vm.runInContext('renderPaper()', context),
      true,
      `${type}/${seat}: confirmed dossier must remain visible at its own role circle`,
    );
  }
console.log(
  'Field regression: real client role eligibility agrees with authoritative role selection.',
);

// The real server completes both papers at each distinct role circle.
for (const type of ['bomber', 'tank']) {
  const game = new Game(),
    first = game.join({ code: 'CREW' }),
    room = game.rooms.get('CREW');
  const vehicle =
    type === 'tank'
      ? game.createVehicle(room, 'tank')
      : [...room.vehicles.values()].find((v) => v.type === type);
  for (const seat of VEHICLES[type].seats) {
    const j = seat === 'pilot' ? first : game.join({ code: 'CREW' }),
      p = room.pilots.get(j.id),
      e = vehicleEntry(vehicle, seat);
    Object.assign(game.base(room, p), {
      x: (e.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
      z: (OFFICE_LAYOUT.base.originZ - e.z) / ACTOR_UNIT,
      y: e.y,
    });
    game.command(room.code, p.id, 'vehicle-select', { vehicle: vehicle.id, seat });
    room.dossiers.get(p.state.boarding.token).clause = null;
    for (const form of [1, 2])
      game.command(room.code, p.id, 'vehicle-sign', {
        vehicle: vehicle.id,
        seat,
        form,
        signature: true,
      });
    assert.equal(p.vehicle_id, vehicle.id);
    assert.equal(p.seat, seat);
    assert.equal(vehicle.seats.get(seat), p.id);
  }
  assert.equal(vehicle.seats.size, 3);
}

const T = await import('../vendor/three.module.min.js');
const { stepWalker } = await import('../src/sortie.js');
const { impactDamage, WALKER_FALL } = await import('../src/field-physics.js');
function fall(height, openAt = null, dt = 1 / 120) {
  const body = {
    x: 100,
    z: 100,
    y: height,
    vy: 0,
    grounded: false,
    parachute: false,
    r: 0.32,
    vx: 0,
    vz: 0,
  };
  let elapsed = 0,
    impact;
  while (elapsed < 120) {
    if (openAt !== null && elapsed >= openAt) body.parachute = true;
    impact = stepWalker(body, dt, []);
    elapsed += dt;
    if (impact) break;
  }
  return { body, impact, elapsed };
}
assert.equal(impactDamage(0.01), 0);
assert.equal(impactDamage(2), 100);
const noChute = fall(0.9),
  early = fall(0.9, 0),
  late = fall(0.9, 9);
assert.equal(noChute.impact.damage, 100);
assert.ok(early.impact.damage < noChute.impact.damage);
assert.equal(late.impact.damage, 100);
assert.ok(noChute.elapsed > 7, 'miniature gravity creates a long visible fall');
const repeated = { y: 5, vy: -2, parachute: true, grounded: false };
const { stepWalkerFall } = await import('../src/field-physics.js');
stepWalkerFall(repeated, 0.02);
assert.ok(repeated.vy < -1.8, 'opening cannot remove existing velocity instantly');
repeated.parachute = false;
stepWalkerFall(repeated, 0.1);
repeated.parachute = true;
stepWalkerFall(repeated, 0.3);
assert.ok(Number.isFinite(repeated.vy));
assert.ok(Math.abs(fall(0.9, null, 1 / 30).elapsed - fall(0.9, null, 1 / 120).elapsed) < 0.04);
console.log(
  'Falls:',
  JSON.stringify({
    closed: noChute.impact,
    early: early.impact,
    late: late.impact,
    seconds: noChute.elapsed,
  }),
);

const { shoulderView, aimPistol, muzzleAim } = await import('../src/personal-aim.js');
const { createGraphics } = await import('../src/graphics.js');
for (const scale of [0.003, 1])
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const view = shoulderView(T, { x: 0, y: 0, z: 0 }, yaw, 0.24, 5.8, scale),
      cam = new T.PerspectiveCamera(62, 1, 0.00001, 1000);
    cam.position.copy(view.eye);
    cam.lookAt(view.target);
    cam.updateMatrixWorld();
    const p = new T.Vector3(0, 1.5 * scale, 0).project(cam);
    assert.ok(Math.abs(p.x) > 0.06, 'shoulder camera clears centre of body');
    const g = createGraphics(T, new T.Scene()).humanoid('#999');
    g.scale.setScalar(scale);
    const arm = g.userData.arms[1],
      muzzle = new T.Object3D();
    muzzle.position.set(0, -0.8, 0);
    arm.elbow.add(muzzle);
    const direction = cam.getWorldDirection(new T.Vector3());
    aimPistol(T, g, direction);
    const target = cam.position.clone().addScaledVector(direction, 15 * scale),
      aim = muzzleAim(T, cam, muzzle, target, 150 * scale);
    assert.ok(aim);
    assert.ok(aim.direction.dot(direction) > 0.98);
    const blocker = new T.Box3().setFromCenterAndSize(
      aim.origin.clone().addScaledVector(aim.direction, scale),
      new T.Vector3(0.1, 0.1, 0.1).multiplyScalar(scale),
    );
    assert.ok(
      new T.Ray(aim.origin, aim.direction).intersectBox(blocker, new T.Vector3()),
      'muzzle sweep sees foreground obstacles',
    );
  }
const { tankSight, tankBarrelOrigin } = await import('../src/tank-view.js');
const tank = createGraphics(T, new T.Scene()).makeTank('#777');
tank.scale.setScalar(ACTOR_UNIT);
tank.updateMatrixWorld(true);
const mount = tank.userData.turrets[0],
  dir = new T.Vector3(0, 0, -1),
  up = new T.Vector3(0, 1, 0);
const sight = tankSight(T, mount, dir, up),
  observe = tankSight(T, mount, dir, up, { yaw: 1, pitch: 0.3 });
assert.ok(sight.muzzle.distanceTo(mount.userData.muzzle.getWorldPosition(new T.Vector3())) > 0);
assert.ok(observe.observing);
assert.deepEqual(mount.quaternion.toArray(), [0, 0, 0, 1]);
assert.ok(
  new T.Vector3()
    .fromArray(tankBarrelOrigin({ state: { p: [0, 0, 0], q: [0, 0, 0, 1] } }, dir.toArray()))
    .distanceTo(mount.userData.muzzle.getWorldPosition(new T.Vector3())) < 1e-12,
);

const { newBank, LOAN_TERMS, amortization } = await import('../src/bank.js');
assert.ok(LOAN_TERMS.every((t) => t.rate >= 0.1 && t.rate <= 0.2));
for (const rate of [0.1, 0.2]) {
  const loan = amortization(1200, rate, 4);
  assert.equal(loan.schedule.at(-1).remaining, 0);
  assert.equal(
    loan.total,
    loan.schedule.reduce((n, r) => n + r.payment, 0),
  );
}
const { InteractionTiming } = await import('../src/interaction-timing.js');
let time = 0;
const callbacks = [],
  timings = new InteractionTiming(
    () => time,
    (f) => callbacks.push(f),
  );
const trace = timings.begin('vehicle');
trace.mark('feedback');
time = 800;
trace.mark('confirmed');
trace.finish('ready');
assert.equal(timings.records[0].stages.feedback, 0);
assert.equal(timings.records[0].stages.confirmed, 800);
console.log(
  'Field mechanics: complete crews, shoulder/muzzle geometry in both scales, independent observation/coax, rates, immediate feedback and delayed ACK.',
);

const { OFFICE_SOLIDS } = await import('../worker/assets.js');
const { supportedPlacement } = await import('../src/equipment.js');
const { bedSpawn } = await import('../src/beds.js');
const bedGame = new Game({ solids: OFFICE_SOLIDS }),
  bedJoin = bedGame.join({ code: 'BEDS' }),
  bedRoom = bedGame.rooms.get('BEDS'),
  bedPilot = bedRoom.pilots.get(bedJoin.id);
bedRoom.dollars = 50;
let placement;
for (const collider of OFFICE_SOLIDS) {
  const point = {
    x: (collider.min.x + collider.max.x) / 2,
    z: (collider.min.z + collider.max.z) / 2,
    y: collider.max.y + 0.00005,
  };
  const proposed = supportedPlacement(point, OFFICE_SOLIDS, [], 'bed');
  if (proposed && proposed.y < 0.7 && Math.abs(proposed.x) > 1) {
    placement = proposed;
    break;
  }
}
assert.ok(placement, 'a safe bed footprint exists');
function walkTo(p, point) {
  Object.assign(bedGame.base(bedRoom, p), {
    x: (point.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - point.z) / ACTOR_UNIT,
    y: point.y,
    grounded: true,
    parachute: false,
  });
}
walkTo(bedPilot, placement);
bedGame.command('BEDS', bedPilot.id, 'buy', {
  item: 'bed',
  request: 'bed-purchase-1',
  position: placement,
});
const bed = bedRoom.equipment.find((e) => e.kind === 'bed');
assert.ok(bed);
assert.equal(bedRoom.dollars, 46);
const contract = {
  bed: bed.slot,
  incarnation: bedPilot.incarnation,
  epoch: bedRoom.base.epoch,
  signature: true,
};
bedGame.command('BEDS', bedPilot.id, 'bed-contract', contract);
assert.equal(bedPilot.bedId, bed.slot);
const rejoined = bedGame.join({ code: 'BEDS', resumeKey: bedJoin.resumeKey });
assert.equal(bedRoom.pilots.get(rejoined.id).bedId, bed.slot);
assert.ok(
  !JSON.stringify(rejoined.snapshot).includes(bedJoin.resumeKey),
  'resume secret never appears in shared snapshots',
);
function revive(p, superFirst = false) {
  bedGame.kill(bedRoom, p, p.incarnation);
  bedGame.command('BEDS', p.id, 'enter-purgatory', { incarnation: p.incarnation });
  if (superFirst) {
    bedGame.kill(bedRoom, p, p.incarnation);
    bedGame.command('BEDS', p.id, 'enter-purgatory', { incarnation: p.incarnation });
  }
  for (const realm of superFirst ? ['super', 'purgatory'] : ['purgatory']) {
    bedGame.arena(bedRoom, realm);
    const b = bedRoom[realm].bodies.find((b) => b.entity === p.id);
    b.x = 0;
    b.z = 1.1;
    for (let form = 1; form <= (realm === 'super' ? 5 : 3); form++)
      bedGame.command('BEDS', p.id, 'sign', { form, signature: true });
  }
  assert.equal(p.life, 'alive');
  assert.equal(p.health, 100);
}
revive(bedPilot, true);
assert.deepEqual(bedPilot.state.walkSpawn, bedSpawn(bed, OFFICE_SOLIDS, bedRoom.equipment));
walkTo(bedPilot, placement);
bedGame.command('BEDS', bedPilot.id, 'bed-contract', {
  ...contract,
  incarnation: bedPilot.incarnation,
  cancel: true,
});
assert.equal(bedPilot.bedId, null);
revive(bedPilot);
assert.ok(Math.abs(bedPilot.state.walkSpawn.y - OFFICE_LAYOUT.base.deckY) < 0.001);
walkTo(bedPilot, placement);
bedGame.command('BEDS', bedPilot.id, 'bed-contract', {
  ...contract,
  incarnation: bedPilot.incarnation,
});
bedRoom.equipment = [];
revive(bedPilot);
assert.match(bedPilot.state.spawnMessage, /Lit absent/);
console.log(
  'Beds: safe paid placement, personal signed/cancelled destination, two purgatories, full health, default/fallback, private reconnect token.',
);

// One impact report damages once; death uses the authoritative world transition.
const impactGame = new Game(),
  impactJoin = impactGame.join({ code: 'FALL' }),
  impactRoom = impactGame.rooms.get('FALL'),
  impactPlayer = impactRoom.pilots.get(impactJoin.id);
const impactReport = { shot: 'impact-one', speed: 0.039, incarnation: impactPlayer.incarnation };
impactGame.command('FALL', impactPlayer.id, 'fall-impact', impactReport);
const remaining = impactPlayer.health;
impactGame.command('FALL', impactPlayer.id, 'fall-impact', impactReport);
assert.equal(impactPlayer.health, remaining);
impactGame.command('FALL', impactPlayer.id, 'fall-impact', {
  ...impactReport,
  shot: 'impact-fatal',
  speed: 3,
});
assert.equal(impactPlayer.life, 'dead');
assert.equal(impactPlayer.state.realm, 'purgatory');

let waveNow = 100000;
const waveGame = new Game({ now: () => waveNow }),
  waveJoin = waveGame.join({ code: 'MINUTE' }),
  waveRoom = waveGame.rooms.get('MINUTE'),
  wavePlayer = waveRoom.pilots.get(waveJoin.id);
waveGame.command('MINUTE', wavePlayer.id, 'start');
waveNow += 10000;
wavePlayer.seen = waveNow;
waveGame.advance(waveRoom);
assert.equal(waveRoom.wave, 1);
const { wavePlan } = await import('../src/waves.js');
const roster = wavePlan(waveRoom.code, waveRoom.wave, waveRoom.started).roster;
roster.forEach((_, i) => waveRoom.kills.add(i));
waveGame.advance(waveRoom);
assert.equal(waveRoom.phase, 'prep');
assert.equal(waveRoom.next_wave_at - waveNow, 60000);
waveNow += 59999;
wavePlayer.seen = waveNow;
waveGame.advance(waveRoom);
assert.equal(waveRoom.wave, 1);
waveNow++;
wavePlayer.seen = waveNow;
waveGame.advance(waveRoom);
assert.equal(waveRoom.wave, 2);
waveRoom.phase = 'prep';
waveGame.command('MINUTE', wavePlayer.id, 'start');
waveGame.command('MINUTE', wavePlayer.id, 'start');
assert.equal(waveRoom.wave, 3);
console.log(
  'Authority: deduplicated fall damage, purgatory death, 60-second pause, automatic/manual wave start without duplication.',
);

const standing = {
  x: 100,
  z: 100,
  y: 0.05 * ACTOR_UNIT,
  vy: 0,
  grounded: true,
  parachute: false,
  r: 0.32,
  vx: 0,
  vz: 0,
};
for (let frame = 0; frame < 20; frame++)
  assert.equal(stepWalker(standing, 0.25, []), null, 'low FPS standing still is not a fall impact');
