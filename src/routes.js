import { MAP, REFERENCE } from './scale.js';
import { floorPath, blockedSegment } from './route-navigation.js';
export const MIN_SPAWN_DISTANCE = 3;
export const PORTALS = Object.freeze({
  air: [
    [-4.11, 2.35, -1.8],
    [0.2, 2.6, -3.51],
    [4.11, 1.6, 0.8],
    [-2.4, 2.2, -3.51],
  ],
  ground: [
    [-4.11, 0.0007, 2.65],
    [-1.0, 0.0007, -3.51],
    [4.11, 0.0007, 1.0],
  ],
});
const routeCache = new Map();
export function enemyRoute(enemy) {
  const key = [
    enemy.routeSeed || 1,
    enemy.branch || 0,
    !!enemy.ground,
    enemy.approach || 'full',
  ].join(':');
  if (routeCache.has(key)) return routeCache.get(key);
  let seed = enemy.routeSeed || 1;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const portal =
    enemy.approach === 'intro'
      ? enemy.ground
        ? 0
        : 1
      : Math.floor(random() * (enemy.ground ? 3 : 4));
  let points;
  if (enemy.ground) {
    const checkpoints =
      portal === 0
        ? [
            [-3.3, 0.0007, 2.7],
            [-3.1, 0.0007, 0.1],
            [0, 0.0007, 0.35],
          ]
        : portal === 1
          ? [
              [0.2, 0.0007, -2.9],
              [0.1, 0.0007, 0.3],
              [1.4, 0.0007, 0.3],
            ]
          : [
              [3.6, 0.0007, 1.8],
              [3.25, 0.0007, 0.4],
              [1.4, 0.0007, 0.25],
            ];
    const goals = [...checkpoints, [3.0, 0.0007, -2.7]];
    points = [PORTALS.ground[portal]];
    for (const goal of goals) points.push(...floorPath(points.at(-1), goal).slice(1));
    points.push([3.0, 0.38, -2.7], [2.5, 0.38, -2.7]);
  } else {
    const source = PORTALS.air[portal],
      jitter = (random() - 0.5) * 0.15;
    const intro = [
      [0.15 + jitter, 2.65, -3.0],
      [1.2, 2.4, -2.85],
      [2.55, 1.45, -2.8],
    ];
    const short = [
      [source[0] * 0.7, 2.7, source[2] * 0.7],
      [-0.5, 2.6, 0.2],
      [1.6, 2.5, -1.8],
      [2.8, 1.5, -2.6],
    ];
    const full = [
      [source[0] * 0.7, 2.7, source[2] * 0.7],
      [-2.9, 2.65, 2.6],
      [-2.9, 2.7, -2.8],
      [2.8, 2.65, -2.6],
      [2.8, 2.5, 2.5],
      [0, 2.2, 1.9],
      [2.8, 1.5, -2.6],
    ];
    points = [
      source,
      ...(enemy.approach === 'intro' ? intro : enemy.approach === 'short' ? short : full),
      [2.5, 0.38, -2.7],
    ];
    // Raise detours above static furniture; final descent is next to the bin.
    for (let i = 1; i < points.length; i++)
      if (blockedSegment(points[i - 1], points[i])) {
        points.splice(
          i,
          0,
          [points[i - 1][0], 2.82, points[i - 1][2]],
          [points[i][0], 2.82, points[i][2]],
        );
        i += 2;
      }
  }
  const samples = [{ p: points[0], distance: 0 }];
  for (let i = 0; i < points.length - 1; i++) {
    const b = points[i],
      c = points[i + 1];
    for (let n = 1; n <= 48; n++) {
      const t = n / 48;
      const p = b.map((v, j) => v + (c[j] - v) * t);
      const prev = samples.at(-1);
      samples.push({ p, distance: prev.distance + Math.hypot(...p.map((v, j) => v - prev.p[j])) });
    }
  }
  const route = { samples, length: samples.at(-1).distance, portal, points };
  if (routeCache.size > 256) routeCache.delete(routeCache.keys().next().value);
  routeCache.set(key, route);
  return route;
}
export function enemyRoutePosition(enemy, u) {
  const route = enemyRoute(enemy),
    distance = Math.max(0, Math.min(1, u)) * route.length;
  let lo = 1,
    hi = route.samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.samples[mid].distance < distance) lo = mid + 1;
    else hi = mid;
  }
  const a = route.samples[lo - 1],
    b = route.samples[lo],
    t = (distance - a.distance) / Math.max(1e-12, b.distance - a.distance);
  return a.p.map((v, j) => v + (b.p[j] - v) * t);
}
export function routeDuration(enemy) {
  return (
    enemyRoute(enemy).length / (enemy.travelSpeed || MAP.metres(REFERENCE.enemy * enemy.speed))
  );
}
