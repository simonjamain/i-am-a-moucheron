import { activeLayout, layoutSolids } from './layouts.ts';
import type { Collider } from './oriented-collider.ts';
import type { Vec3, Vec3Like } from './types.ts';

interface Navigation {
  boxes: Collider[];
  groundBoxes: Collider[];
}
const clearance = 0.018,
  groundClearance = 0.025;
// Obstacle boxes of each layout, built once.
const navCache = new Map<string, Navigation>();
function navigation(): Navigation {
  const layout = activeLayout();
  let nav = navCache.get(layout.id);
  if (!nav) {
    const boxes = layoutSolids(layout).filter((b) => {
      const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
      return !(Math.min(...size) < 0.025 && (Math.abs(b.min.x) > 4.09 || b.min.z < -3.49));
    });
    nav = { boxes, groundBoxes: boxes.filter((b) => b.min.y <= 0.0007 && b.max.y > 0.0001) };
    navCache.set(layout.id, nav);
  }
  return nav;
}
const floorCache = new Map<string, Vec3Like[]>();
export function blockedSegment(a: Vec3Like, b: Vec3Like, ground: boolean = false): boolean {
  const nav = navigation();
  return (ground ? nav.groundBoxes : nav.boxes).some((box) => {
    if (box.max.y < 0.0001 || (ground && box.min.y > 0.01)) return false;
    let lo = 0,
      hi = 1;
    for (let k = 0; k < 3; k++) {
      const key = (['x', 'y', 'z'] as const)[k],
        pad = k === 1 ? 0 : ground ? groundClearance : clearance;
      const min = box.min[key] - pad,
        max = box.max[key] + pad,
        d = b[k] - a[k];
      if (Math.abs(d) < 1e-12) {
        if (a[k] < min || a[k] > max) return false;
      } else {
        let x = (min - a[k]) / d,
          y = (max - a[k]) / d;
        if (x > y) [x, y] = [y, x];
        lo = Math.max(lo, x);
        hi = Math.min(hi, y);
        if (lo > hi) return false;
      }
    }
    return hi >= 0 && lo <= 1;
  });
}
// Small deterministic A* floor grid. Corridors are simplified only with a clear
// line of sight, so smoothing cannot cut through a table leg or bookcase.
export function floorPath(start: Vec3Like, end: Vec3Like): Vec3Like[] {
  const key = activeLayout().id + JSON.stringify([start, end]);
  if (floorCache.has(key)) return floorCache.get(key)!;
  const step = 0.16,
    minX = -4.0,
    minZ = -3.4,
    nx = 51,
    nz = 43,
    y = 0.0007;
  const pos = (id: number): Vec3 => [minX + (id % nx) * step, y, minZ + Math.floor(id / nx) * step];
  const cell = (p: Vec3Like): number =>
    Math.max(0, Math.min(nz - 1, Math.round((p[2] - minZ) / step))) * nx +
    Math.max(0, Math.min(nx - 1, Math.round((p[0] - minX) / step)));
  const free = (id: number): boolean => !blockedSegment(pos(id), pos(id), true);
  const nearest = (p: Vec3Like): number =>
    Array.from({ length: nx * nz }, (_, i) => i)
      .filter(free)
      .sort(
        (a, b) =>
          Math.hypot(pos(a)[0] - p[0], pos(a)[2] - p[2]) -
          Math.hypot(pos(b)[0] - p[0], pos(b)[2] - p[2]),
      )[0];
  let a = cell(start),
    goal = cell(end);
  if (!free(a)) a = nearest(start);
  if (!free(goal)) goal = nearest(end);
  const open = new Set([a]),
    cost = new Map([[a, 0]]),
    parent = new Map<number, number>();
  const h = (id: number): number =>
    Math.abs((id % nx) - (goal % nx)) + Math.abs(Math.floor(id / nx) - Math.floor(goal / nx));
  while (open.size) {
    let current: number | null = null,
      best = Infinity;
    for (const id of open) {
      const score = cost.get(id)! + h(id);
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (current === goal) {
      const path: Vec3Like[] = [];
      for (let id: number | undefined = current; id !== undefined; id = parent.get(id))
        path.push(pos(id));
      path.reverse();
      if (!blockedSegment(start, path[0], true)) path.unshift(start);
      if (!blockedSegment(path.at(-1)!, end, true)) path.push(end);
      const simple = [path[0]];
      let i = 0;
      while (i < path.length - 1) {
        let next = i + 1;
        while (next + 1 < path.length && !blockedSegment(path[i], path[next + 1], true)) next++;
        simple.push(path[next]);
        i = next;
      }
      floorCache.set(key, simple);
      return simple;
    }
    open.delete(current!);
    for (const delta of [-1, 1, -nx, nx]) {
      const id = current! + delta;
      if (
        id < 0 ||
        id >= nx * nz ||
        Math.abs((id % nx) - (current! % nx)) +
          Math.abs(Math.floor(id / nx) - Math.floor(current! / nx)) !==
          1
      )
        continue;
      if (!free(id) || blockedSegment(pos(current!), pos(id), true)) continue;
      const next = cost.get(current!)! + 1;
      if (next >= (cost.get(id) ?? Infinity)) continue;
      cost.set(id, next);
      parent.set(id, current!);
      open.add(id);
    }
  }
  throw Error('No floor route between portals and bin');
}
