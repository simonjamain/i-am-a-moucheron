export function segmentBox(a, b, box) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 3; i++) {
    const k = ['x', 'y', 'z'][i],
      d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] < box.min[k] || a[i] > box.max[k]) return null;
    } else {
      let x = (box.min[k] - a[i]) / d,
        y = (box.max[k] - a[i]) / d;
      if (x > y) [x, y] = [y, x];
      lo = Math.max(lo, x);
      hi = Math.min(hi, y);
      if (lo > hi) return null;
    }
  }
  return lo;
}
// Exact swept sphere against an axis-aligned box: piecewise quadratic distance
// to the box, split at its faces. Unlike expanded AABBs this keeps round corners.
export function sweptBoxProximity(a, b, box, radius, closest = false) {
  const keys = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const key = keys[i];
    if (
      Math.max(a[i], b[i]) + radius < box.min[key] ||
      Math.min(a[i], b[i]) - radius > box.max[key]
    )
      return null;
  }
  const cuts = [0, 1],
    d = b.map((v, i) => v - a[i]);
  for (let i = 0; i < 3; i++)
    if (Math.abs(d[i]) > 1e-14)
      for (const face of [box.min[keys[i]], box.max[keys[i]]]) {
        const t = (face - a[i]) / d[i];
        if (t > 0 && t < 1) cuts.push(t);
      }
  cuts.sort((x, y) => x - y);
  for (let k = 0; k < cuts.length - 1; k++) {
    const lo = cuts[k],
      hi = cuts[k + 1],
      mid = (lo + hi) / 2;
    let A = 0,
      B = 0,
      C = -radius * radius;
    for (let i = 0; i < 3; i++) {
      const x = a[i] + d[i] * mid,
        key = keys[i];
      const face = x < box.min[key] ? box.min[key] : x > box.max[key] ? box.max[key] : null;
      if (face === null) continue;
      const m = a[i] - face;
      A += d[i] * d[i];
      B += 2 * m * d[i];
      C += m * m;
    }
    const f = (t) => (A * t + B) * t + C;
    if (closest) {
      // Distance to a convex box is piecewise quadratic. A zero-distance
      // contact is already optimal; otherwise wait until the minimum is passed.
      if (A <= 1e-20) {
        if (C <= -radius * radius + 1e-20) return lo;
        continue;
      }
      const t = Math.max(lo, -B / (2 * A));
      if (t < hi && f(t) <= 1e-14) return t;
      continue;
    }
    if (f(lo) <= 1e-14) return lo;
    if (A > 1e-20) {
      const discriminant = B * B - 4 * A * C;
      if (discriminant >= 0) {
        const t = (-B - Math.sqrt(discriminant)) / (2 * A);
        if (t >= lo - 1e-12 && t <= hi + 1e-12) return Math.max(lo, t);
      }
    }
  }
  return closest ? null : segmentBox(a, b, box);
}
// Swept entry time (not closest approach) avoids tunnelling and orders triggers.
export function sweptSphereProximity(a, b, centre, radius) {
  const d = b.map((v, i) => v - a[i]),
    m = a.map((v, i) => v - centre[i]);
  const A = d.reduce((n, v) => n + v * v, 0),
    B = 2 * d.reduce((n, v, i) => n + v * m[i], 0),
    C = m.reduce((n, v) => n + v * v, 0) - radius * radius;
  if (C <= 0) return 0;
  if (A < 1e-20) return null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}

// Relative motion can be supplied by subtracting target displacement from b.
export function closestSphereProximity(a, b, centre, size, radius) {
  const d = b.map((v, i) => v - a[i]);
  const m = a.map((v, i) => v - centre[i]);
  const A = d.reduce((sum, v) => sum + v * v, 0);
  const distance2 = m.reduce((sum, v) => sum + v * v, 0);
  if (distance2 <= size * size) return 0;
  if (A < 1e-20) return null;
  const contact = sweptSphereProximity(a, b, centre, size);
  if (contact !== null) return contact;
  const t = Math.max(0, -d.reduce((sum, v, i) => sum + v * m[i], 0) / A);
  if (t >= 1) return null;
  const nearest2 = m.reduce((sum, v, i) => sum + (v + t * d[i]) ** 2, 0);
  if (nearest2 > (size + radius) ** 2) return null;
  // A direct contact reaches the minimum surface distance before centre passage.
  return t;
}
