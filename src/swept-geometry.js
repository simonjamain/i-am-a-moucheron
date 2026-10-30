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
export function sweptBoxProximity(a, b, box, radius) {
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
    if (f(lo) <= 1e-14) return lo;
    if (A > 1e-20) {
      const discriminant = B * B - 4 * A * C;
      if (discriminant >= 0) {
        const t = (-B - Math.sqrt(discriminant)) / (2 * A);
        if (t >= lo - 1e-12 && t <= hi + 1e-12) return Math.max(lo, t);
      }
    }
  }
  return segmentBox(a, b, box);
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
