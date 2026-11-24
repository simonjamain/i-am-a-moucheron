// The solid queries a heavy-weapon world gives src/heavy-sim.js (world.solidSegment,
// world.solidNearest), answered by Rapier over the given boxes (src/solid-query.ts), like the
// browser does. Synchronised when the view is made: take a new one after the boxes change.
import { loadRapier } from '../src/physics-world.ts';
import { SolidQuery } from '../src/solid-query.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const queries = new WeakMap();
export function solidQuery(boxes = [], decor = null) {
  let query = queries.get(boxes);
  if (!query) queries.set(boxes, (query = new SolidQuery(RAPIER)));
  query.sync(boxes, decor);
  return query;
}
export function solidView(boxes = [], decor = null) {
  const query = solidQuery(boxes, decor);
  return {
    solidSegment: (a, b) => query.segment(a, b),
    solidNearest: (p, radius) => query.nearest(p, radius),
  };
}
