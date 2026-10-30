import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import { VEHICLES, vehiclePad, vehicleEntry, vehicleAccess } from '../src/fleet.js';
import { stepHelicopter } from '../src/helicopter.js';
import { fullAmmo } from '../src/logistics.js';
import { MAP, ENEMY_SIZE_FACTORS } from '../src/scale.js';
import { wavePlan } from '../src/waves.js';
import { baselineTravelSpeed } from '../src/route-speed.js';
import { makeShotTrace, moveShotTrace, advanceShotTrace } from '../src/tracers.js';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
// The rounded subtraction really fails before the H2 landing fix.
const support = 0.0001,
  gear = VEHICLES.helicopter.gear;
const h = vehiclePad('helicopter');
h.p = [0, support + gear, 0];
assert.ok(h.p[1] - gear > support);
const boxes = [new T.Box3(new T.Vector3(-1, 0, -1), new T.Vector3(1, support, 1))];
for (let i = 0; i < 120; i++)
  stepHelicopter(T, h, { collective: 0 }, boxes, 1 / 120, VEHICLES.helicopter);
assert.equal(h.landed, true);
assert.equal(h.hp, 200);
for (const seat of VEHICLES.helicopter.seats) {
  const e = vehicleEntry({ type: 'helicopter', state: h }, seat);
  assert.ok(vehicleAccess(e, { type: 'helicopter', state: h }, seat));
  close(e.y, support);
}
let now = 100000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'COMFORT', name: 'Alpha' }),
  b = game.join({ code: 'COMFORT', name: 'Bravo' });
const r = game.rooms.get('COMFORT');
// Every model, already-full stocks, two overlapping stations: one server repair clock.
for (const type of Object.keys(VEHICLES)) {
  const v = game.createVehicle(r, type);
  v.state.hp = 1;
  v.state.v = [0, 0, 0];
  v.state.landed = true;
  const p = v.state.p;
  const station = { kind: 'refuel', x: p[0], y: p[1] - VEHICLES[type].gear, z: p[2] };
  r.equipment.push(station, { ...station });
  v.supplies.fuel = 300;
  v.supplies.ammo = fullAmmo(type);
  now += 1000;
  game.fleet(r);
  close(v.state.hp, 1 + (VEHICLES[type].maxHP || 100) * 0.1);
  v.state.hp -= 1;
  now += 1000;
  game.fleet(r);
  close(v.state.hp, (VEHICLES[type].maxHP || 100) * 0.2);
  v.state.v = [0.1, 0, 0];
  now += 1000;
  game.fleet(r);
  close(v.state.hp, (VEHICLES[type].maxHP || 100) * 0.2);
  v.state.v = [0, 0, 0];
  now += 10000;
  game.fleet(r);
  close(v.state.hp, VEHICLES[type].maxHP || 100);
  v.state.hp = 0;
  now += 1000;
  game.fleet(r);
  close(v.state.hp, 0);
}
for (const pilot of r.pilots.values()) pilot.seen = now;
const { ACTOR_UNIT } = await import('../src/scale.js');
const { OFFICE_LAYOUT } = await import('../src/layout.js');
const h2 = game.createVehicle(r, 'helicopter');
function board(person, seat) {
  const e = vehicleEntry(h2, seat),
    body = game.base(r, r.pilots.get(person.id));
  Object.assign(body, {
    x: (e.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - e.z) / ACTOR_UNIT,
    y: e.y,
  });
  const ground = { epoch: r.base.epoch, body: { ...body } };
  game.command(r.code, person.id, 'vehicle-select', { vehicle: h2.id, seat, ground });
  for (const form of [1, 2]) {
    const p = r.pilots.get(person.id),
      token = p.state.boarding.token,
      d = r.dossiers.get(token);
    if (d?.clause && d.position <= p.board_paper)
      game.command(r.code, person.id, 'dossier-choice', { token, choice: 'tear' });
    game.command(r.code, person.id, 'vehicle-sign', {
      vehicle: h2.id,
      seat,
      ground,
      signature: true,
      form,
    });
  }
}
board(a, 'pilot');
board(b, 'copilot');
assert.equal(h2.seats.get('pilot'), a.id);
assert.equal(h2.seats.get('copilot'), b.id);
game.command(r.code, a.id, 'vehicle-exit', {});
board(a, 'pilot');
assert.equal(h2.seats.get('pilot'), a.id);
const epoch = r.base.epoch;
game.command(r.code, a.id, 'reset', { epoch });
const after = r.base.epoch;
game.command(r.code, b.id, 'reset', { epoch });
assert.equal(r.base.epoch, after);
assert.equal(r.pilots.size, 2);
assert.equal(r.pilots.get(a.id).name, 'Alpha');
assert.equal(r.pilots.get(b.id).name, 'Bravo');
for (const wave of [1, 2, 8]) {
  const roster = wavePlan('SLOW-ANTS', wave, 123).roster;
  for (const e of roster) {
    if (e.type === 'ant' || !e.ground)
      close(e.travelSpeed, baselineTravelSpeed(e, wave) * (e.type === 'ant' ? 0.25 : 1));
    else
      assert.ok(
        e.travelSpeed <
          Math.min(...roster.filter((a) => a.type === 'ant').map((a) => a.travelSpeed)),
      );
  }
}
assert.equal(ENEMY_SIZE_FACTORS.ant, 6);
const scene = new T.Scene(),
  origin = new T.Vector3(),
  direction = new T.Vector3(0, 0, -1),
  distance = 0.3;
const trace = makeShotTrace(T, scene, origin, direction, '#ffe', MAP.ratio, distance);
moveShotTrace(T, trace, origin, direction, MAP.ratio, distance, 1000);
const camera = new T.PerspectiveCamera(62, 1, 0.00001, 40);
camera.position.set(0.1, 0.1, 0.1);
assert.ok(advanceShotTrace(T, trace, 1050, camera));
close(trace.position.z, -0.123);
assert.equal(advanceShotTrace(T, trace, 2000, camera), false);
close(trace.position.z, -distance);
const bounds = new T.Box3().setFromObject(trace);
assert.ok(bounds.min.z >= -distance - 1e-7);
assert.ok(bounds.max.z <= 1e-7);
trace.userData.dispose();
// Real event registration must handle chorded mouse buttons (pointerdown only fires for the first).
const client = readFileSync('src/client.js', 'utf8');
assert.match(client, /canvas.addEventListener\('mousedown'/);
assert.match(client, /addEventListener\('mouseup'/);
assert.match(client, /Recommencer pour tout le monde/);
assert.match(client, /x !== 'radar'/);
console.log(
  'Comfort: rounded H2 landing/access, repairs all hulls/overlap/full/departure/destruction, concurrent reset, ant speeds and moving shot endpoints passed.',
);
// Exercise the real staged-index guard in a disposable repository.
const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { resolve, join } = await import('node:path');
const repo = mkdtempSync(join(tmpdir(), 'moucheron-version-'));
const check = resolve('scripts/check-version.mjs');
try {
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(repo, 'VERSION'), '36\n');
  git('add', 'VERSION');
  git('commit', '-m', 'baseline');
  assert.throws(() => execFileSync(process.execPath, [check], { cwd: repo, stdio: 'pipe' }));
  writeFileSync(join(repo, 'VERSION'), '37\n');
  git('add', 'VERSION');
  execFileSync(process.execPath, [check], { cwd: repo, stdio: 'pipe' });
  git('commit', '-m', 'concurrent baseline');
  assert.throws(() => execFileSync(process.execPath, [check], { cwd: repo, stdio: 'pipe' }));
  writeFileSync(join(repo, 'VERSION'), '38\n');
  git('add', 'VERSION');
  execFileSync(process.execPath, [check], { cwd: repo, stdio: 'pipe' });
} finally {
  rmSync(repo, { recursive: true, force: true });
}
console.log(
  'Version guard: rejects missing increment, accepts next, rejects old number after synchronization.',
);
