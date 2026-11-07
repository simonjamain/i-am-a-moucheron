// Issue #97: ground insects take the most direct path to the bin around furniture
// and defenses, and the preparation forecast is the path walked during the wave.
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { predictedGroundPaths } from '../src/wave-ground-paths.js';
import { advanceGroundUnit } from '../src/ground-creatures.js';
import {
  groundCommand,
  groundFlow,
  newGroundDefense,
  GROUND_GOAL,
} from '../src/ground-defense-state.js';
import { distanceToSegment } from '../src/ground-defense.js';
import { enemyRoute, PORTALS, portalExit } from '../src/routes.js';
import { blockedSegment } from '../src/route-navigation.js';

const floor = (points) => points.map(([x, , z]) => [x, z]);
const length = (points) =>
  points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
const groups = PORTALS.ground.map((_, portalIndex) => ({ ground: true, type: 'ant', portalIndex }));

// Walk one insect with the authoritative steering and record every pose.
function walk(structures, portalIndex, type = 'ant') {
  const [x, , z] = portalExit(PORTALS.ground[portalIndex]);
  const unit = { id: 1, p: [x, z], dir: [0, 1], tasted: [], stickyInside: [], arrived: false };
  const enemy = { type, travelSpeed: 0.085 };
  const world = {
    structures,
    goalFlow: groundFlow({ structures }),
    baitFlow: () => null,
    damageWall: () => false,
  };
  const poses = [[...unit.p]];
  for (let step = 1; step < 20000 && !unit.arrived; step++) {
    advanceGroundUnit(unit, enemy, step * 0.25, 0.25, world);
    poses.push([...unit.p]);
    if (poses.length > 3 && poses.at(-1).every((v, i) => v === poses.at(-3)[i])) break;
  }
  return { unit, poses };
}
function onPolyline(p, polyline) {
  let best = Infinity;
  for (let i = 1; i < polyline.length; i++)
    best = Math.min(best, distanceToSegment(p, polyline[i - 1], polyline[i]));
  return best;
}
function assertWalkedEqualsForecast(structures, label) {
  const forecast = predictedGroundPaths({ groups, walls: structures });
  for (const { portalIndex, points } of forecast) {
    assert.ok(points.length >= 2, label + ': S' + (portalIndex + 1) + ' has a path');
    const line = floor(points);
    const { unit, poses } = walk(structures, portalIndex);
    assert.ok(unit.arrived, label + ': S' + (portalIndex + 1) + ' reaches the bin');
    for (const pose of poses)
      assert.ok(
        onPolyline(pose, line) < 1e-6,
        label + ': S' + (portalIndex + 1) + ' leaves the forecast at ' + pose,
      );
    // Same path, not a shortcut: travel time at constant speed covers the whole
    // forecast length, within the arrival radius and one simulation step.
    const walked = (poses.length - 1) * 0.25 * 0.085;
    assert.ok(
      walked >= length(line) - 0.025 && walked <= length(line) + 0.25 * 0.085 + 1e-6,
      label + ': S' + (portalIndex + 1) + ' walked ' + walked + ' vs ' + length(line),
    );
  }
  return forecast;
}

// 1. Undefended desk: direct path around furniture, identical to the nominal route.
const empty = assertWalkedEqualsForecast([], 'undefended');
for (const path of empty) {
  const line = floor(path.points);
  const straight = Math.hypot(line[0][0] - GROUND_GOAL[0], line[0][1] - GROUND_GOAL[1]);
  assert.ok(length(line) <= straight * 1.08, 'S' + (path.portalIndex + 1) + ' detours');
  const nominal = enemyRoute(groups[path.portalIndex]).points.filter((p) => p[1] < 0.01);
  assert.deepEqual(line, floor(nominal), 'nominal timing route is the forecast');
  for (let i = 1; i < path.points.length; i++)
    assert.equal(
      blockedSegment(path.points[i - 1], path.points[i], true),
      false,
      'crosses furniture',
    );
}

// 2. Barricade then bunker across S2's path: the draft preview equals the built
// result, the detour is taken, and the walked path still matches the forecast.
const defense = newGroundDefense();
const s2 = floor(empty[1].points);
const middle = [(s2[0][0] + s2[1][0]) / 2, (s2[0][1] + s2[1][1]) / 2];
const wall = {
  action: 'build',
  kind: 'barricade',
  a: [middle[0] - 0.3, middle[1] + 0.05],
  b: [middle[0] + 0.3, middle[1] + 0.05],
};
const draft = predictedGroundPaths({ groups, walls: defense.structures, command: wall });
groundCommand(defense, wall, wall.a, 100);
const built = assertWalkedEqualsForecast(defense.structures, 'barricade');
assert.deepEqual(draft, built, 'barricade draft preview equals the confirmed path');
assert.notDeepEqual(built[1].points, empty[1].points, 'the barricade changes S2');
const s3 = floor(built[2].points);
const bunkerAt = [(s3[0][0] + s3[1][0]) / 2, (s3[0][1] + s3[1][1]) / 2];
const bunker = { action: 'build', kind: 'bunker', a: bunkerAt };
const bunkerDraft = predictedGroundPaths({ groups, walls: defense.structures, command: bunker });
groundCommand(defense, bunker, bunker.a, 100, Date.now(), {
  castor: true,
  blueprintLevels: { bunker: 1 },
});
const fortified = assertWalkedEqualsForecast(defense.structures, 'bunker');
assert.deepEqual(bunkerDraft, fortified, 'bunker draft preview equals the confirmed path');
assert.notDeepEqual(fortified[2].points, built[2].points, 'bunkers block forecasts too');

// 3. No path: the bin is enclosed. The forecast reports a closed passage and the
// server neither crashes nor walks through: destructive species attack the wall.
const closed = newGroundDefense();
const ring = 12;
for (let i = 0; i < ring; i++) {
  const t0 = (i / ring) * 2 * Math.PI,
    t1 = ((i + 1) / ring) * 2 * Math.PI,
    r = 0.25;
  const a = [GROUND_GOAL[0] + r * Math.cos(t0), GROUND_GOAL[1] + r * Math.sin(t0)];
  const b = [GROUND_GOAL[0] + r * Math.cos(t1), GROUND_GOAL[1] + r * Math.sin(t1)];
  groundCommand(closed, { action: 'build', kind: 'barricade', a, b }, a, 100);
}
assert.ok(
  predictedGroundPaths({ groups, walls: closed.structures }).every((p) => p.points.length === 0),
  'an enclosed bin shows "Passage fermé"',
);
let broken = 0;
const roach = walk(closed.structures, 2, 'roach');
const roachWorld = {
  structures: closed.structures,
  goalFlow: groundFlow(closed),
  baitFlow: () => null,
  damageWall: () => ++broken && false,
};
advanceGroundUnit(roach.unit, { type: 'roach', travelSpeed: 0.063 }, 1e6, 5, roachWorld);
assert.ok(broken > 0 || roach.unit.attackId, 'a roach attacks the enclosure');
assert.equal(roach.unit.arrived, false);

// 4. Room integration: the server simulates ground agents from the first combat
// tick, without any construction, starting at their portal.
let now = 200000;
const game = new Game({ now: () => now });
game.join({ code: 'PATHS', name: 'A' });
const room = game.rooms.get('PATHS');
room.phase = 'combat';
room.wave = 1;
room.started = now;
const roster = game.plan(room).roster.filter((e) => e.ground);
assert.ok(roster.length > 0, 'wave 1 sends ground insects');
const first = roster.reduce((a, b) =>
  a.spawn + (a.entryHold || 0) <= b.spawn + (b.entryHold || 0) ? a : b,
);
now = room.started + (first.spawn + (first.entryHold || 0)) * 1000;
game.advanceGround(room, now);
now += 2000;
game.advanceGround(room, now);
const agent = room.groundAgents[first.id];
assert.ok(agent, 'undefended rooms simulate ground agents too');
const forecast = predictedGroundPaths({
  groups: [{ ground: true, type: first.type, portalIndex: enemyRoute(first).portal }],
  walls: [],
})[0];
assert.ok(onPolyline(agent.p, floor(forecast.points)) < 1e-6, 'server agent follows the forecast');
assert.equal(game.snapshot(room).groundNavigationActive, true);

// 5. Performance: one flow field per navigation change, cheap route queries.
let started = performance.now();
const flow = groundFlow(defense);
const build = performance.now() - started;
started = performance.now();
for (let i = 0; i < 30; i++) flow.smoothRoute(floor(empty[i % 3].points)[0]);
const query = (performance.now() - started) / 30;
assert.ok(build < 1000 && query < 100, 'navigation budget');
console.log(
  'Ground paths: direct, forecast = walked path (undefended, barricade, bunker), closed passage, server agents always on; flow ' +
    build.toFixed(0) +
    ' ms, route ' +
    query.toFixed(1) +
    ' ms.',
);
