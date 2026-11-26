// Heavy weapons (rockets, missiles, bombs, tank shells, proximity shells, heavy
// gun) are simulated by the player who fires them, like machine guns: flight,
// collisions and damage are computed in the shooter's browser, then reported
// to the server, which only debits ammunition, applies the reported damage and
// tells the other players. This module is the shared simulation, moved from the
// server unchanged; it works on a `world` view supplied by the caller:
//
//   solidSegment(a, b)     first solid met by the step a→b: { t, normal } or null (boxes and
//                          prop triangles, see SolidQuery)
//   solidNearest(p, r)     distance to the nearest solid within r, or null (proximity fuses)
//   frames(time)           enemy samples indexed like `roster` ([] outside combat)
//   roster, killed(i)      enemy profiles and already defeated indices
//   vehicles               [{ id, type, state: { p, q, hp } }]
//   players                [{ id, p }] alive players outside vehicles
//   equipment              [{ x, y, z }] ground equipment (proximity fuse)
//   guidance(projectile)   missile direction, or null when not guided
//   missileLost(projectile) true when the launching helicopter is gone
import { MAP, enemySizeFactor, INSECT_SCALE, MIDGE_SPHERE_RADIUS } from './scale.ts';
import { AP_PIERCE_KEEP, HEAVY, heavyDamage } from './armament.ts';
import { VEHICLES } from './fleet.ts';
import { integrateOrdnance, segmentSphere } from './ordnance.ts';
import { sweptSphereMayTouch } from './swept-broadphase.ts';
import { PROJECTILES } from './projectiles.ts';
import { bounce } from './ricochet.ts';
import { vehicleMaterial, insectMaterial } from './materials.ts';
import { steerMissile } from './helicopter.ts';
import {
  sweptVehicle,
  proximityRadius,
  fuseSegment,
  sweptSphereProximity,
  closestSphereProximity,
} from './mobile-flak.ts';
import type { OrdnanceState } from './ordnance.ts';
import type { VehicleType } from './fleet.ts';
import type { ProjectileId } from './projectiles.ts';
import type { Vec3 } from './types.ts';

type Vec = readonly number[];
/** One enemy sample of `world.frames` (null for an enemy not on the field). */
export interface HeavyFrame {
  p: number[];
}
export interface HeavyVehicle {
  id: string;
  type: VehicleType;
  state: { p: number[]; q: number[]; hp: number };
}
/** The caller's view of the room (see the header comment). */
export interface HeavyWorld {
  solidSegment?: (a: Vec, b: Vec) => { t: number; normal?: number[] } | null;
  solidNearest?: (p: Vec, radius: number) => number | null;
  frames: (time: number, projectile: HeavyProjectile) => readonly (HeavyFrame | null | undefined)[];
  roster: readonly ({ type: string; size: number } | undefined)[];
  killed: (index: number) => boolean;
  vehicles: readonly HeavyVehicle[];
  players: readonly { id: unknown; p: number[] }[];
  equipment: readonly { x: number; y: number; z: number; slot?: unknown }[];
  guidance?: (projectile: HeavyProjectile) => number[] | null;
  missileLost?: (projectile: HeavyProjectile) => boolean;
}
/** A ricochet noted for the shooter to report (`heavy-bounce`). */
export interface HeavySkid {
  p: number[];
  v: number[];
  age: number;
  updated: number;
  bounces: number;
  at: number[];
}
/** A heavy projectile in flight (createOrdnance), mutated by stepHeavy. */
export interface HeavyProjectile extends OrdnanceState {
  weapon: string;
  shot?: unknown;
  vehicle?: string;
  shooter?: unknown;
  station?: unknown;
  /** Server-clock ms of the shot and of the last simulated step. */
  at: number;
  updated: number;
  done?: boolean;
  proximity?: number;
  bonus?: number;
  radiusFactor?: number;
  /** AP shell: enemies already crossed (index → where they stood), and the new ones to report. */
  pierced?: Record<number, number[]>;
  fresh?: [number, number, number[]][];
  bounces?: number;
  skids?: HeavySkid[];
  solidNear?: number;
  solidFrom?: number[];
}
/** What a step struck: a solid, an enemy, a vehicle or a player. */
export interface HeavyHit {
  t?: number;
  solid?: boolean;
  normal?: number[];
  enemy?: number;
  centre?: number[];
  vehicle?: string;
  kind?: string;
  player?: unknown;
}
export interface HeavyImpactPoint {
  hit: HeavyHit;
  point: number[];
  frames: readonly (HeavyFrame | null | undefined)[];
}
type Hit = HeavyHit & { t: number };
const HEAVY_BY_WEAPON: Readonly<Record<string, (typeof HEAVY)[keyof typeof HEAVY]>> = HEAVY;
/** Damage report sent by the shooter (`heavy-impact`). */
export interface HeavyReport {
  shot: unknown;
  weapon: string;
  p: number[];
  kind: 'piercing' | 'blast';
  radius: number;
  enemies: [number, number, number[] | null][];
  vehicles: [string, number][];
  players: [unknown, number][];
  kills: unknown[];
}

function enemyRadius(enemy: { type: string; size: number }): number {
  return enemy.type === 'midge' || enemy.type === 'spiderling'
    ? INSECT_SCALE *
        enemy.size *
        enemySizeFactor(enemy.type) *
        (enemy.type === 'midge' ? MIDGE_SPHERE_RADIUS : 1.2)
    : MAP.metres(enemy.size * 0.7 * enemySizeFactor(enemy.type));
}

// Advances `projectile` (mutated) up to `end` (ms on the server clock). Returns
// the impact { hit, point, frames } when it detonates or hits something; sets
// projectile.done on impact or at the end of its lifetime.
export function stepHeavy(
  projectile: HeavyProjectile,
  end: number,
  world: HeavyWorld,
): HeavyImpactPoint | null {
  if (projectile.done) return null;
  if (projectile.weapon === 'proximity' || projectile.weapon === 'dcaHeavy')
    return stepProximity(projectile, end, world);
  // A missile dies with its helicopter.
  if (projectile.weapon === 'missile' && world.missileLost?.(projectile)) {
    projectile.done = true;
    return null;
  }
  const profile = HEAVY_BY_WEAPON[projectile.weapon];
  end = Math.min(end, projectile.at + profile.lifetime * 1000);
  // Only the shells with a ricochet angle (src/projectiles.ts) look for surface normals.
  const skids =
    ((PROJECTILES as Record<string, { ricochetMaxAngle?: number } | undefined>)[projectile.weapon]
      ?.ricochetMaxAngle ?? 0) > 0;
  let impact: HeavyImpactPoint | null = null;
  while (projectile.updated < end && !projectile.done) {
    const dt = Math.min(1 / 120, (end - projectile.updated) / 1000);
    if (projectile.weapon === 'missile') {
      const direction = world.guidance?.(projectile);
      if (direction) {
        // Directional guidance must not chase a fixed point behind the missile.
        const length = Math.hypot(...direction) || 1;
        steerMissile(
          projectile,
          projectile.p.map((v, i) => v + direction[i] / length),
          dt,
        );
      }
    }
    const a = integrateOrdnance(projectile, dt),
      b = projectile.p;
    projectile.updated += dt * 1000;
    let hit = null as Hit | null;
    const consider = (t: number | null, target: HeavyHit) => {
      if (t !== null && t >= 0 && t <= 1 && (!hit || t < hit.t)) hit = { t, ...target };
    };
    // Boxes and the props' real triangles (a ray along the step, like any bullet).
    const wall = world.solidSegment?.(a, b) ?? null;
    if (wall) consider(wall.t, { solid: true, normal: wall.normal });
    if (b[1] <= 0)
      consider(a[1] / Math.max(1e-12, a[1] - b[1]), { solid: true, normal: [0, 1, 0] });
    const frames = world.frames(projectile.updated, projectile);
    const crossings: { t: number; index: number; p: number[] }[] = [];
    for (let i = 0; i < frames.length; i++) {
      if (!frames[i] || world.killed(i)) continue;
      const radius = enemyRadius(world.roster[i]!);
      // Cheap swept-AABB rejection before the exact segment/sphere calculation.
      const frame = frames[i]!;
      if (!sweptSphereMayTouch(a, b, frame.p, radius)) continue;
      const t = segmentSphere(a, b, frame.p, radius);
      // The armour-piercing shell goes through enemies: it only notes them
      // (once each, where they stood) and flies on until a wall or a vehicle.
      if (projectile.weapon === 'ap') {
        if (t !== null && t >= 0 && t <= 1 && !projectile.pierced?.[i])
          crossings.push({ t, index: i, p: frame.p });
      } else consider(t, { enemy: i, centre: skids ? frame.p : undefined });
    }
    for (const v of world.vehicles)
      if (v.id !== projectile.vehicle && v.state.hp > 0)
        consider(segmentSphere(a, b, v.state.p, MAP.metres(VEHICLES[v.type].span * 0.3)), {
          vehicle: v.id,
          kind: v.type,
          centre: skids ? v.state.p : undefined,
        });
    for (const p of world.players)
      // A fixed gun's own crew stands behind the muzzle, never in its path.
      if (p.id !== projectile.shooter)
        consider(segmentSphere(a, b, p.p, MAP.metres(0.6)), { player: p.id });
    // Each crossed enemy takes the shell's remaining damage on contact, then
    // the shell keeps 80 % of it for the next one. Enemies behind the wall or
    // vehicle that stops the shell in this step are not reached.
    crossings
      .sort((x, y) => x.t - y.t)
      .forEach((c) => {
        if (hit && c.t > hit.t) return;
        projectile.pierced ??= {};
        const count = Object.keys(projectile.pierced).length;
        projectile.pierced[c.index] = c.p;
        (projectile.fresh ??= []).push([
          c.index,
          HEAVY.ap.damage * (projectile.bonus ?? 1) * AP_PIERCE_KEEP ** count,
          c.p,
        ]);
      });
    if (hit && skids) {
      const at = hit.t;
      const point = a.map((v, i) => v + (b[i] - v) * at);
      const result = skid(projectile, hit, a, b, point, world);
      if (result) {
        if (result === 'spent') projectile.done = true;
        continue;
      }
    }
    if (hit) {
      const at = hit.t;
      const point = a.map((v, i) => v + (b[i] - v) * at);
      projectile.p = point;
      projectile.done = true;
      impact = { hit, point, frames };
    }
  }
  if (
    projectile.age >= profile.lifetime ||
    projectile.updated >= projectile.at + profile.lifetime * 1000
  )
    projectile.done = true;
  return impact;
}

// A contact of a shell that may ricochet (src/ricochet.ts). Returns false when it hits as usual,
// 'spent' when it stops harmlessly after its last bounce, or true when it flew on, turned: the
// ricochet is noted in `projectile.skids` for the shooter to report (heavy-bounce).
function skid(
  projectile: HeavyProjectile,
  hit: Hit,
  a: Vec,
  b: Vec,
  point: number[],
  world: HeavyWorld,
): boolean | 'spent' {
  const material = hit.solid
    ? 'decor'
    : hit.vehicle
      ? vehicleMaterial(hit.kind)
      : hit.enemy !== undefined
        ? insectMaterial(world.roster[hit.enemy]?.type)
        : null;
  const centre = hit.centre;
  const normal = hit.normal ?? (centre ? point.map((v, i) => v - centre[i]) : null);
  if (!material || !normal) return false;
  const direction = b.map((v, i) => v - a[i]);
  const result = bounce(
    direction as unknown as Vec3,
    normal as unknown as Vec3,
    projectile.weapon as ProjectileId,
    material,
    projectile.bounces ?? 0,
  );
  if (!result) return false;
  if (result.kind === 'spent') {
    projectile.p = point;
    return 'spent';
  }
  const length = Math.hypot(...normal);
  const n = normal.map((v) => v / length);
  if (n.reduce((sum, v, i) => sum + v * direction[i], 0) > 0)
    for (let i = 0; i < 3; i++) n[i] = -n[i];
  const speed = Math.hypot(...projectile.v) * result.speedFactor,
    out = Math.hypot(...result.direction) || 1;
  projectile.p = point.map((v, i) => v + n[i] * MAP.metres(0.05));
  projectile.v = result.direction.map((v) => (v / out) * speed);
  projectile.bounces = (projectile.bounces ?? 0) + 1;
  (projectile.skids ??= []).push({
    p: [...projectile.p],
    v: [...projectile.v],
    age: projectile.age,
    updated: projectile.updated,
    bounces: projectile.bounces,
    at: point,
  });
  return true;
}

// Where, along the straight run from `from` to `to`, `distance` is least; on a plateau of equal
// distance (flying along a face), its far end. Distances are sampled: ternary search for the
// least, then bisection for the end of the plateau.
function closestPassage(
  distance: (p: number[]) => number,
  from: Vec,
  to: Vec,
  tolerance: number,
): number[] {
  const at = (t: number) => from.map((v, i) => v + (to[i] - v) * t);
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3,
      m2 = hi - (hi - lo) / 3;
    if (distance(at(m1)) < distance(at(m2))) hi = m2;
    else lo = m1;
  }
  const least = distance(at(lo)) + tolerance;
  if (distance(at(1)) <= least) return at(1);
  hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (distance(at(mid)) <= least) lo = mid;
    else hi = mid;
  }
  return at(lo);
}

function stepProximity(
  projectile: HeavyProjectile,
  end: number,
  world: HeavyWorld,
): HeavyImpactPoint | null {
  const profile = HEAVY_BY_WEAPON[projectile.weapon];
  end = Math.min(end, projectile.at + profile.lifetime * 1000);
  const radius = proximityRadius(projectile.proximity);
  let impact: HeavyImpactPoint | null = null;
  while (projectile.updated < end && !projectile.done) {
    const ageBefore = projectile.age;
    const dt = Math.min(
      1 / 120,
      (end - projectile.updated) / 1000,
      ageBefore < 0.3 - 1e-12 ? 0.3 - ageBefore : Infinity,
    );
    const a = integrateOrdnance(projectile, dt),
      b = projectile.p;
    projectile.updated += dt * 1000;
    const frames = world.frames(projectile.updated, projectile);
    const armed = fuseSegment(a, b, ageBefore, projectile.age);
    let hit = null as { t: number; kind: string; point?: number[] } | null;
    const consider = (t: number | null, kind: string, point?: number[]) => {
      if (t !== null && (!hit || t < hit.t)) hit = { t, kind, point };
    };
    // Boxes and props, on their real surfaces: a ray along the step is a contact (inert
    // before arming); once armed, the fuse waits for the closest approach inside the
    // radius, so it fires as the shell moves away. The floor is the plane y = 0.
    const touch = world.solidSegment?.(a, b)?.t ?? null;
    const flat = b[1] <= 0 ? a[1] / Math.max(1e-12, a[1] - b[1]) : null;
    for (const contact of [touch, flat])
      if (contact !== null && (!armed || contact < armed.t - 1e-12)) consider(contact, 'inert');
    if (armed) {
      const wall = world.solidNearest?.(b, radius) ?? null;
      const near = b[1] <= radius ? Math.min(wall ?? Infinity, Math.max(0, b[1])) : wall;
      const before = projectile.solidNear,
        from = projectile.solidFrom;
      if (near === null) {
        delete projectile.solidNear;
        delete projectile.solidFrom;
      } else {
        projectile.solidNear = near;
        projectile.solidFrom = a;
      }
      // Moving away after coming within the radius: the fuse fires where the passage was closest.
      if (before !== undefined && (near === null || near > before + radius * 1e-4))
        consider(
          armed.t,
          'fuse',
          closestPassage(
            (q) => Math.min(world.solidNearest?.(q, Infinity) ?? Infinity, Math.max(0, q[1])),
            from ?? a,
            b,
            radius * 1e-4,
          ),
        );
    }
    const previousFrames =
      armed && frames.length ? world.frames(projectile.updated - dt * 1000, projectile) : [];
    const sphere = (centre: Vec, size: number, own = false, previous: Vec = centre) => {
      const contact = sweptSphereProximity(a, b, centre, size);
      if (!own && contact !== null && (!armed || contact < armed.t - 1e-12))
        consider(contact, 'inert');
      if (armed) {
        const start = previous.map((v, i) => v + (centre[i] - v) * armed.t);
        const relativeEnd = b.map((v, i) => v - (centre[i] - start[i]));
        const t = closestSphereProximity(armed.a, relativeEnd, start, size, radius);
        if (t !== null) consider(armed.t + t * (1 - armed.t), 'fuse');
      }
    };
    frames.forEach((f, i) => {
      if (f && !world.killed(i))
        sphere(
          f.p,
          MAP.metres(
            world.roster[i]!.size *
              0.7 *
              (enemySizeFactor(world.roster[i]!.type) *
                (world.roster[i]!.type === 'midge' ? 1.2 : 1)),
          ),
          false,
          previousFrames[i]?.p || f.p,
        );
    });
    for (const v of world.vehicles)
      if (v.state.hp > 0) {
        const contact = sweptVehicle(a, b, v, 0);
        if (
          v.id !== projectile.vehicle &&
          contact !== null &&
          (!armed || contact < armed.t - 1e-12)
        )
          consider(contact, 'inert');
        if (armed) {
          const t = sweptVehicle(armed.a, b, v, radius, true);
          if (t !== null) consider(armed.t + t * (1 - armed.t), 'fuse');
        }
      }
    for (const p of world.players)
      sphere(p.p, MAP.metres(0.6), projectile.station != null && p.id === projectile.shooter);
    for (const e of world.equipment)
      sphere(
        [e.x, e.y + MAP.metres(1), e.z],
        MAP.metres(1),
        projectile.station === e.slot && e.slot != null,
      );
    if (hit) {
      projectile.done = true;
      const at = hit.t;
      projectile.p = hit.point ?? a.map((v, i) => v + (b[i] - v) * at);
      if (hit.kind === 'fuse') impact = { hit: {}, point: projectile.p, frames };
    }
  }
  if (projectile.updated >= projectile.at + profile.lifetime * 1000) projectile.done = true;
  return impact;
}

// Damage of an impact, as the shooter reports it. Same rules as before the
// move: direct hit (AP shell, heavy gun), blast with falloff and obstruction
// by office solids, friends included.
export function heavyImpact(
  projectile: HeavyProjectile,
  hit: HeavyHit,
  frames: readonly (HeavyFrame | null | undefined)[],
  point: number[],
  world: Pick<HeavyWorld, 'roster' | 'killed' | 'solidSegment' | 'vehicles' | 'players'>,
): HeavyReport {
  const weapon = projectile.weapon,
    profile = HEAVY_BY_WEAPON[weapon],
    report: HeavyReport = {
      shot: projectile.shot,
      weapon,
      p: point,
      kind: weapon === 'ap' ? 'piercing' : 'blast',
      radius: profile.radius * (projectile.radiusFactor || 1),
      enemies: [],
      vehicles: [],
      players: [],
      kills: [],
    };
  const enemy = (index: number, amount: number) => {
    if (!world.roster[index] || world.killed(index)) return;
    report.enemies.push([index, amount, frames[index]?.p || null]);
  };
  if (weapon === 'ap') {
    if (hit.vehicle) report.vehicles.push([hit.vehicle, profile.damage * projectile.bonus!]);
    if (hit.player) report.kills.push(hit.player);
    return report;
  }
  const damage = (position: Vec) => {
    const distance = Math.hypot(...point.map((v, i) => v - position[i]));
    if (distance > profile.radius * (projectile.radiusFactor || 1)) return 0;
    const wall = world.solidSegment?.(
      point.map((v, i) => v + (i === 1 ? MAP.metres(0.05) : 0)),
      position,
    );
    const obstructed = !!wall && wall.t > 0.001 && wall.t < 0.999;
    return obstructed
      ? 0
      : heavyDamage(weapon, distance, projectile.bonus, projectile.radiusFactor || 1);
  };
  // The heavy gun's small blast is narrower than a large insect: the target it
  // strikes takes the full charge, the blast only reaches the others.
  const direct = weapon === 'antitank';
  if (direct && hit.enemy !== undefined) enemy(hit.enemy, profile.damage * projectile.bonus!);
  if (direct && hit.vehicle)
    report.vehicles.push([hit.vehicle, profile.damage * projectile.bonus!]);
  frames.forEach((f, i) => {
    if (f && !(direct && hit.enemy === i)) {
      const n = damage(f.p);
      if (n) enemy(i, n);
    }
  });
  for (const v of world.vehicles)
    if (v.state.hp > 0 && !(direct && hit.vehicle === v.id)) {
      const n = damage(v.state.p);
      if (n) report.vehicles.push([v.id, n]);
    }
  for (const p of world.players) {
    const n = damage(p.p);
    if (n) report.players.push([p.id, n]);
  }
  return report;
}
