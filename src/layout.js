import { MAP, ACTOR_UNIT, REFERENCE } from './scale.js';
export const ROOM_SCALE = 1; // Compatibility alias; room geometry is already in metres.
export const OFFICE_LAYOUT = {
  base: {
    originX: -1.8,
    originZ: 2.13,
    deckY: 0.90005,
    parkedY: 0.90005 + 1.05 * ACTOR_UNIT,
    departureY: 0.90005 + 3 * ACTOR_UNIT,
    yaw: Math.PI,
    speed: MAP.metres(25),
  },
  bounds: { x: 4.15, z: 3.55, ceiling: 2.95 },
  bin: { x: 2.5, y: 0.3, z: -2.7 },
  desks: [
    { x: -1.8, z: 1.6, w: 2.2, d: 1.2, y: 0.9 },
    { x: 1.7, z: -1.4, w: 2.2, d: 1, y: 0.9 },
  ],
};

// A broad tour of the room: climb, ceiling circuits, a brief dip, then bin.
// Sample a smooth Catmull-Rom curve into an arc-length table shared with the
// Worker. Progress therefore means travelled metres, never waypoint duration.
export const RAID_POINTS = [
  [-2.02, 1.03005, 2.28],
  [-2.4, 1.7, 2.5],
  [-2.9, 2.65, 1.5],
  [-2.7, 2.7, -1.8],
  [-0.6, 2.65, -2.65],
  [2.4, 2.6, -1.8],
  [2.8, 2.45, 1.5],
  [0.9, 1.75, 2.25],
  [-0.7, 2.35, 0.8],
  [0.4, 2.7, -1.1],
  [2.1, 2.35, -2.35],
  [2.7, 1.25, -2.6],
  [2.5, 0.33, -2.7],
];
const raidSamples = [{ p: RAID_POINTS[0], distance: 0 }];
for (let i = 0; i < RAID_POINTS.length - 1; i++) {
  const a = RAID_POINTS[Math.max(0, i - 1)],
    b = RAID_POINTS[i],
    c = RAID_POINTS[i + 1],
    d = RAID_POINTS[Math.min(RAID_POINTS.length - 1, i + 2)];
  for (let n = 1; n <= 64; n++) {
    const t = n / 64,
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
    const prev = raidSamples[raidSamples.length - 1];
    raidSamples.push({
      p,
      distance: prev.distance + Math.hypot(...p.map((v, j) => v - prev.p[j])),
    });
  }
}
export const RAID_LENGTH = raidSamples[raidSamples.length - 1].distance;
export const RAID_DURATION = RAID_LENGTH / MAP.metres(REFERENCE.enemy);
export function raidPosition(u) {
  const distance = Math.max(0, Math.min(1, u)) * RAID_LENGTH;
  let lo = 1,
    hi = raidSamples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (raidSamples[mid].distance < distance) lo = mid + 1;
    else hi = mid;
  }
  const a = raidSamples[lo - 1],
    b = raidSamples[lo],
    t = (distance - a.distance) / (b.distance - a.distance);
  return a.p.map((v, j) => v + (b.p[j] - v) * t);
}
