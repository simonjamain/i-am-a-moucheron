// A walking world for the tests that call stepWalker (src/sortie.ts): Rapier's character
// controller over the given solids (and the decor's triangles when there is one). One world
// per list of solids, re-synchronised on every call (cheap when nothing moved).
import { loadRapier } from '../src/physics-world.ts';
import { WalkerWorld } from '../src/walker-world.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const worlds = new WeakMap(),
  bare = new WalkerWorld(RAPIER); // the floor alone: every test that passes no solids shares it
export function walkerWorld(colliders = [], decor = undefined) {
  if (!colliders.length && !decor) return bare;
  let world = worlds.get(colliders);
  if (!world) worlds.set(colliders, (world = new WalkerWorld(RAPIER)));
  world.sync(colliders, decor ?? undefined);
  return world;
}
