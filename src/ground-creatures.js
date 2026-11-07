import { chooseBait, distanceToSegment, finishMeal, stickyTraversal } from './ground-defense.js';
import { enemyRoutePosition } from './routes.js';
import { feedingPoint, GROUND_BAIT_TYPES, GROUND_GOAL } from './ground-defense-state.js';

export const GROUND_BODY_SIZES = Object.freeze({
  ant: 'small',
  spiderling: 'small',
  roach: 'medium',
  spider: 'medium',
  rat: 'large',
});
export const GROUND_ATTACK_DAMAGE = Object.freeze({ roach: 6, spider: 10, rat: 30 });

// Server-only steering memory; kept out of the serialized unit snapshot.
const waypoints = new WeakMap();
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function groundUnit(enemy, elapsed) {
  const age = Math.max(0, elapsed - enemy.spawn - (enemy.entryHold || 0));
  const travelTime = Math.max(0.001, enemy.duration - (enemy.entryHold || 0));
  const fraction = Math.min(1, age / travelTime);
  const p = enemyRoutePosition(enemy, fraction);
  return {
    id: enemy.id,
    p: [p[0], p[2]],
    dir: [0, 1],
    tasted: [],
    baitId: null,
    eatingUntil: 0,
    stuckUntil: 0,
    stickyInside: [],
    arrived: fraction >= 1,
    attackId: null,
  };
}
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
// Check the swept segment, not only frame endpoints, to catch narrow sticky tape.
export function crossedSticky(a, b, tape) {
  const c = tape.a;
  const d = tape.b;
  const width = tape.width / 2;
  if (
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0 &&
    Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
    Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
      Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
  )
    return true;
  return (
    distanceToSegment(a, c, d) <= width ||
    distanceToSegment(b, c, d) <= width ||
    distanceToSegment(c, a, b) <= width ||
    distanceToSegment(d, a, b) <= width
  );
}
function closestWall(p, structures) {
  return structures
    .filter((s) => ['barricade', 'bunker'].includes(s.kind) && s.hp > 0)
    .map((s) => ({ item: s, d: distanceToSegment(p, s.a, s.b) }))
    .sort((a, b) => a.d - b.d || (a.item.id < b.item.id ? -1 : 1))[0];
}
export function advanceGroundUnit(unit, enemy, elapsed, dt, world) {
  if (unit.arrived || dt <= 0) return unit;
  const speed = enemy.travelSpeed ?? enemy.speedMps;
  if (!Number.isFinite(speed) || speed <= 0) throw Error('Invalid ground speed');
  const structures = world.structures;
  const baits = structures.filter((s) => s.kind === 'sugar');
  const tapes = structures.filter((s) => s.kind === 'sticky');
  const size = GROUND_BODY_SIZES[enemy.type];
  if (!size) throw Error('Unsupported ground species');
  let remaining = dt;
  let hops = 0;
  while (remaining > 0.000001 && hops++ < 1024 && !unit.arrived) {
    const time = elapsed - remaining;
    if (unit.stuckUntil > time) {
      const frozen = Math.min(remaining, unit.stuckUntil - time);
      remaining -= frozen;
      continue;
    }
    if (unit.eatingUntil) {
      if (unit.eatingUntil > time) {
        remaining -= Math.min(remaining, unit.eatingUntil - time);
        continue;
      }
      const last = baits.find((bait) => bait.id === unit.baitId);
      if (last) unit.tasted = finishMeal(unit.tasted, last.type);
      unit.baitId = null;
      unit.eatingUntil = 0;
    }
    const previouslyTargeted = baits.find((bait) => bait.id === unit.baitId);
    if (!previouslyTargeted) unit.baitId = null;
    if (!unit.baitId) {
      const eligible = baits.filter(
        (bait) => !unit.tasted.includes(bait.type) && world.baitFlow(bait)?.nextStep(unit.p),
      );
      const selected = chooseBait(unit.p, eligible, unit.tasted);
      if (selected) unit.baitId = selected.id;
    }
    const bait = baits.find((item) => item.id === unit.baitId);
    const goal = bait ? feedingPoint(bait) : GROUND_GOAL;
    if (dist(unit.p, goal) < (bait ? 0.003 : 0.025)) {
      if (bait) {
        unit.eatingUntil = time + (GROUND_BAIT_TYPES[bait.type]?.mealSeconds ?? 4);
        continue;
      }
      unit.arrived = true;
      break;
    }
    const flow = bait ? world.baitFlow(bait) : world.goalFlow;
    // Hold the current smoothed waypoint until it is reached or the map/target
    // changes, so the walked polyline is the forecast polyline.
    const held = waypoints.get(unit);
    const target = bait ? 'bait:' + bait.id : 'goal';
    let next;
    if (held && held.target === target && held.flow === flow && dist(unit.p, held.point) > 0.000001)
      next = held.point;
    else {
      next = flow?.waypoint ? flow.waypoint(unit.p) : flow?.nextStep(unit.p);
      if (next) waypoints.set(unit, { target, flow, point: next });
      else waypoints.delete(unit);
    }
    if (!next) {
      if (bait) {
        unit.baitId = null;
        continue;
      }
      const wall = closestWall(unit.p, structures);
      const attack = GROUND_ATTACK_DAMAGE[enemy.type] || 0;
      unit.attackId = wall?.item.id || null;
      if (!wall || !attack) break;
      if (wall.d <= 0.06) {
        world.damageWall(wall.item.id, attack * remaining);
        remaining = 0;
        break;
      }
      const middle = [(wall.item.a[0] + wall.item.b[0]) / 2, (wall.item.a[1] + wall.item.b[1]) / 2];
      next = middle;
    } else unit.attackId = null;
    const delta = dist(unit.p, next);
    if (delta < 0.000001) break;
    const direction = [(next[0] - unit.p[0]) / delta, (next[1] - unit.p[1]) / delta];
    const contact = tapes.filter(
      (tape) => distanceToSegment(unit.p, tape.a, tape.b) <= tape.width / 2,
    );
    const nearby = tapes.filter(
      (tape) => distanceToSegment(unit.p, tape.a, tape.b) <= tape.width / 2 + 0.05,
    );
    unit.stickyInside = unit.stickyInside.filter((id) => nearby.some((tape) => tape.id === id));
    const effect = stickyTraversal(size);
    let multiplier = contact.length ? effect.speedMultiplier : 1;
    const step = Math.min(delta, speed * remaining * multiplier);
    const destination = [unit.p[0] + direction[0] * step, unit.p[1] + direction[1] * step];
    const swept = tapes.filter((tape) => crossedSticky(unit.p, destination, tape));
    if (swept.length && size === 'small') {
      const newTape = swept.find((tape) => !unit.stickyInside.includes(tape.id));
      if (newTape) {
        unit.stickyInside.push(newTape.id);
        unit.stuckUntil = time + effect.stopSeconds + (newTape.blueprints?.length || 0);
        continue;
      }
    }
    if (swept.length) multiplier = Math.min(multiplier, effect.speedMultiplier);
    const travelled = Math.min(delta, speed * remaining * multiplier);
    unit.p = [unit.p[0] + direction[0] * travelled, unit.p[1] + direction[1] * travelled];
    unit.dir = direction;
    remaining -= travelled / (speed * multiplier);
    if (travelled < delta - 0.000001) break;
  }
  return unit;
}
