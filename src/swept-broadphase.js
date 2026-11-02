// Conservative broad phase for a segment against a sphere. No false negatives:
// an intersecting sphere must overlap the segment's axis-aligned bounding box,
// expanded by its radius. Leave exact collision and hit ordering to the caller.
export function sweptSphereMayTouch(start, end, center, radius) {
  for (let axis = 0; axis < 3; axis++) {
    if (
      center[axis] + radius < Math.min(start[axis], end[axis]) ||
      center[axis] - radius > Math.max(start[axis], end[axis])
    )
      return false;
  }
  return true;
}
