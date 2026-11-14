import { INSECT_SCALE, enemySizeFactor } from './scale.js';
import { advanceGroundUnit, groundUnit } from './ground-creatures.js';

// Soft personal space in room metres, distinct from projectile hit volumes.
export const groundRadius = (enemy) =>
  INSECT_SCALE * (enemy.size ?? 1) * enemySizeFactor(enemy.type) * 0.9;
const CELL = 0.1;
const key = (x, z) => x + ':' + z;

// Freeze neighbours for each substep: results do not depend on update order.
export function crowdSeparation(entries) {
  const grid = new Map();
  let maxRadius = 0;
  for (const { unit, enemy } of entries) {
    if (unit.arrived) continue;
    const radius = groundRadius(enemy);
    maxRadius = Math.max(maxRadius, radius);
    const p = [...unit.p],
      cell = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell).push({ id: unit.id, p, radius });
  }
  return (unit, enemy) => {
    const radius = groundRadius(enemy),
      range = Math.ceil(((radius + maxRadius) * 1.5) / CELL);
    const x = Math.floor(unit.p[0] / CELL),
      z = Math.floor(unit.p[1] / CELL);
    let sx = 0,
      sz = 0;
    for (let dx = -range; dx <= range; dx++)
      for (let dz = -range; dz <= range; dz++)
        for (const other of grid.get(key(x + dx, z + dz)) || []) {
          if (other.id === unit.id) continue;
          let vx = unit.p[0] - other.p[0],
            vz = unit.p[1] - other.p[1];
          const distance = Math.hypot(vx, vz),
            space = (radius + other.radius) * 1.5;
          if (distance >= space) continue;
          if (distance < 1e-9) {
            // Antisymmetric tie-break for coincident spawns, without random state.
            const a = String(unit.id),
              b = String(other.id);
            const pair = a < b ? a + ':' + b : b + ':' + a;
            let hash = 2166136261;
            for (const ch of pair) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
            const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2,
              sign = a < b ? 1 : -1;
            vx = Math.cos(angle) * sign;
            vz = Math.sin(angle) * sign;
          } else {
            vx /= distance;
            vz /= distance;
          }
          const strength = (1 - distance / space) ** 2;
          sx += vx * strength;
          sz += vz * strength;
        }
    const length = Math.max(1, Math.hypot(sx, sz));
    return [sx / length, sz / length];
  };
}

export function advanceGroundCrowd(agents, roster, kills, previous, elapsed, world) {
  const ground = roster.flatMap((enemy, index) =>
    enemy.ground && !kills.has(index)
      ? [{ enemy, availableAt: enemy.spawn + (enemy.entryHold || 0) }]
      : [],
  );
  // Existing room ticks are 250 ms; bounded movement substeps let neighbours
  // react before crossing, including when a delayed tick catches up.
  let time = previous;
  do {
    const end = Math.min(elapsed, time + 0.05),
      entries = [];
    for (const { enemy, availableAt } of ground) {
      if (end < availableAt) continue;
      const unit = (agents[enemy.id] ||= groundUnit(enemy, Math.max(previous, availableAt)));
      if (!unit.arrived) entries.push({ unit, enemy, availableAt });
    }
    const stepWorld = { ...world, separation: crowdSeparation(entries) };
    for (const { unit, enemy, availableAt } of entries)
      advanceGroundUnit(
        unit,
        enemy,
        end,
        Math.max(0, end - Math.max(time, availableAt)),
        stepWorld,
      );
    time = end;
  } while (time < elapsed - 1e-9);
}
