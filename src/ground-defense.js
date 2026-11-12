import { WALL_SEGMENT, HALF_BRICK, wallLength } from './brick-rules.js';
import { ROUTE_OBSTACLES } from './route-obstacles.js';
// Deterministic, room-shared ground navigation primitives (office metres).
// These are independent of the airborne route system. Keep this module free of
// heavy imports: routes.js (and the historical Worker bundle) inline it.
export const GROUND_BOUNDS = Object.freeze([-4.12, -3.51, 4.12, 3.51]);
export const GROUND_GOAL = Object.freeze([3, -2.7]);
export const GROUND_CELL = 0.05;
// Furniture footprints that block insects on the floor (desk legs, boxes…).
export const GROUND_STATIC_OBSTACLES = ROUTE_OBSTACLES.filter(
  (box) =>
    box.min.y < 0.01 && box.max.y > 0.01 && box.max.x - box.min.x < 2 && box.max.z - box.min.z < 2,
);
export const MAX_BARRICADE_SEGMENT = WALL_SEGMENT;
export const STICKY_WIDTH = 0.03;

export function splitBarricade(a, b, id) {
  if (![...a, ...b].every(Number.isFinite)) throw Error('Invalid barricade endpoints');
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (distance <= 0) throw Error('Empty barricade');
  const span = wallLength(distance);
  const count = Math.ceil((span - 1e-9) / MAX_BARRICADE_SEGMENT);
  return Array.from({ length: count }, (_, i) => {
    const from = i * MAX_BARRICADE_SEGMENT;
    const to = Math.min(span, from + MAX_BARRICADE_SEGMENT);
    return {
      id: id + ':' + i,
      a: a.map((v, k) => v + ((b[k] - v) * from) / distance),
      b: a.map((v, k) => v + ((b[k] - v) * to) / distance),
    };
  });
}
export function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSquared))
    : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}
const NEIGHBOURS = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
// Rebuild only when geometry changes; every insect reads the same flow field.
export function buildGroundFlow({ bounds, cellSize, goal, barricades = [], staticObstacles = [] }) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw Error('Invalid cell size');
  const [minX, minZ, maxX, maxZ] = bounds;
  if (![...bounds, ...goal].every(Number.isFinite) || minX >= maxX || minZ >= maxZ)
    throw Error('Invalid ground bounds');
  const width = Math.ceil((maxX - minX) / cellSize);
  const height = Math.ceil((maxZ - minZ) / cellSize);
  if (width * height > 100000) throw Error('Ground grid budget exceeded');
  const index = (x, z) => z * width + x;
  const inside = (x, z) => x >= 0 && z >= 0 && x < width && z < height;
  const cell = (p) => [Math.floor((p[0] - minX) / cellSize), Math.floor((p[1] - minZ) / cellSize)];
  const center = (x, z) => [minX + (x + 0.5) * cellSize, minZ + (z + 0.5) * cellSize];
  const blocked = new Uint8Array(width * height);
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++) {
      const p = center(x, z);
      if (
        barricades.some(
          (wall) => distanceToSegment(p, wall.a, wall.b) <= (wall.thickness ?? cellSize) / 2,
        ) ||
        staticObstacles.some(
          (box) =>
            p[0] >= box.min.x - 0.02 &&
            p[0] <= box.max.x + 0.02 &&
            p[1] >= box.min.z - 0.02 &&
            p[1] <= box.max.z + 0.02,
        )
      )
        blocked[index(x, z)] = 1;
    }
  const [gx, gz] = cell(goal);
  if (!inside(gx, gz)) throw Error('Ground goal is outside the grid');
  const costs = new Float64Array(width * height).fill(Infinity);
  const next = new Int32Array(width * height).fill(-1);
  const heap = [];
  const push = (node, cost) => {
    heap.push([cost, node]);
    for (let i = heap.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const first = heap[0],
      tail = heap.pop();
    if (heap.length) {
      heap[0] = tail;
      for (let i = 0; ;) {
        const l = i * 2 + 1,
          r = l + 1;
        let smallest = i;
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
        if (smallest === i) break;
        [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
        i = smallest;
      }
    }
    return first;
  };
  const target = index(gx, gz);
  // A player may close the goal completely. Keep a valid unreachable field
  // so destructive species can open a breach rather than crashing the room.
  if (!blocked[target]) {
    costs[target] = 0;
    push(target, 0);
  }
  while (heap.length) {
    const [cost, current] = pop();
    if (cost !== costs[current]) continue;
    const x = current % width,
      z = Math.floor(current / width);
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = x + dx,
        nz = z + dz;
      if (!inside(nx, nz) || blocked[index(nx, nz)]) continue;
      if (dx && dz && (blocked[index(x + dx, z)] || blocked[index(x, z + dz)])) continue;
      const neighbour = index(nx, nz);
      const candidate = cost + (dx && dz ? Math.SQRT2 : 1) * cellSize;
      if (candidate + 1e-12 >= costs[neighbour]) continue;
      costs[neighbour] = candidate;
      next[neighbour] = current;
      push(neighbour, candidate);
    }
  }
  function route(from) {
    const [x, z] = cell(from);
    if (!inside(x, z)) return null;
    let n = index(x, z);
    if (!Number.isFinite(costs[n])) return null;
    const points = [from];
    for (let steps = 0; n !== target && steps < costs.length; steps++) {
      n = next[n];
      if (n < 0) return null;
      points.push(center(n % width, Math.floor(n / width)));
    }
    if (n !== target) return null;
    points.push(goal);
    return points;
  }
  // Any-angle smoothing over the flow field: from a position, keep the furthest
  // successor on the downhill chain that is still in straight, unobstructed view.
  // The preview and the server both chain these waypoints, so the drawn path is
  // exactly the one walked while the map does not change.
  const sample = cellSize / 4;
  function clear(a, b) {
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(distance / sample));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Conservative corridor: the 2×2 cells nearest to the sample must be free,
      // keeping roughly half a cell of extra margin from furniture and walls.
      const fx = (a[0] + (b[0] - a[0]) * t - minX) / cellSize - 0.5,
        fz = (a[1] + (b[1] - a[1]) * t - minZ) / cellSize - 0.5;
      for (const x of [Math.floor(fx), Math.ceil(fx)])
        for (const z of [Math.floor(fz), Math.ceil(fz)])
          if (!inside(x, z) || blocked[index(x, z)]) return false;
    }
    return true;
  }
  function waypoint(from) {
    const [x, z] = cell(from);
    if (!inside(x, z)) return null;
    let n = index(x, z);
    if (!Number.isFinite(costs[n])) return null;
    if (n === target) return goal;
    let best = null;
    for (let steps = 0; steps < 512; steps++) {
      n = next[n];
      if (n < 0) return best;
      const point = n === target ? goal : center(n % width, Math.floor(n / width));
      if (best && !clear(from, point)) return best;
      best = point;
      if (n === target) return goal;
    }
    return best;
  }
  function smoothRoute(from) {
    if (!route(from)) return null;
    const points = [from];
    for (let p = from, guard = 0; p !== goal && guard < costs.length; guard++) {
      p = waypoint(p);
      if (!p) return null;
      points.push(p);
    }
    return points;
  }
  function nextStep(from) {
    const [x, z] = cell(from);
    if (!inside(x, z)) return null;
    const here = index(x, z);
    if (!Number.isFinite(costs[here])) return null;
    const nextCell = next[here];
    return nextCell === -1 ? goal : center(nextCell % width, Math.floor(nextCell / width));
  }
  return {
    width,
    height,
    blocked,
    costs,
    route,
    smoothRoute,
    waypoint,
    nextStep,
    reachable: (p) => route(p) !== null,
  };
}
// Attraction is deterministic; an insect cannot switch targets mid-meal.
export function chooseBait(position, baits, tasted = []) {
  const excluded = new Set(tasted);
  return (
    baits
      .filter(
        (bait) =>
          !excluded.has(bait.type) &&
          Math.hypot(position[0] - bait.position[0], position[1] - bait.position[1]) <= bait.radius,
      )
      .map((bait) => ({
        bait,
        distance: Math.hypot(position[0] - bait.position[0], position[1] - bait.position[1]),
      }))
      .sort(
        (a, b) =>
          a.distance - b.distance || String(a.bait.id).localeCompare(String(b.bait.id), 'en'),
      )[0]?.bait ?? null
  );
}
export function finishMeal(tasted, type) {
  return [...new Set([...tasted, type])];
}
export function stickyTraversal(gabarit) {
  // Gameplay tuning values belong in the future species balance table.
  if (gabarit === 'small') return { stopSeconds: 3, speedMultiplier: 1 };
  if (gabarit === 'medium') return { stopSeconds: 0, speedMultiplier: 0.3 };
  if (gabarit === 'large') return { stopSeconds: 0, speedMultiplier: 0.9 };
  throw Error('Unknown ground insect size');
}

let emptyFlow = null;
// Flow field of an undefended desk, shared by nominal routes and their timing.
export function staticGroundFlow() {
  return (emptyFlow ||= buildGroundFlow({
    bounds: GROUND_BOUNDS,
    cellSize: GROUND_CELL,
    goal: GROUND_GOAL,
    staticObstacles: GROUND_STATIC_OBSTACLES,
  }));
}
