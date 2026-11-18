// Dense swarms share a few spatial emitters (one per occupied world cell).
interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface SwarmMember {
  visible?: boolean;
  position?: Vec3;
}
interface Cell extends Vec3 {
  key: string;
  count: number;
  ix: number;
  iy: number;
  iz: number;
}
export interface SwarmSource {
  key: string;
  position: Vec3;
  count: number;
  level: number;
  rate: number;
  score: number;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Group many insects into a few spatial HRTF emitters. Group keys depend only
 * on the world-space cell, not the IDs or order of living insects.
 * CPU O(insects + occupiedCells * maxSources); no network synchronization.
 */
export function swarmAudioGroups(
  insects: { values(): Iterable<SwarmMember | null | undefined> },
  listener: Vec3,
  {
    cellSize = 0.12,
    maxDistance = 4.5,
    maxSources = 5,
    preferred = null,
  }: {
    cellSize?: number;
    maxDistance?: number;
    maxSources?: number;
    preferred?: ReadonlySet<string> | null;
  } = {},
): SwarmSource[] {
  if (!(cellSize > 0) || !(maxDistance > 0) || !(maxSources > 0)) return [];
  const cells = new Map<string, Cell>();
  const maximumSquared = maxDistance * maxDistance;
  for (const model of insects.values()) {
    const p = model?.position;
    if (model?.visible === false || !p) continue;
    const { x, y, z } = p;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const dx = x - listener.x,
      dy = y - listener.y,
      dz = z - listener.z;
    if (dx * dx + dy * dy + dz * dz > maximumSquared) continue;
    const ix = Math.floor(x / cellSize),
      iy = Math.floor(y / cellSize),
      iz = Math.floor(z / cellSize),
      key = 'swarm-' + ix + ':' + iy + ':' + iz;
    let cell = cells.get(key);
    if (!cell) {
      cell = { key, x: 0, y: 0, z: 0, count: 0, ix, iy, iz };
      cells.set(key, cell);
    }
    cell.x += x;
    cell.y += y;
    cell.z += z;
    cell.count++;
  }
  const selected: SwarmSource[] = [];
  for (const cell of cells.values()) {
    const position = {
      x: cell.x / cell.count,
      y: cell.y / cell.count,
      z: cell.z / cell.count,
    };
    const distance = Math.hypot(
      position.x - listener.x,
      position.y - listener.y,
      position.z - listener.z,
    );
    // A logarithmic, capped gain makes a dense swarm louder, never 10k voices.
    const level = clamp(0.3 + 0.2 * Math.log2(1 + cell.count), 0.35, 1.5);
    const score = (level / (0.15 + distance)) * (preferred?.has(cell.key) ? 1.15 : 1);
    const tone = Math.abs(cell.ix * 31 + cell.iy * 17 + cell.iz * 13) % 7;
    const source: SwarmSource = {
      key: cell.key,
      position,
      count: cell.count,
      level,
      rate: 0.85 + tone * 0.045,
      score,
    };
    // The top K is so small that sorted insertion beats sorting all cells.
    let rank = selected.findIndex(
      (candidate) =>
        source.score > candidate.score ||
        (source.score === candidate.score && source.key < candidate.key),
    );
    if (rank === -1) rank = selected.length;
    if (rank < maxSources) selected.splice(rank, 0, source);
    if (selected.length > maxSources) selected.pop();
  }
  return selected;
}
