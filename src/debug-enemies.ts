// Debug mode (« Debug : ON ») enemies placed from the shop (P): one per order,
// appended to the running wave's roster like a spider's brood, so every weapon,
// turret and hit test treats them as ordinary enemies.
//  - « dummy » (mannequin): stands still at the aimed point, animated in place,
//    never dies (huge HP), keeps the wave open until the dummies are removed;
//  - « live » (ennemi réel): normal HP, speed and route to the bin. Walkers
//    path-find from the floor below the aimed point; flyers fly straight to the
//    nearest point of a vent's usual corridor, then follow it (routes.js).
import { ENEMY_TYPES, assignMidgeSwarmSizes, enemyTravelSpeed } from './waves.js';
import { routeDuration } from './routes.js';
import { GROUND_BOUNDS } from './ground-defense.js';
import { GROUND_FOOT_DEPTH, INSECT_SCALE, enemySizeFactor } from './scale.ts';
import type { EnemyType, Vec3 } from './types.ts';

export type DebugEnemyKind = 'dummy' | 'live';
export const DEBUG_ENEMY_KINDS: readonly DebugEnemyKind[] = Object.freeze(['dummy', 'live']);
/** Shop order of the debug columns: every species, ground then air. */
export const DEBUG_ENEMY_TYPES: readonly EnemyType[] = Object.freeze([
  'spiderling',
  'ant',
  'roach',
  'spider',
  'rat',
  'midge',
  'mosquito',
  'guard',
  'brute',
]);
/** Finite (JSON-safe) values: no hit reaches it, no route outlasts it. */
export const DUMMY_HP = 1e9;
export const DUMMY_DURATION = 1e9;
/** Highest point accepted for a placement (office ceiling with margin). */
export const DEBUG_CEILING = 3;
/** Rounding slack around the room: a floor hit can land a hair below y = 0, a
 *  wall-side hit just outside the walkable bounds; such points are clamped in. */
export const DEBUG_SLACK = 0.1;

export interface DebugPlacement {
  kind: DebugEnemyKind;
  type: EnemyType;
  /** Aimed point: on a surface for walkers, in the air for flyers. */
  p: Vec3;
  /** Horizontal facing [x, z] of a dummy. */
  dir: [number, number];
}
interface Balance {
  enemyHP: number;
  enemySpeed: number;
}
type Profile = { ground?: boolean; size: number; hp: number; speedMps: number };
// Roster entries are plain objects shared with waves.js (untyped JavaScript).
type RosterEntry = Record<string, unknown> & { id: number; type: EnemyType };

const fail = (message: string): never => {
  throw new Error(message);
};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Network input → placement, or a French error for the player.
export function debugPlacement(body: unknown): DebugPlacement {
  const b = (body || {}) as Record<string, unknown>;
  if (!DEBUG_ENEMY_KINDS.includes(b.kind as DebugEnemyKind)) fail('Type de pose invalide.');
  if (!DEBUG_ENEMY_TYPES.includes(b.type as EnemyType)) fail('Espèce invalide.');
  const p = b.p as unknown[],
    dir = (b.dir ?? [0, 1]) as unknown[];
  if (!Array.isArray(p) || p.length !== 3 || !p.every(finite)) fail('Position invalide.');
  if (!Array.isArray(dir) || dir.length !== 2 || !dir.every(finite)) fail('Direction invalide.');
  const [x, y, z] = p as Vec3;
  const [minX, minZ, maxX, maxZ] = GROUND_BOUNDS;
  const e = DEBUG_SLACK;
  if (x < minX - e || x > maxX + e || z < minZ - e || z > maxZ + e || y < -e || y > DEBUG_CEILING)
    fail('Visez un point dans la pièce.');
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const [dx, dz] = dir as [number, number];
  const n = Math.hypot(dx, dz);
  return {
    kind: b.kind as DebugEnemyKind,
    type: b.type as EnemyType,
    p: [clamp(x, minX, maxX), Math.max(0, y), clamp(z, minZ, maxZ)],
    dir: n > 1e-6 ? [dx / n, dz / n] : [0, 1],
  };
}

// Height of a walker's origin standing on a support at `y` (as swarmFrame lifts it).
export function standingHeight(type: EnemyType, size: number, y: number): number {
  return y + 0.0007 + INSECT_SCALE * size * enemySizeFactor(type) * GROUND_FOOT_DEPTH;
}

// Roster entry for one placement, departing at `time` (seconds into the wave).
export function debugEnemy(
  placement: DebugPlacement,
  { id, time, balance, seq }: { id: number; time: number; balance: Balance; seq: number },
): RosterEntry {
  const { kind, type, p, dir } = placement;
  const profile = (ENEMY_TYPES as Record<EnemyType, Profile>)[type];
  // Own route seed: a placed midge is its own swarm of one.
  const routeSeed = (Math.imul(seq + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0 || 1;
  const enemy: RosterEntry = {
    ...profile,
    type,
    id,
    debug: kind,
    routeSeed,
    branch: 0,
    portalIndex: -1,
    approach: 'debug',
    phase: ((seq * 2.399963) % (Math.PI * 2)) as number,
    spawn: time,
  };
  if (kind === 'dummy') {
    const y = profile.ground ? standingHeight(type, profile.size, p[1]) : p[1];
    Object.assign(enemy, {
      hp: DUMMY_HP,
      dummy: { p: [p[0], y, p[2]], dir: [dir[0], 0, dir[1]] },
      entryHold: 0,
      duration: DUMMY_DURATION,
      travelSpeed: profile.speedMps,
    });
    return enemy;
  }
  Object.assign(enemy, {
    hp: profile.hp * balance.enemyHP,
    entryHold: (profile.ground ? 0.15 : 0.3) / balance.enemySpeed,
    ...(profile.ground ? { spawnPoint: [p[0], 0.0007, p[2]] } : { airStart: [...p] }),
  });
  enemy.travelSpeed = enemyTravelSpeed(enemy, balance.enemySpeed);
  enemy.duration = (enemy.entryHold as number) + routeDuration(enemy);
  return enemy;
}

// Append one placed enemy to a running roster; returns its index.
export function appendDebugEnemy(
  roster: RosterEntry[],
  placement: DebugPlacement,
  context: { time: number; balance: Balance; seq: number },
): number {
  const id = roster.length;
  roster.push(debugEnemy(placement, { ...context, id }));
  assignMidgeSwarmSizes(roster);
  return id;
}

// Indices of the dummies still standing.
export function standingDummies(
  roster: readonly RosterEntry[],
  kills: ReadonlySet<number>,
): number[] {
  const out: number[] = [];
  roster.forEach((e, i) => {
    if (e.dummy && !kills.has(i)) out.push(i);
  });
  return out;
}
