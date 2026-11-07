import { HEAVY } from './armament.js';
import { integrateOrdnance } from './ordnance.js';
import { MAP } from './scale.js';
// Graduations in displayed reference metres, out to the far end of the office
// (about 9 office metres). Each one is sampled on the authoritative trajectory.
export const TANK_MARKS = Object.freeze([
  50, 100, 200, 400, 600, 800, 1000, 1200, 1500, 1800, 2100, 2400, 2700, 3000,
]);
export function ballisticMarks(weapon, direction = [0, 0, -1], carrier = [0, 0, 0]) {
  const profile = HEAVY[weapon];
  if (!profile || weapon === 'bomb') return [];
  const n = Math.hypot(...direction),
    d = direction.map((v) => v / n);
  const projectile = { p: [0, 0, 0], v: d.map((v, i) => v * profile.speed + carrier[i]), age: 0 };
  const ranges = TANK_MARKS.map((reference) => MAP.metres(reference));
  const marks = [];
  let last = [...projectile.p];
  while (projectile.age < profile.lifetime && marks.length < ranges.length) {
    integrateOrdnance(projectile, 1 / 120);
    const along = (p) => p.reduce((s, v, i) => s + v * d[i], 0);
    const a = along(last),
      b = along(projectile.p),
      range = ranges[marks.length];
    if (b >= range) {
      const t = Math.max(0, Math.min(1, (range - a) / (b - a)));
      marks.push({ metres: range, point: last.map((v, i) => v + (projectile.p[i] - v) * t) });
    }
    last = [...projectile.p];
  }
  return marks;
}
