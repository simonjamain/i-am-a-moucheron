import { HEAVY } from './armament.js';
import { integrateOrdnance } from './ordnance.js';
export function ballisticMarks(weapon, direction = [0, 0, -1], carrier = [0, 0, 0]) {
  const profile = HEAVY[weapon];
  if (!profile || weapon === 'bomb') return [];
  const n = Math.hypot(...direction),
    d = direction.map((v) => v / n);
  const projectile = { p: [0, 0, 0], v: d.map((v, i) => v * profile.speed + carrier[i]), age: 0 };
  const ranges = [0.15, 0.3, 0.6, 1.2, 2.4];
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
