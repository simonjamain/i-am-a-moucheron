// Calibration only: the previous routes determine the effective speed to preserve.
// These paths are never followed; current obstacle-free geometry lives in routes.js.
import { MAP, REFERENCE } from './scale.js';
import { PORTALS } from './routes.js';
const baselineCache = new Map();
function baselineRoute(enemy) {
  const key = [
    enemy.routeSeed || 1,
    enemy.branch || 0,
    !!enemy.ground,
    enemy.approach || 'full',
  ].join(':');
  if (baselineCache.has(key)) return baselineCache.get(key);
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
  const route = { length: samples.at(-1).distance };
  if (baselineCache.size > 256) baselineCache.delete(baselineCache.keys().next().value);
  baselineCache.set(key, route);
  return route;
}
export function baselineTravelSpeed(enemy, wave) {
  const length = baselineRoute(enemy).length;
  const nominal = Math.max(
    enemy.approach === 'intro' ? 30 : enemy.approach === 'short' ? 45 : enemy.ground ? 60 : 80,
    length / MAP.metres(REFERENCE.enemy * enemy.speed),
  );
  const duration = Math.min(nominal, Math.min(145, 45 + 8 * Math.max(0, wave - 1)));
  return length / Math.max(0.001, duration - (enemy.entryHold || 0));
}
