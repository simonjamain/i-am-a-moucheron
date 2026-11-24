// Insect hit volumes for the tests (src/insect-hitboxes.ts): one shared Rapier world, brought
// in line with the given insects before each query, like the client does once a frame.
import * as T from '../vendor/three.webgpu.min.js';
import { loadRapier } from '../src/physics-world.ts';
import { InsectHitboxes } from '../src/insect-hitboxes.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
export const hitboxes = new InsectHitboxes(T, RAPIER);
/** Same call as the old per-model test: the nearest insect on a ray, or null. */
export function nearestInsectHit(
  _T,
  origin,
  direction,
  insects,
  maxDistance = 60,
  excluded = null,
) {
  hitboxes.sync(insects, excluded);
  return hitboxes.nearest(origin, direction, maxDistance, excluded);
}
/** Whether a point (padded) touches an insect's volume. */
export function insectContact(_T, point, model, padding = 0.3) {
  hitboxes.sync(new Map([[0, model]]));
  return hitboxes.contact(point, padding) !== null;
}
/** What the client's `insectBoxes()` gives for a map of insects. */
export const insectBoxesFor = (insects) => ({
  sync: () => {},
  nearest: (origin, direction, maxDistance, excluded) =>
    nearestInsectHit(T, origin, direction, insects, maxDistance, excluded),
});
