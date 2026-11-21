// Office layouts: every plan is playable (routes, spawn, colliders), a room keeps
// the plan it was created with, and two rooms of different plans coexist.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { Game } from '../server/game.js';
import {
  LAYOUTS,
  FURNITURE_KINDS,
  DEFAULT_LAYOUT_ID,
  activeLayout,
  setActiveLayout,
  layoutSolids,
  layoutThumbnail,
  isLayoutId,
} from '../src/layouts.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { enemyRoute, PORTALS } from '../src/routes.js';
import { blockedSegment } from '../src/route-navigation.js';
import { staticGroundFlow, groundGoal, groundStaticObstacles } from '../src/ground-defense.js';
import { createGraphics } from '../src/graphics.js';
import { createOffice } from '../src/office.js';
import { OFFICE_CLOUD_TOP, FOG_START_RATIO } from '../src/office-fog.ts';
import { prepareRoster } from '../server/wave-preparation.js';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { advanceGroundCrowd } from '../src/ground-crowd.js';
import { newGroundDefense, groundFlow } from '../src/ground-defense-state.js';

assert.equal(LAYOUTS.length, 6, 'six plans');
assert.equal(new Set(LAYOUTS.map((l) => l.id)).size, LAYOUTS.length, 'unique ids');
assert.equal(LAYOUTS[0].id, DEFAULT_LAYOUT_ID);
assert.ok(isLayoutId('ilots') && !isLayoutId('inconnu') && !isLayoutId(undefined));
const inRoom = (x, z, m = 0) => Math.abs(x) <= 4.2 - m && Math.abs(z) <= 3.6 - m;
const inside = (box, x, z, pad = 0) =>
  x > box.min.x - pad && x < box.max.x + pad && z > box.min.z - pad && z < box.max.z + pad;

for (const layout of LAYOUTS) {
  setActiveLayout(layout.id);
  const name = layout.id + ': ';
  assert.equal(activeLayout(), layout);
  assert.equal(OFFICE_LAYOUT.bin, layout.bin, 'OFFICE_LAYOUT follows the active plan');
  assert.equal(PORTALS.ground, layout.portals.ground);
  assert.ok(layout.name && layout.summary, name + 'named');
  for (const it of layout.furniture) {
    assert.ok(FURNITURE_KINDS[it.kind], name + 'known kind ' + it.kind);
    assert.ok(
      inRoom(it.x - it.w / 2, it.z - it.d / 2) && inRoom(it.x + it.w / 2, it.z + it.d / 2),
      name + 'furniture inside the room: ' + it.kind + it.x,
    );
  }
  // Entries: on the walls, far enough from the bin, and none inside furniture.
  assert.equal(layout.portals.ground.length, 3, name + 'three ground holes');
  assert.equal(layout.portals.air.length, 4, name + 'four vents');
  const solids = layoutSolids(layout).filter((b) => b.max.y > 0.01 && b.min.y < 3);
  for (const [x, y, z] of [...layout.portals.ground, ...layout.portals.air]) {
    assert.ok(Math.abs(x) > 4.1 || Math.abs(z) > 3.5, name + 'entry on a wall');
    assert.ok(
      Math.hypot(x - layout.bin.x, z - layout.bin.z) >= 3.5,
      name + 'entry far from the bin',
    );
    assert.ok(y > 0 && y < 3, name + 'entry height');
  }
  // The bin, its foot and the spawn are free of furniture.
  const floorBoxes = groundStaticObstacles();
  assert.ok(!floorBoxes.some((b) => inside(b, ...groundGoal())), name + 'bin foot is free');
  assert.ok(
    !floorBoxes.some((b) => inside(b, layout.base.originX, layout.base.originZ, 0.05)),
    name + 'spawn is free',
  );
  assert.ok(inRoom(layout.base.originX, layout.base.originZ, 0.3), name + 'spawn in the room');
  assert.ok(
    Math.hypot(layout.base.originX - layout.bin.x, layout.base.originZ - layout.bin.z) <= 3.2,
    name + 'spawn near the bin',
  );
  // Ground: each hole reaches the bin by walking, in no more than ~25 m.
  const flow = staticGroundFlow();
  layout.portals.ground.forEach((p, i) => {
    const route = enemyRoute({ ground: true, portalIndex: i, routeSeed: 1 });
    assert.ok(
      Number.isFinite(route.length) && route.length > 3 && route.length < 25,
      name + 'ground route ' + i + ' ' + route.length,
    );
    assert.ok(flow.smoothRoute([p[0], p[2]]), name + 'flow field reaches hole ' + i);
  });
  // Air: each vent reaches the bin without crossing furniture.
  layout.portals.air.forEach((p, i) => {
    const route = enemyRoute({ ground: false, portalIndex: i, routeSeed: 1 });
    assert.ok(route.length > 4 && route.length < 40, name + 'air route ' + i + ' ' + route.length);
    for (let k = 1; k < route.samples.length; k++)
      assert.ok(
        !blockedSegment(route.samples[k - 1].p, route.samples[k].p),
        name + 'air route ' + i + ' crosses furniture',
      );
    const top = Math.max(...route.samples.slice(48).map((s) => s.p[1]));
    assert.ok(
      top <= OFFICE_CLOUD_TOP * FOG_START_RATIO,
      name + 'air route ' + i + ' stays under the clouds',
    );
    const end = route.samples.at(-1).p;
    assert.ok(
      Math.hypot(end[0] - layout.bin.x, end[2] - layout.bin.z) < 0.6,
      name + 'air route ends at the bin',
    );
  });
  assert.match(layoutThumbnail(layout), /^<svg[\s\S]*<\/svg>$/);
}

// Walking insects really get to the bin from every hole (no corner traps).
for (const layout of LAYOUTS) {
  setActiveLayout(layout.id);
  const state = newGroundDefense();
  const world = {
    structures: state.structures,
    goalFlow: groundFlow(state),
    baitFlow: () => null,
    damageWall: () => {},
  };
  let seed = 11;
  const random = (n) => (
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0),
    Math.floor((seed / 4294967296) * n)
  );
  const ants = prepareRoster(5, DEFAULT_BALANCE, random).roster.filter((e) => e.type === 'ant');
  ants.forEach((e, i) => (e.portalIndex = i % 3)); // every hole gets a share
  const units = {};
  for (let time = 0; time < 260; time += 0.1)
    advanceGroundCrowd(units, ants, new Set(), Math.max(0, time - 0.1), time, world);
  const holes = new Set(ants.map((e) => e.portalIndex));
  assert.equal(holes.size, 3, layout.id + ': ants use the three holes');
  const arrived = ants.filter((e) => units[e.id]?.arrived).length;
  assert.ok(
    arrived >= ants.length * 0.97,
    layout.id + ': ants reach the bin ' + arrived + '/' + ants.length,
  );
}

// Routes are cached per plan: same enemy, different plans, different courses.
setActiveLayout('diagonale');
const a = enemyRoute({ ground: true, portalIndex: 0, routeSeed: 7 });
setActiveLayout('ilots');
const b = enemyRoute({ ground: true, portalIndex: 0, routeSeed: 7 });
assert.notEqual(a.length, b.length, 'ground route depends on the plan');
setActiveLayout('diagonale');
assert.equal(enemyRoute({ ground: true, portalIndex: 0, routeSeed: 7 }), a, 'cache is per plan');

// Drawn colliders are exactly the layout solids.
for (const layout of LAYOUTS) {
  setActiveLayout(layout.id);
  const scene = new T.Scene();
  const office = createOffice(T, scene, createGraphics(T, scene));
  const solids = layoutSolids(layout);
  assert.equal(office.colliders.length, solids.length, layout.id + ': one collider per solid');
  office.colliders.forEach((box, i) => {
    for (const k of ['x', 'y', 'z']) {
      assert.ok(Math.abs(box.min[k] - solids[i].min[k]) < 1e-4, layout.id + ' min ' + k);
      assert.ok(Math.abs(box.max[k] - solids[i].max[k]) < 1e-4, layout.id + ' max ' + k);
    }
  });
  office.dispose();
  assert.equal(scene.children.filter((c) => c.isGroup).length, 0, 'dispose removes the room');
}

// Rooms: the creator's plan is kept, an invalid one falls back, two plans coexist.
let now = 1_000_000;
const game = new Game({ now: () => now });
const first = game.join({ code: 'ROOMA', name: 'A', layout: 'cloison' });
assert.equal(first.snapshot.layout, 'cloison');
const second = game.join({ code: 'ROOMB', name: 'B', layout: 'archives' });
assert.equal(second.snapshot.layout, 'archives');
const again = game.join({ code: 'ROOMA', name: 'C', layout: 'ilots' });
assert.equal(again.snapshot.layout, 'cloison', 'an existing room keeps its plan');
assert.equal(
  game.join({ code: 'ROOMC', name: 'D', layout: 'nimporte' }).snapshot.layout,
  DEFAULT_LAYOUT_ID,
);
assert.equal(game.join({ code: 'ROOMD', name: 'E' }).snapshot.layout, DEFAULT_LAYOUT_ID);
// Whichever room was handled last, the next command runs with its own plan.
game.snapshot(game.rooms.get('ROOMB'));
assert.equal(activeLayout().id, 'archives');
game.player('ROOMA', first.id);
assert.equal(activeLayout().id, 'cloison');
assert.equal(
  game.solids,
  layoutSolids(LAYOUTS.find((l) => l.id === 'cloison')),
  'solids follow the room',
);
// A new pilot appears at the spawn of its room's plan.
const spawn = LAYOUTS.find((l) => l.id === 'cloison').base;
assert.ok(Math.abs(first.state.p[0] - spawn.originX) < 1e-9);
console.log(
  'PASS: six playable plans (routes, spawn, colliders), plan fixed per room, two plans side by side.',
);
