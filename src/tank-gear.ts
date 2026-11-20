import { MODEL_DATA } from './meshy-tank-data.js';

// The medium tank's running gear in the model, read from the rig parts made by
// scripts/split-vehicle-parts.mjs: six axles from the front, each with its left (-x) and right
// (+x) wheel. Shared by the physics (one ray and spring per axle and side) and the renderer
// (wheels that ride their springs, belts that follow them). Model units, forward is -z.
export const AXLE_PARTS: readonly (readonly [string, string])[] = [
  ['idler0', 'idler1'],
  ['roadWheel0', 'roadWheel1'],
  ['roadWheel2', 'roadWheel3'],
  ['roadWheel4', 'roadWheel5'],
  ['roadWheel6', 'roadWheel7'],
  ['sprocket0', 'sprocket1'],
];

export const partPivot = (name: string): [number, number, number] => {
  const part = MODEL_DATA.parts.find((p: { part: string }) => p.part === name);
  if (!part) throw Error('Missing tank part ' + name);
  return part.pivot as [number, number, number];
};

/** Pivots of the left and right wheel of each axle. */
export const AXLES = AXLE_PARTS.map(([left, right]) => [partPivot(left), partPivot(right)]);
/** z of each axle, front to back (the mean of its two wheels). */
export const AXLE_Z = AXLES.map(([left, right]) => (left[2] + right[2]) / 2);
/** Height of the lowest point of the belts: the ground, with the hull at its rest height. */
export const GROUND_Y = -0.8;
/** Distance of each track's wheels from the centre line. */
export const TRACK_HALF =
  AXLES.flat().reduce((sum, p) => sum + Math.abs(p[0]), 0) / (AXLES.length * 2);
