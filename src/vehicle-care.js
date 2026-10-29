import { MAP } from './scale.js';
import { segmentSphere, segmentBox } from './ordnance.js';
export const WASH = Object.freeze({
  range: 2,
  seconds: 10,
  dirtPerImpact: 0.18,
  warning: 0.55,
  maxOpacity: 0.42,
});
export function collisionDamage(enemyHP, dealt = 0) {
  return Math.max(0, enemyHP - dealt) * 0.05;
}
// First obstruction wins, including other hulls. All distances are world metres.
export function washTarget(origin, direction, vehicles, solids) {
  const n = Math.hypot(...direction);
  if (!Number.isFinite(n) || n < 0.5 || n > 2) return null;
  const end = origin.map((v, i) => v + (direction[i] / n) * WASH.range);
  let nearest = 1,
    target = null;
  for (const box of solids) {
    const t = segmentBox(origin, end, box);
    if (t !== null && t < nearest) nearest = t;
  }
  for (const v of vehicles) {
    if (v.state.hp <= 0) continue;
    const t = segmentSphere(origin, end, v.state.p, MAP.metres(v.type === 'bomber' ? 3 : 1.8));
    if (t !== null && t < nearest) {
      nearest = t;
      target = v;
    }
  }
  return target;
}
