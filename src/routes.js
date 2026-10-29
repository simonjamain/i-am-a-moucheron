import { MAP, REFERENCE } from './scale.js';
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
    const starts = [
      [
        [-3.4, 0.0007, 2.65],
        [-3.25, 0.0007, 0.1],
        [-0.8, 0.0007, 0.25],
      ],
      [
        [0.4, 0.0007, -2.8],
        [0.3, 0.0007, -1.55],
        [0.15, 0.0007, 0.1],
      ],
      [
        [3.55, 0.0007, 1.0],
        [3.3, 0.0007, 0.45],
        [1.5, 0.0007, 0.2],
      ],
    ];
    points = [
      PORTALS.ground[portal],
      ...starts[portal],
      [1.4, 0.0007, -0.1],
      [3.15, 0.0007, -0.55],
      [3.12, 0.0007, -2.4],
      [2.5, 0.0007, -2.49],
      [2.5, 0.32, -2.7],
    ];
    points = points.map((p, i) =>
      i === 0 || i > points.length - 3
        ? p
        : p.map((v, j) => (j === 1 ? v : v + (random() - 0.5) * 0.08)),
    );
  } else {
    const source = PORTALS.air[portal];
    const wander = Array.from({ length: 4 }, (_, i) => [
      (random() - 0.5) * 6.1,
      random() < 0.7 ? 2.35 + random() * 0.35 : 1.5 + random() * 0.5,
      (random() - 0.5) * 5.2,
    ]);
    points = [
      source,
      [source[0] * 0.75, 2.55, source[2] * 0.75],
      ...wander,
      [2.9, 1.5, -1.9],
      [2.5, 0.33, -2.7],
    ];
    if (enemy.branch)
      for (let i = 3; i < points.length - 2; i++) {
        points[i][0] = Math.max(-3.3, Math.min(3.3, points[i][0] + 0.65));
        points[i][1] = Math.max(1.4, points[i][1] - 0.45);
      }
  }
  if (!enemy.ground && enemy.approach === 'intro')
    points = [PORTALS.air[portal], [1.15, 2.05, -3.1], [2.15, 1.25, -2.9], [2.5, 0.33, -2.7]];
  else if (!enemy.ground && enemy.approach === 'short')
    points = [
      PORTALS.air[portal],
      points[1],
      [1.3, 1.8, -1.5],
      [2.9, 1.1, -1.9],
      [2.5, 0.33, -2.7],
    ];
  const samples = [{ p: points[0], distance: 0 }];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[i],
      c = points[i + 1],
      d = points[Math.min(points.length - 1, i + 2)];
    for (let n = 1; n <= 48; n++) {
      const t = n / 48,
        t2 = t * t,
        t3 = t2 * t;
      const p = b.map(
        (v, j) =>
          0.5 *
          (2 * v +
            (-a[j] + c[j]) * t +
            (2 * a[j] - 5 * v + 4 * c[j] - d[j]) * t2 +
            (-a[j] + 3 * v - 3 * c[j] + d[j]) * t3),
      );
      p[0] = Math.max(-4.12, Math.min(4.12, p[0]));
      p[1] = Math.max(0.0007, Math.min(2.8, p[1]));
      p[2] = Math.max(-3.52, Math.min(3.4, p[2]));
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
  return Math.max(
    enemy.approach === 'intro' ? 30 : enemy.approach === 'short' ? 45 : enemy.ground ? 60 : 80,
    enemyRoute(enemy).length / MAP.metres(REFERENCE.enemy * enemy.speed),
  );
}
