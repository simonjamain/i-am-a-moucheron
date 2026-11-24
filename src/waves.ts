import { MAP, INSECT_SCALE, enemySizeFactor, GROUND_FOOT_DEPTH } from './scale.ts';
import { powerTable } from './enemy-power.ts';
import { enemyRoutePosition, routeDuration } from './routes.ts';
import type { RouteEnemy } from './routes.ts';
import type { PowerStats } from './enemy-power.ts';
import type { Vec3 } from './types.ts';

/** Statistics typed in per species; `power` is derived (see ENEMY_TYPES). */
export interface SpeciesStats extends PowerStats {
  name: string;
  color: string;
  /** Only born from another species' `onDeath`, never drawn by a director. */
  offspringOnly?: boolean;
}
/** One ENEMY_TYPES entry: the typed-in statistics plus the computed power. */
export type EnemyProfile = Readonly<SpeciesStats & { power: number }>;
/** Live director tuning shared by the roster builders (subset of `Balance`). */
export interface RosterBalance {
  enemyHP: number;
  enemySpeed: number;
}
/**
 * One roster entry: a species profile copied onto a scheduled, routed enemy.
 * Server, clients and tests share this shape (snapshots carry it as is).
 */
export interface WaveEnemy extends RouteEnemy {
  id: number;
  type: EnemyType;
  name: string;
  hp: number;
  size: number;
  speedMps: number;
  color: string;
  power: number;
  ground?: boolean;
  offspringOnly?: boolean;
  onDeath?: { spawn: string; count: number };
  phase: number;
  /** Departure, in seconds into the wave. */
  spawn: number;
  entryHold: number;
  duration: number;
  travelSpeed: number;
  approach: string;
  routeSeed: number;
  branch: number;
  portalIndex?: number;
  sourceId?: number;
  offspringOf?: number;
  swarmSize?: number;
  legacyCost?: number;
  debugFlock?: boolean;
  /** Debug-mode dummy (debug-enemies.ts): fixed pose once placed. */
  dummy?: { p: Vec3; dir: Vec3 };
}
/** Sampled authoritative ground pose ([x, z] plane), from ground-creatures. */
export interface GroundPose {
  p: readonly number[];
  dir: readonly number[];
  arrived?: boolean;
}
export interface SwarmPose {
  p: number[];
  dir: number[];
}
interface SwarmSample extends SwarmPose {
  envelope: number;
  authoritative?: boolean;
}

const SPECIES = {
  ant: {
    name: 'Fourmi',
    hp: 100,
    size: 0.8,
    speedMps: 0.085,
    color: '#6e4432',
    ground: true,
  },
  roach: {
    name: 'Cafard',
    hp: 400,
    size: 1.2,
    speedMps: 0.0625,
    color: '#a36f42',
    ground: true,
  },
  midge: {
    name: 'Moucheron',
    hp: 100,
    size: 1,
    speedMps: 0.11,
    color: '#bfb36c',
  },
  guard: {
    name: 'Abeille',
    hp: 600,
    size: 1.4,
    speedMps: 0.0875,
    color: '#729d8b',
  },
  mosquito: {
    name: 'Moustique',
    hp: 150,
    size: 0.58,
    speedMps: 0.115,
    color: '#6b807e',
  },
  rat: {
    name: 'Rat',
    hp: 10000,
    size: 4,
    speedMps: 0.08075,
    color: '#86705c',
    ground: true,
  },
  spider: {
    name: 'Araignée pondeuse',
    hp: 1200,
    size: 2.3,
    speedMps: 0.055,
    color: '#453b35',
    ground: true,
    onDeath: { spawn: 'spiderling', count: 100 },
  },
  spiderling: {
    name: 'Bébé araignée',
    hp: 10,
    size: 0.3,
    speedMps: 0.075,
    color: '#51463d',
    ground: true,
    offspringOnly: true,
  },
  brute: {
    name: 'Scarabée',
    hp: 1500,
    size: 1.9,
    speedMps: 0.07,
    color: '#d0a14b',
  },
} satisfies Record<string, SpeciesStats>;
/** Species keys, derived from the registry: adding a species widens every `Record<EnemyType, …>`. */
export type EnemyType = keyof typeof SPECIES;
// `power` is computed from the statistics (src/enemy-power.ts), never typed in.
// It is the only measure of an enemy: wave budget, soul reward, bin damage.
export const ENEMY_POWER = powerTable(SPECIES);
export const ENEMY_TYPES: Readonly<Record<EnemyType, EnemyProfile>> = Object.freeze(
  Object.fromEntries(
    Object.entries(SPECIES).map(([type, stats]) => [
      type,
      Object.freeze({ ...stats, power: ENEMY_POWER[type] }),
    ]),
  ) as Record<EnemyType, EnemyProfile>,
);
export const isEnemyType = (type: unknown): type is EnemyType =>
  typeof type === 'string' && Object.hasOwn(ENEMY_TYPES, type);
export const enemyPower = (type: string): number => ENEMY_POWER[type];
// First wave where the legacy wavePlan() may draw each species (offspring excluded).
// The live director (server/wave-preparation.js) ignores it: every species is
// available from wave 1 and only the wave's power decides; key order is the draw order.
export const ENEMY_UNLOCK_WAVE: Readonly<Partial<Record<EnemyType, number>>> = Object.freeze({
  ant: 1,
  midge: 1,
  roach: 3,
  mosquito: 3,
  guard: 5,
  brute: 8,
  spider: 11,
  rat: 15,
});
// Technical bounds prevent anonymous UDP commands from exhausting memory or
// generating an untransportable reliable snapshot. Counts are exact, without
// the regular director's population multiplier.
// Coordinates in the office are metres. Speed is metres travelled across the
// room per second, NOT scaled by insect model dimensions or by route length.
export function enemyTravelSpeed(enemy: { speedMps: number }, roomMultiplier = 1): number {
  const speed = enemy.speedMps * roomMultiplier;
  if (!Number.isFinite(speed) || speed <= 0) throw Error('Vitesse ennemie invalide.');
  return speed;
}
// Append a fresh, deterministic swarm to the active room-local roster.
// Existing enemy indices never change, including their damage and kills.
// No in-game command uses it any more: the tests build exact rosters with it
// (load, routes, heavy impacts). One call represents one flock. Aerial and
// ground species cannot share a physical route, so a mixed call has at most
// one of each.
export function debugSwarmRoster(
  counts: Partial<Record<EnemyType, number>>,
  {
    room,
    wave,
    started,
    now,
    balance,
    firstId,
    revision,
  }: {
    room: string;
    wave: number;
    started: number;
    now: number;
    balance: RosterBalance;
    firstId: number;
    revision: number;
  },
): WaveEnemy[] {
  const roster: WaveEnemy[] = [];
  const elapsed = (now - started) / 1000;
  const seed = hash(room + ':debug:' + wave + ':' + revision);
  const airSeed = hash(seed + ':air');
  const groundSeed = hash(seed + ':ground');
  for (const [type, count] of Object.entries(counts) as [EnemyType, number][]) {
    const profile = ENEMY_TYPES[type];
    const routeSeed = profile.ground ? groundSeed : airSeed;
    const portalIndex = routeSeed % (profile.ground ? 3 : 4);
    const departureWindow = Math.min(2.5, Math.max(0.15, Math.sqrt(count) * 0.08));
    for (let i = 0; i < count; i++) {
      const enemy = {
        id: firstId + roster.length,
        type,
        ...profile,
        hp: profile.hp * balance.enemyHP,
        phase: (i * Math.PI * 2) / count,
        spawn: elapsed + (i / Math.max(1, count - 1)) * departureWindow,
        entryHold: profile.ground ? 0.4 : 2,
        approach: 'full',
        routeSeed,
        portalIndex,
        branch: routeSeed % 2,
        debugFlock: true,
      } as WaveEnemy;
      enemy.travelSpeed = enemyTravelSpeed(enemy, balance.enemySpeed);
      enemy.entryHold /= balance.enemySpeed;
      enemy.duration = enemy.entryHold + routeDuration(enemy);
      roster.push(enemy);
    }
  }
  return assignMidgeSwarmSizes(roster);
}
export const MIDGE_SWARM_MULTIPLIER = 5;
export const MAX_WAVE_POPULATION = 180 * MIDGE_SWARM_MULTIPLIER;
export const MAX_OFFSPRING_ROSTER = 20000;

// Stable flock size is metadata on the roster, not the live neighbour count.
// The debug group may mix flying species, whereas director swarms group midges.
export function assignMidgeSwarmSizes<E extends WaveEnemy>(roster: E[]): E[] {
  const sizes = new Map<string, number>();
  const eligible = (e: E) => e.type === 'midge' || e.type === 'spiderling' || e.debugFlock;
  const key = (e: E) =>
    [e.routeSeed || 1, e.branch || 0, e.portalIndex ?? -1, !!e.ground, !!e.debugFlock].join(':');
  for (const enemy of roster)
    if (eligible(enemy)) {
      const group = key(enemy);
      sizes.set(group, (sizes.get(group) || 0) + 1);
    }
  for (const enemy of roster) if (eligible(enemy)) enemy.swarmSize = sizes.get(key(enemy));
  return roster;
}
// Keep the director's composition and timetable, densify only the midge groups.
export function expandMidgeSwarms(roster: readonly WaveEnemy[]): WaveEnemy[] {
  return assignMidgeSwarmSizes(
    roster
      .flatMap((enemy) =>
        Array.from(
          { length: enemy.type === 'midge' ? MIDGE_SWARM_MULTIPLIER : 1 },
          (_, member) => ({
            ...enemy,
            sourceId: enemy.id,
            spawn: enemy.spawn + member * 0.07,
            phase: enemy.phase + (member * Math.PI * 2) / MIDGE_SWARM_MULTIPLIER,
          }),
        ),
      )
      .map((enemy, id) => ({ ...enemy, id })),
  );
}
// Integer point costs of the seeded `wavePlan` director, independent from the
// power model that prices the rosters drawn by server/wave-preparation.js.
const LEGACY_COST: Readonly<Record<EnemyType, number>> = Object.freeze({
  ant: 1,
  roach: 4,
  midge: 1,
  guard: 6,
  mosquito: 2,
  rat: 40,
  spider: 22,
  spiderling: 0,
  brute: 12,
});
export const legacyCost = (enemy: { legacyCost?: number; type: EnemyType }): number =>
  enemy.legacyCost ?? LEGACY_COST[enemy.type];
export function waveBudget(wave: unknown): number {
  const n = Math.max(1, Math.floor(Number(wave) || 1));
  return Math.min(2400, 8 + 2 * (n - 1) + Math.floor((n - 1) ** 2 / 2));
}
function hash(text: unknown): number {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export interface WavePlan {
  budget: number;
  roster: WaveEnemy[];
}
const waveCache = new Map<string, WavePlan>();
export function wavePlan(room: string, wave: number, started = 0): WavePlan {
  const key = `${room}:${wave}:${started}`;
  if (waveCache.has(key)) return waveCache.get(key)!;
  let seed = hash(key),
    remaining = waveBudget(wave);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const initialAnts = 2;
  const roster = Array.from(
      { length: initialAnts },
      (_, id) =>
        ({
          id,
          type: 'ant',
          ...ENEMY_TYPES.ant,
          phase: random() * Math.PI * 2,
        }) as WaveEnemy,
    ),
    counts: Partial<Record<EnemyType, number>> = { ant: initialAnts };
  remaining -= initialAnts;
  const unlock = ENEMY_UNLOCK_WAVE;
  let eliteSpent = 0;
  while (remaining > 0 && roster.length < 180) {
    const unlocked = (Object.entries(ENEMY_TYPES) as [EnemyType, EnemyProfile][]).filter(
      ([name, t]) =>
        !t.offspringOnly &&
        LEGACY_COST[name] <= remaining &&
        (name === 'midge' ||
          (wave >= unlock[name]! &&
            (LEGACY_COST[name] === 1 ||
              ((counts[name] || 0) < 1 + Math.floor((wave - unlock[name]!) / 3) &&
                eliteSpent + LEGACY_COST[name] <= Math.floor(waveBudget(wave) * 0.4))))),
    );
    // At the population ceiling, consolidate the remaining budget into a boss.
    if (roster.length === 179) {
      const hp = ENEMY_TYPES.brute.hp;
      roster.push({
        id: 179,
        type: 'brute',
        ...ENEMY_TYPES.brute,
        hp,
        legacyCost: remaining,
        phase: random() * Math.PI * 2,
      } as WaveEnemy);
      remaining = 0;
      break;
    }
    const [type, profile] = unlocked[Math.floor(random() * unlocked.length)];
    roster.push({
      id: roster.length,
      type,
      ...profile,
      phase: random() * Math.PI * 2,
    } as WaveEnemy);
    remaining -= LEGACY_COST[type];
    counts[type] = (counts[type] || 0) + 1;
    if (LEGACY_COST[type] > 1) eliteSpent += LEGACY_COST[type];
  }
  for (const enemy of roster) {
    enemy.entryHold = 2;
    enemy.spawn = Math.floor(enemy.id / 4) * 2.4 + (enemy.id % 4) * 0.35;
    const group = Math.floor(enemy.id / 8),
      solo = random() < 0.18;
    enemy.approach = wave <= 3 ? 'intro' : wave <= 6 ? 'short' : 'full';
    enemy.routeSeed = hash(key + ':route:' + (solo ? 'solo' + enemy.id : group));
    enemy.branch = enemy.id % 8 < 3 ? 1 : 0;
    enemy.travelSpeed = enemyTravelSpeed(enemy);
    enemy.duration = enemy.entryHold + routeDuration(enemy);
  }
  const result = { budget: waveBudget(wave), roster: expandMidgeSwarms(roster) };
  if (waveCache.size > 32) waveCache.delete(waveCache.keys().next().value!);
  waveCache.set(key, result);
  return result;
}
// Server-only secondary spawn. Immutable IDs, point of death and departure times.
export function spawnOffspring(
  parent: WaveEnemy,
  position: readonly number[],
  time: number,
  balance: RosterBalance,
  firstId: number,
  wave?: number,
  limit = 100,
): WaveEnemy[] {
  const ability = parent.onDeath;
  if (!ability || !isEnemyType(ability.spawn) || limit <= 0) return [];
  const spawn = ability.spawn;
  const profile = ENEMY_TYPES[spawn];
  const count = Math.min(ability.count, limit);
  const origin = [position[0], 0.0007, position[2]];
  const routeSeed = hash(parent.routeSeed + ':brood:' + parent.id);
  const children = Array.from({ length: count }, (_, i) => {
    const draft = {
      ...profile,
      type: spawn,
      id: firstId + i,
      sourceId: parent.id,
      offspringOf: parent.id,
      hp: profile.hp * balance.enemyHP,
      spawnPoint: origin,
      routeSeed,
      branch: parent.branch,
      portalIndex: -1,
      approach: 'brood',
      phase: (i * Math.PI * 2) / count,
      spawn: time + i * 0.02,
      entryHold: 0.15 / balance.enemySpeed,
    };
    // Same key order as a literal followed by two assignments.
    const child: WaveEnemy = Object.assign(draft, {
      travelSpeed: enemyTravelSpeed(draft, balance.enemySpeed),
      duration: 0,
    });
    child.duration = child.entryHold + routeDuration(child);
    return child;
  });
  return assignMidgeSwarmSizes(children);
}
export type EntryStatus = 'pending' | 'arrived' | 'entry' | 'in-flight';
export function entryStatus(
  enemy: { spawn: number; duration: number; entryHold?: number },
  time: number,
): EntryStatus {
  const age = time - enemy.spawn;
  return age < 0
    ? 'pending'
    : age >= enemy.duration
      ? 'arrived'
      : age <= (enemy.entryHold || 0)
        ? 'entry'
        : 'in-flight';
}
// Procedural midge offsets are independent of flock membership and frame history.
function unitHash(id: number, seed: number): number {
  let h = Math.imul((id + 1) ^ (seed >>> 0), 0x9e3779b1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Extent depends on population; individual local motion does NOT.
// At most 20x the base radius for aerial groups, 8x for ground movement.
export function swarmSpread(enemy: { ground?: boolean; swarmSize?: number }): number {
  return Math.min(enemy.ground ? 8 : 20, Math.max(0.45, Math.sqrt((enemy.swarmSize || 1) / 5)));
}
// Legacy route-only fallback (before an authoritative ground pose):
// Ground creatures of one pack walk side by side in a few lanes across their
// path, so that members leaving the same portal never stand on one another.
// Display and hit position only: the simulated path is unchanged. Ribbons stay
// narrower than the 2.5 cm route clearance around furniture.
export const GROUND_LANES: Readonly<Partial<Record<EnemyType, number>>> = Object.freeze({
  ant: 6,
  spiderling: 8,
  roach: 3,
  spider: 2,
  rat: 2,
});
/** Fields read by the lane helpers (a roster entry or a debug placement). */
export interface LaneEnemy extends RouteEnemy {
  type: string;
  id?: number;
  size?: number;
  branch?: number;
}
function groundLaneGeometry(enemy: LaneEnemy): { lanes: number; spacing: number; offset: number } {
  const lanes = GROUND_LANES[enemy.type as EnemyType] || 1,
    id = enemy.id ?? 0,
    radius = INSECT_SCALE * (enemy.size ?? 1) * enemySizeFactor(enemy.type) * 0.9,
    spacing = radius * 1.2,
    lane = ((id % lanes) + lanes) % lanes;
  // A little jitter keeps the columns from looking ruled.
  return {
    lanes,
    spacing,
    offset: (lane - (lanes - 1) / 2 + (unitHash(id, 5) - 0.5) * 0.3) * spacing,
  };
}
export function groundLaneOffset(enemy: LaneEnemy): number {
  const geometry = groundLaneGeometry(enemy);
  return geometry.lanes < 2 ? 0 : geometry.offset;
}
// Sideways displacement of a lane across the path: perpendicular to `dir`,
// oriented once per route so that, at the portal, the ribbon lies on the outer
// side of the wall (creatures appear from inside it) and then recentres over
// the first metres, so nobody is drawn inside the room before leaving it.
const portalSides = new Map<string, number>();
export function groundLaneDisplacement(
  e: LaneEnemy,
  dir: readonly number[],
  u: number,
): [number, number] {
  const { lanes, spacing, offset } = groundLaneGeometry(e);
  if (lanes < 2) return [0, 0];
  const key = [e.routeSeed, e.portalIndex, e.branch, e.approach].join(':');
  let sign = portalSides.get(key);
  if (sign === undefined) {
    const a = enemyRoutePosition(e, 0),
      b = enemyRoutePosition(e, 0.002),
      onZWall = 3.45 - Math.abs(a[2]) < 4 - Math.abs(a[0]),
      outward = onZWall ? [0, Math.sign(a[2]) || 1] : [Math.sign(a[0]) || 1, 0],
      // Perpendicular of the first path segment, turned to face outward.
      perpendicular = [b[2] - a[2], -(b[0] - a[0])],
      alignment = perpendicular[0] * outward[0] + perpendicular[1] * outward[1];
    sign = alignment < 0 ? -1 : 1;
    if (portalSides.size > 512) portalSides.clear();
    portalSides.set(key, sign);
  }
  const w = Math.max(0, Math.min(1, u * 120)),
    along = offset + ((lanes - 1) / 2) * spacing * (1 - w);
  return [dir[1] * sign * along, -dir[0] * sign * along];
}
export function midgeDisplacement(
  enemy: { id?: number; routeSeed?: number; ground?: boolean; swarmSize?: number },
  time: number,
  envelope = 1,
): Vec3 {
  const id = enemy.id ?? 0;
  const seed = enemy.routeSeed || 1;
  const angle = unitHash(id, seed) * Math.PI * 2;
  const spread = swarmSpread(enemy);
  const radius = MAP.metres(4) * spread * Math.sqrt(unitHash(id + 7, seed)) * envelope;
  const vertical = (unitHash(id + 17, seed) - 0.5) * MAP.metres(5) * spread * envelope;
  // Only this small oscillation changes position over time. Its amplitude and
  // frequency are independent of the number of insects in the flock.
  const frequency = 0.14 + unitHash(id + 41, seed) * 0.16;
  const flutter = MAP.metres(1.5) * envelope;
  return [
    Math.cos(angle) * radius + Math.cos(angle + time * frequency) * flutter,
    vertical + Math.sin(time * 0.9 + id * 0.37) * MAP.metres(0.75) * envelope,
    Math.sin(angle) * radius + Math.sin(angle + time * frequency) * flutter,
  ];
}

// Bounded, deterministic flock flow inspired by Reynolds' separation/cohesion/
// alignment rules. No frame-history dependency: late joiners see the same flock.
// The route guides each cluster; local steering offsets cannot skip the bin.
// A sampled ground pose can be provided instead of a static snapshot map.
export type GroundAgents =
  | ((id: number) => GroundPose | null | undefined)
  | Readonly<Record<number, GroundPose | null | undefined>>
  | null;
export function swarmFrame(
  roster: readonly WaveEnemy[],
  time: number,
  groundAgents: GroundAgents = null,
): (SwarmPose | null)[] {
  const groundAt = (id: number) => {
    if (typeof groundAgents === 'function') return groundAgents(id);
    return groundAgents?.[id];
  };
  const samples = roster.map((e): SwarmSample | null => {
    // Debug-mode dummy (debug-enemies.ts): fixed pose from its placement on.
    if (e.dummy)
      return time < e.spawn
        ? null
        : { p: [...e.dummy.p], dir: [...e.dummy.dir], envelope: 1, authoritative: true };
    const ground = e.ground && groundAt(e.id);
    if (ground) {
      if (ground.arrived) return null;
      const lift = INSECT_SCALE * e.size * enemySizeFactor(e.type) * GROUND_FOOT_DEPTH;
      return {
        p: [ground.p[0], 0.0007 + lift, ground.p[1]],
        dir: [ground.dir[0], 0, ground.dir[1]],
        envelope: 1,
        authoritative: true,
      };
    }
    const age = time - e.spawn;
    if (age < 0 || age >= e.duration) return null;
    const hold = e.entryHold || 0;
    const u = Math.max(0, age - hold) / Math.max(0.001, e.duration - hold);
    if (u < 0 || u >= 1) return null;
    const p = enemyRoutePosition(e, u),
      next = enemyRoutePosition(e, Math.min(1, u + 0.0001));
    // Ground meshes extend below their origin: lift both path samples equally
    // so their feet clear the support without corrupting the movement tangent.
    if (e.ground) {
      const lift = INSECT_SCALE * e.size * enemySizeFactor(e.type) * GROUND_FOOT_DEPTH;
      p[1] += lift;
      next[1] += lift;
    }
    const tangent = next.map((v, j) => v - p[j]),
      length = Math.hypot(...tangent) || 1,
      envelope = Math.min(1, u * 30, (1 - u) * 30),
      // A size-scaled fade duration limits expansion/retreat velocity, even
      // at the start and end of a very large flock's journey.
      fadeSeconds = Math.max(0.6, swarmSpread(e) * 0.6),
      flockEnvelope = Math.max(
        0,
        Math.min(1, (age - hold) / fadeSeconds, (e.duration - age) / fadeSeconds),
      ),
      phase = e.phase,
      amplitude = MAP.metres(e.ground ? 1.5 : 4) * envelope;
    if (e.ground) {
      const [dx, dz] = groundLaneDisplacement(e, [tangent[0] / length, tangent[2] / length], u);
      p[0] += dx;
      p[2] += dz;
    }
    for (let j = 0; j < 3; j++)
      if (!e.ground || j !== 1)
        p[j] +=
          amplitude *
          (Math.sin(time * (0.75 + j * 0.17) + phase + j * 2) * 0.65 +
            Math.sin(time * 0.23 + phase * 2 + j) * 0.35);
    if (e.type === 'midge' || e.type === 'spiderling' || e.debugFlock) {
      const offset = midgeDisplacement(e, time, flockEnvelope);
      for (let j = 0; j < 3; j++) if (!e.ground || j !== 1) p[j] += offset[j];
    }
    if (e.type === 'mosquito') {
      // Local dodges remain erratic without dominating the travel speed.
      p[0] += MAP.metres(5) * envelope * Math.sin(time * 2.4 + phase * 3);
      p[1] += MAP.metres(3) * envelope * Math.sin(time * 1.9 + phase * 2);
      p[2] += MAP.metres(4) * envelope * Math.cos(time * 2.7 + phase * 5);
    }
    return { p, dir: tangent.map((v) => v / length), envelope };
  });
  // A spatial grid keeps fivefold populations from multiplying global pair scans.
  const radius = MAP.metres(24),
    buckets = new Map<string, number[]>();
  const cell = (p: readonly number[]) => p.map((v) => Math.floor(v / radius));
  for (let i = 0; i < samples.length; i++) {
    if (
      !samples[i] ||
      ['midge', 'spiderling', 'mosquito'].includes(roster[i].type) ||
      roster[i].debugFlock
    )
      continue;
    const key = cell(samples[i]!.p).join(':');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(i);
  }
  return samples.map((s, i) => {
    if (!s) return null;
    if (s.authoritative || roster[i].type === 'midge' || roster[i].debugFlock)
      return { p: s.p, dir: s.dir };
    const correction = [0, 0, 0];
    let neighbours = 0;
    const [cx, cy, cz] = cell(s.p),
      candidates: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          candidates.push(...(buckets.get([cx + dx, cy + dy, cz + dz].join(':')) || []));
    // Preserve summation order across clients and relative to the former scan.
    candidates.sort((a, b) => a - b);
    for (const j of candidates) {
      const b = samples[j];
      if (!b || j === i) continue;
      const delta = s.p.map((v, k) => v - b.p[k]),
        d = Math.hypot(...delta);
      if (d > MAP.metres(24) || d < 1e-9) continue;
      neighbours++;
      for (let k = 0; k < 3; k++) {
        correction[k] += -delta[k] * 0.035 + (b.dir[k] - s.dir[k]) * MAP.metres(0.15);
        if (d < MAP.metres(2.8)) correction[k] += (delta[k] / d) * (MAP.metres(2.8) - d) * 0.7;
      }
    }
    const norm = Math.hypot(...correction),
      limit = MAP.metres(2) * s.envelope,
      factor = norm > limit ? limit / norm : 1;
    return {
      p: s.p.map(
        (v, k) =>
          v +
          (roster[i].ground && k === 1 ? 0 : correction[k] * factor) /
            Math.max(1, Math.sqrt(neighbours)),
      ),
      dir: s.dir,
    };
  });
}
