// Office metres; shared by rendering, preview and authoritative billing.
export const BRICK_PITCH = 0.024;
export const HALF_BRICK = BRICK_PITCH / 2;
export const WALL_SEGMENT = BRICK_PITCH * 2;
export const WALL_ROWS = 2;
export const WALL_SEGMENT_PRICE = 0.25;
export function wallLength(distance) {
  return Math.floor((Math.max(0, distance) + 1e-9) / HALF_BRICK) * HALF_BRICK;
}

// Logical damage/billing sections remain independent. Render aligned surviving
// neighbours as one run so a partial stop/resume cannot reset the brick lattice.
export function wallVisualRuns(structures) {
  const runs = structures
    .filter((s) => s.kind === 'barricade' && s.hp > 0)
    .map((s) => ({ ...s, a: [...s.a], b: [...s.b], wholeWall: true }));
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;
  for (let i = 0; i < runs.length; i++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i],
          b = runs[j];
        const av = [a.b[0] - a.a[0], a.b[1] - a.a[1]],
          bv = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
        if (Math.abs(av[0] * bv[1] - av[1] * bv[0]) > 1e-7 * Math.hypot(...av) * Math.hypot(...bv))
          continue;
        if (near(a.b, b.a)) a.b = b.b;
        else if (near(a.b, b.b)) a.b = b.a;
        else if (near(a.a, b.b)) a.a = b.a;
        else if (near(a.a, b.a)) a.a = b.b;
        else continue;
        runs.splice(j, 1);
        changed = true;
        break;
      }
    }
  }
  return runs;
}
