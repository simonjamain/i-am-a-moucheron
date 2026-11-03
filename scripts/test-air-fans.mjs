import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { airField, bendAirPoint, FAN_FADE_MS } from '../src/air-current.js';
import { AirTrails } from '../src/air-trails.js';
import { newGroundDefense, groundCommand, groundSnapshot } from '../src/ground-defense-state.js';
import { enemyRoutePosition } from '../src/routes.js';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { debugSwarmRoster, swarmFrame } from '../src/waves.js';

const state = newGroundDefense(),
  start = 10000,
  end = start + FAN_FADE_MS;
const u = 0.45,
  route = { portalIndex: 1 },
  center = enemyRoutePosition(route, u);
const a = [center[0], center[2]],
  fan = { position: a, angle: Math.PI / 2, placedAt: start };
const testPoint = (now, field = airField(state, now)) => bendAirPoint([...center], u, field);
const expected = testPoint(end, airField(state, end, fan));
const build = (angle, now) =>
  groundCommand(state, { action: 'build', kind: 'fan', a, angle }, a, 9, now);
assert.equal(build(fan.angle, start).price, 4);
assert.deepEqual(testPoint(start), center);
assert.deepEqual(testPoint(end), expected, 'preview and settled path agree');
assert.ok(expected[0] - center[0] > 0.94 && expected[0] - center[0] <= 1.00001);
assert.equal(state.navigationRevision, 0);
assert.deepEqual(
  airField(groundSnapshot(state, end), end),
  airField(state, end),
  'peer field matches',
);
const halfway = testPoint(start + FAN_FADE_MS / 2);
assert.ok(Math.abs((halfway[0] - center[0]) / (expected[0] - center[0]) - 0.5) < 1e-5);
const before = testPoint(end);
groundCommand(state, { action: 'remove', id: '1' }, a, 9, end);
assert.deepEqual(testPoint(end), before);
assert.deepEqual(testPoint(end + FAN_FADE_MS), center);
assert.equal((groundSnapshot(state, end + FAN_FADE_MS).retiringFans || []).length, 0);
build(fan.angle, end);
build(-fan.angle, end);
assert.ok(Math.abs(testPoint(end + FAN_FADE_MS)[0] - center[0]) < 1e-7, 'opposed fans cancel');
groundCommand(state, { action: 'remove', id: '3' }, a, 9, end + FAN_FADE_MS);
const now = end + FAN_FADE_MS * 2,
  grid = airField(state, now);
assert.equal(airField(state, now + 1), grid, 'settled field is reused');
const scene = new T.Scene(),
  trails = new AirTrails(T, scene);
trails.update({
  code: 'ROOM',
  base: { epoch: '1' },
  groundDefense: state,
  preparation: { groups: [{ ground: false, portalIndex: 1 }] },
});
assert.deepEqual(
  scene.children.map((o) => o.visible),
  [false, true, false, false],
);
const preview = new AirTrails(T, new T.Scene());
preview.update({ code: 'SECOND', base: { epoch: '2' }, groundDefense: newGroundDefense() }, fan);
assert.deepEqual(preview.clouds[1].positions, trails.clouds[1].positions);
const params = {
  room: 'LOAD',
  wave: 1,
  started: 0,
  now: 0,
  balance: DEFAULT_BALANCE,
  firstId: 0,
  revision: 1,
};
const roster = debugSwarmRoster({ midge: 5000 }, params).concat(
  debugSwarmRoster({ midge: 5000 }, { ...params, firstId: 5000 }),
);
const elapsed = 120;
function measure(field) {
  const begin = performance.now();
  const result = swarmFrame(roster, elapsed, null, field);
  assert.ok(result.every((s) => s?.p.every(Number.isFinite)));
  return Math.round((performance.now() - begin) * 10) / 10;
}
measure(null);
measure(grid);
console.log('CPU, une trame de 10 000 moucherons (ms)', {
  sans: measure(null),
  avec: measure(grid),
});
const comparison = debugSwarmRoster({ midge: 1, ant: 1 }, params);
assert.deepEqual(
  swarmFrame(comparison, elapsed, null, grid).at(-1),
  swarmFrame(comparison, elapsed).at(-1),
);
console.log(
  'Ventilateurs : pose, retrait progressif, combinaison, route partagée, aperçu et 10 000 individus.',
);
