// Columns of air bend the ideal track horizontally. A shared grid bounds the
// sampling cost per insect even when a room contains many fans.
export const FAN_COST = 4;
export const FAN_FADE_MS = 2500;
const radius = 1.8;
const cell = 0.2;
const nx = 45,
  nz = 39;
const originX = -4.4,
  originZ = -3.8;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const fieldCache = new WeakMap();

export function fanPower(fan, now) {
  const strength = smooth(((fan.removedAt ?? now) - fan.placedAt) / FAN_FADE_MS);
  return fan.removedAt == null
    ? strength
    : strength * (1 - smooth((now - fan.removedAt) / FAN_FADE_MS));
}

export function airField(defense, now, preview) {
  if (!defense) return null;
  const cached = fieldCache.get(defense);
  if (
    !preview &&
    cached?.revision === defense.revision &&
    (cached.at === now || (cached.settled && now >= cached.at))
  )
    return cached.grid;
  const fans = [
    ...defense.structures.filter((s) => s.kind === 'fan'),
    ...(defense.retiringFans || []),
  ];
  if (preview) fans.push(preview);
  let grid = null,
    settled = true;
  for (const fan of fans) {
    const power = preview ? (fan.removedAt == null ? 1 : 0) : fanPower(fan, now);
    if (now < (fan.removedAt ?? fan.placedAt) + FAN_FADE_MS) settled = false;
    if (!power) continue;
    grid ??= new Float32Array(nx * nz * 2);
    const [x, z] = fan.position;
    const dx = Math.sin(fan.angle) * power,
      dz = Math.cos(fan.angle) * power;
    for (
      let j = Math.max(0, Math.ceil((z - radius - originZ) / cell));
      j <= Math.min(nz - 1, (z + radius - originZ) / cell);
      j++
    ) {
      for (
        let i = Math.max(0, Math.ceil((x - radius - originX) / cell));
        i <= Math.min(nx - 1, (x + radius - originX) / cell);
        i++
      ) {
        const influence = smooth(
          1 - ((originX + i * cell - x) ** 2 + (originZ + j * cell - z) ** 2) / radius ** 2,
        );
        const k = (j * nx + i) * 2;
        grid[k] += dx * influence;
        grid[k + 1] += dz * influence;
      }
    }
  }
  if (!preview) fieldCache.set(defense, { revision: defense.revision, at: now, settled, grid });
  return grid;
}

export function bendAirPoint(p, u, grid) {
  if (!grid) return p;
  const x = Math.min(nx - 1.0001, Math.max(0, (p[0] - originX) / cell));
  const z = Math.min(nz - 1.0001, Math.max(0, (p[2] - originZ) / cell));
  const i = Math.floor(x),
    j = Math.floor(z),
    k = (j * nx + i) * 2;
  const fx = x - i,
    fz = z - j;
  const sample = (offset) => {
    const a = k + offset,
      b = a + nx * 2;
    return (
      (1 - fz) * ((1 - fx) * grid[a] + fx * grid[a + 2]) +
      fz * ((1 - fx) * grid[b] + fx * grid[b + 2])
    );
  };
  const dx = sample(0),
    dz = sample(1);
  // Preserve the vent and bin positions, and never blow insects outside the office.
  const weight = smooth(Math.min(u, 1 - u) * 18) / Math.max(1, Math.hypot(dx, dz));
  p[0] = Math.max(-4.08, Math.min(4.08, p[0] + dx * weight));
  p[2] = Math.max(-3.49, Math.min(3.49, p[2] + dz * weight));
  return p;
}
