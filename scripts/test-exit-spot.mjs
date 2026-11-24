// Where a player appears when leaving a parked vehicle (src/exit-spot.ts): at the door when a
// person can stand there, else on the nearest free spot (a monitor or a box at the door used to
// swallow the player, the edge of a desk dropped them), never under the vehicle's own hull.
import assert from 'node:assert/strict';
import { exitSpot } from '../src/exit-spot.ts';
import { vehicleEntry, EXIT_LIFT, VEHICLES } from '../src/fleet.ts';
import { MAP, WALKER_RADIUS, PERSON_HEIGHT } from '../src/scale.ts';
import { loadRapier } from '../src/physics-world.ts';
import { DecorCollision } from '../src/office-collision.ts';
import { MODEL_DATA } from '../src/office-pack-data.ts';
import { LAYOUTS } from '../src/layouts.ts';

const m = (v) => MAP.metres(v);
const state = (type, x, y, z) => ({
  type,
  state: { p: [x, y + VEHICLES[type].gear, z], q: [0, 0, 0, 1], v: [0, 0, 0], hp: 100 },
});
// A decor made of rectangles: `top` = the support (a desk), `blocked` = props with volume.
const decorOf = ({ top = null, blocked = [] } = {}) => {
  const inside = (x, z, [x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const queries = [];
  return {
    queries,
    surface(q) {
      queries.push(q);
      return top && inside(q.x, q.z, top.area) ? top.y : null;
    },
    clear(q, y) {
      return !blocked.some((b) => {
        const grow = q.rx;
        return (
          inside(q.x, q.z, [b[0] - grow, b[1] - grow, b[2] + grow, b[3] + grow]) &&
          (b[4] ?? Infinity) > y
        );
      });
    },
  };
};
const free = (spot) => spot.free === true;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 1. No decor (or a free door): the door, exactly where it always was.
{
  const v = state('castor', 0, 0, 0);
  const door = vehicleEntry(v, 'pilot');
  const none = exitSpot(v, 'pilot', null);
  assert.deepEqual({ x: none.x, y: none.y, z: none.z }, door);
  const open = exitSpot(v, 'pilot', decorOf());
  assert.ok(open.free && open.x === door.x && open.z === door.z, 'a free door never moves');
}

// 2. On the floor, a prop at the door: the nearest free floor spot, away from the hull.
{
  const v = state('castor', 0, 0, 0);
  const door = vehicleEntry(v, 'pilot');
  const box = [door.x - m(1), door.z - m(1.5), door.x + m(1), door.z + m(1.5)];
  const spot = exitSpot(v, 'pilot', decorOf({ blocked: [[...box, Infinity]] }));
  assert.ok(free(spot), 'a free spot is found');
  assert.ok(distance(spot, door) > 0, 'it is not the blocked door');
  assert.ok(spot.y >= door.y - EXIT_LIFT, 'the feet start at the floor level');
  const half = m(VEHICLES.castor.span / 2);
  assert.ok(Math.hypot(spot.x, spot.z) >= half, 'not under the hull');
  // It stays close: within a few metres of the door.
  assert.ok(distance(spot, door) < m(12), 'the spot is the nearest free one');
}

// 3. On a desk: the door is past the edge (no support, and not the floor): a spot on the desk.
{
  const deskY = m(250);
  const v = state('castor', 0, deskY, 0);
  const door = vehicleEntry(v, 'pilot');
  const edge = door.x - m(0.5); // the desk ends just before the door
  const area = [-m(40), -m(40), edge, m(40)];
  const spot = exitSpot(v, 'pilot', decorOf({ top: { area, y: deskY } }));
  assert.ok(free(spot), 'a spot on the desk');
  assert.ok(spot.x <= edge, 'on the desk, not beyond its edge');
  assert.ok(Math.abs(spot.y - (deskY + EXIT_LIFT)) < 1e-9, 'on the desk surface');
}

// 4. On a desk with a monitor at the door: beside it, on the desk.
{
  const deskY = m(250);
  const v = state('castor', 0, deskY, 0);
  const door = vehicleEntry(v, 'pilot');
  const area = [-m(80), -m(80), m(80), m(80)];
  const monitor = [door.x - m(1), door.z - m(2), door.x + m(1), door.z + m(2), deskY + m(30)];
  const spot = exitSpot(v, 'pilot', decorOf({ top: { area, y: deskY }, blocked: [monitor] }));
  assert.ok(free(spot) && distance(spot, door) > 0, 'a spot beside the monitor');
  assert.ok(Math.abs(spot.y - (deskY + EXIT_LIFT)) < 1e-9);
}

// 5. Nowhere to stand (boxed in): the door as it was, flagged as not free.
{
  const v = state('castor', 0, 0, 0);
  const door = vehicleEntry(v, 'pilot');
  const everything = [-m(500), -m(500), m(500), m(500), Infinity];
  const spot = exitSpot(v, 'pilot', decorOf({ blocked: [everything] }));
  assert.equal(spot.free, false);
  assert.deepEqual({ x: spot.x, y: spot.y, z: spot.z }, door);
}

// 6. The query is a person's: radius from the walking radius, height of a person.
{
  const v = state('tank', 0, 0, 0);
  const decor = decorOf();
  exitSpot(v, 'pilot', decor);
  const q = decor.queries[0];
  assert.ok(q.rx >= m(WALKER_RADIUS) && q.rx === q.rz, 'room for the walking radius');
  assert.ok(q.height >= m(1.8), 'headroom for a person');
}
// 7. The real office: vehicles dropped at random on the floor and on its props. Where a person
// cannot stand at the door (a prop, the edge of a desk), a free spot is found, standable by the
// decor's own queries and outside the hull; where the door is fine it does not move. Seeded.
{
  const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
  const decor = new DecorCollision(RAPIER, MODEL_DATA, LAYOUTS[0].props);
  let seed = 20261124;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const radius = m(WALKER_RADIUS * 1.5),
    height = m(PERSON_HEIGHT);
  const query = (x, y, z) => ({ x, y, z, angle: 0, rx: radius, rz: radius, height, rugged: true });
  let moved = 0,
    kept = 0,
    unresolved = 0;
  for (const type of ['castor', 'tank', 'flaktruck', 'bomber']) {
    for (let i = 0; i < 1200; i++) {
      const x = (random() * 2 - 1) * 1.5,
        z = (random() * 2 - 1) * 1.5;
      const hit = decor.raycast([x, 3, z], [0, -1, 0], 3.1);
      const top = hit && hit.normal[1] > 0.95 ? hit.point[1] : 0;
      const vehicle = {
        type,
        state: { p: [x, top + VEHICLES[type].gear, z], q: [0, 0, 0, 1], v: [0, 0, 0], hp: 100 },
      };
      // The vehicle itself must stand in free space.
      const hull = {
        ...query(x, top, z),
        rx: m(VEHICLES[type].span / 2),
        rz: m(VEHICLES[type].length / 2),
        height: m(3),
      };
      if (!decor.clear(hull, top)) continue;
      const door = vehicleEntry(vehicle, 'pilot');
      const spot = exitSpot(vehicle, 'pilot', decor);
      if (!spot.free) {
        unresolved++;
        continue;
      }
      const surface = spot.y - EXIT_LIFT;
      const q = query(spot.x, door.y, spot.z);
      // Standable by the decor's own queries (on the floor: the floor itself).
      const support = decor.surface(q) ?? (top <= m(0.5) ? surface : null);
      assert.ok(
        support != null && Math.abs(support - surface) < 1e-9,
        type + ': a surface under the feet',
      );
      assert.ok(decor.clear(q, surface), type + ': nothing at the body of the person');
      if (spot.x === door.x && spot.z === door.z) kept++;
      else {
        moved++;
        const half = [m(VEHICLES[type].span / 2), m(VEHICLES[type].length / 2)];
        assert.ok(
          Math.abs(spot.x - x) >= half[0] || Math.abs(spot.z - z) >= half[1],
          type + ': not under its hull',
        );
        assert.ok(
          Math.hypot(spot.x - door.x, spot.z - door.z) < m(25),
          type + ': close to the door',
        );
      }
    }
  }
  assert.ok(moved > 0, 'some doors were blocked by a prop or an edge, and moved (non-vacuous)');
  assert.ok(kept > moved, 'most doors are free and do not move');
  assert.ok(unresolved <= 4, 'almost every blocked door is resolved (' + unresolved + ')');
}
console.log('Exit spot: door kept when free, else nearest free spot on the same support.');
