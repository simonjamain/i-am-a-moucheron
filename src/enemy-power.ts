// Common balance unit: "power". One unit is what a player of power 1 removes
// during a wave: one reference midge, or a share of a stronger enemy.
// The reference is frozen on purpose and never reads ENEMY_TYPES.midge: tuning
// the midge changes its own power only. To make the game easier or harder,
// act on the wave progression or on the economy, not on this reference.
export const POWER_REFERENCE = Object.freeze({
  hp: 100,
  speedMps: 0.11,
  size: 1,
  flying: true,
});

/** Land creatures are steered by walls and pathfinding; flyers are not. */
export const GROUND_POWER_FACTOR = 1 / 1.5;

export interface PowerStats {
  hp: number;
  speedMps: number;
  size: number;
  ground?: boolean;
  /** Manual correction for what the formula cannot see; 1 by default. */
  powerFactor?: number;
  onDeath?: { spawn: string; count: number };
}

export type PowerTable = Record<string, PowerStats>;

/**
 * power = HP/HP_ref × speed/speed_ref × √(size_ref/size) × type × manual
 *         + offspring count × offspring power.
 * Wall and player damage are deliberately ignored.
 */
export function computeEnemyPower(
  stats: PowerStats,
  table: PowerTable,
  seen: readonly PowerStats[] = [],
): number {
  if (seen.includes(stats)) throw Error('Descendance cyclique.');
  const own =
    (stats.hp / POWER_REFERENCE.hp) *
    (stats.speedMps / POWER_REFERENCE.speedMps) *
    Math.sqrt(POWER_REFERENCE.size / stats.size) *
    (stats.ground ? GROUND_POWER_FACTOR : 1) *
    (stats.powerFactor ?? 1);
  const brood = stats.onDeath;
  if (!brood) return own;
  const child = table[brood.spawn];
  if (!child) throw Error('Descendance inconnue : ' + brood.spawn);
  return own + brood.count * computeEnemyPower(child, table, [...seen, stats]);
}

/** Frozen table of powers for a species table (computed, never typed in). */
export function powerTable(table: PowerTable): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(table).map(([k, s]) => [k, computeEnemyPower(s, table)])),
  );
}
