import type { Vec3, XYZ } from './types.ts';
import { ACTOR_UNIT, WALK_WORLDS, walkAcceleration } from './scale.ts';
import { OFFICE_LAYOUT } from './layout.ts';
import { advanceArena, createSoul } from './purgatory-physics.ts';
import type { Arena, SoulBody, SoulEntity } from './purgatory-physics.ts';

/** Walk spawn stored in a pilot's state (where the pilot left its aircraft). */
export interface WalkSpawn {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  airborne?: boolean;
  parachute?: boolean;
}
/** The pilot fields read by the base deck. */
export interface BasePilot {
  id: string;
  bay: number;
  name?: string;
  life?: string;
  mode?: string;
  state?: string | null;
  board_paper?: unknown;
  walkSpawn?: WalkSpawn | null;
}
export interface BayPosition {
  x: number;
  z: number;
  entryX: number;
  entryZ: number;
}
export interface BaseBody extends SoulBody {
  y: number;
  vy: number;
  grounded: boolean;
  parachute: boolean;
}
export function aircraftBay(index: number): BayPosition {
  const col = index % 10,
    row = Math.floor(index / 10);
  const x = -29 + col * 6.4,
    z = 4 + row * 3.6;
  return { x, z, entryX: x + (col === 9 ? -3.15 : 3.15), entryZ: z };
}
export function baseWorld(p: { x: number; y?: number; z: number }): XYZ {
  const b = OFFICE_LAYOUT.base;
  return { x: b.originX + p.x * ACTOR_UNIT, y: p.y ?? b.deckY, z: b.originZ - p.z * ACTOR_UNIT };
}
// Walking collision radius in actor units, for players and furniture alike.
// Issue #135: half the former 0.32; shot hit volumes are separate.
export const BASE_WALK_RADIUS = 0.16;
export function baseBody(p: BasePilot, now: number): BaseBody {
  const bay = aircraftBay(p.bay);
  return {
    ...createSoul({ id: p.bay + 1, entity: p.id, kind: 'player', name: p.name }, 0, now),
    x: p.walkSpawn?.x ?? bay.entryX,
    z: p.walkSpawn?.z ?? Math.max(0.5, bay.z - 2.4),
    y: p.walkSpawn?.y ?? OFFICE_LAYOUT.base.deckY,
    vy: p.walkSpawn?.vy ?? 0,
    grounded: !p.walkSpawn?.airborne,
    vx: (p.walkSpawn?.vx ?? 0) / ACTOR_UNIT,
    vz: -(p.walkSpawn?.vz ?? 0) / ACTOR_UNIT,
    parachute: !!p.walkSpawn?.parachute,
    r: BASE_WALK_RADIUS,
    face: Math.PI,
    paper: p.board_paper,
  };
}
// Footsteps only while walking on a support: never in free fall or under the
// parachute (issue #135), whatever the horizontal speed.
export function footstepsAudible(
  body: SoulBody | null | undefined,
  speed: number,
  minimum: number = 0.6,
): boolean {
  return !!body && body.grounded !== false && !body.parachute && speed > minimum;
}
export function baseAccess(body: SoulBody | null | undefined, bay: BayPosition): boolean {
  return (
    !!body &&
    !body.gone &&
    !body.parachute &&
    Math.abs((body.y ?? OFFICE_LAYOUT.base.deckY) - OFFICE_LAYOUT.base.deckY) < 2 * ACTOR_UNIT &&
    Math.hypot(body.x - bay.entryX, body.z - bay.entryZ) < 1.25
  );
}
export function reconcileBase(a: Partial<Arena>, pilots: BasePilot[], now: number): Arena {
  a.bodies ??= [];
  a.time ??= now;
  a.events ??= [];
  a.eventSeq ??= 0;
  a.bounds = {
    minX: (-OFFICE_LAYOUT.bounds.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT + 1,
    maxX: (OFFICE_LAYOUT.bounds.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT - 1,
    minZ: (OFFICE_LAYOUT.base.originZ - OFFICE_LAYOUT.bounds.z) / ACTOR_UNIT + 1,
    maxZ: (OFFICE_LAYOUT.base.originZ + OFFICE_LAYOUT.bounds.z) / ACTOR_UNIT - 1,
  };
  a.verticalUnit = ACTOR_UNIT;
  // Same walking law as in the purgatory (scale.ts, walkAcceleration).
  a.acceleration = walkAcceleration(WALK_WORLDS.office);
  const walkers = pilots.filter((p) => p.life === 'alive' && p.mode === 'foot'),
    ids = new Set<SoulEntity>(walkers.map((p) => p.id));
  a.bodies = a.bodies.filter((b) => ids.has(b.entity));
  for (const p of walkers) {
    let b = a.bodies.find((b) => b.entity === p.id);
    if (!b) {
      b = baseBody({ ...p, walkSpawn: p.state ? JSON.parse(p.state).walkSpawn : null }, now);
      a.bodies.push(b);
    }
    b.paper = p.board_paper;
    b.r = BASE_WALK_RADIUS; // bodies created before an update keep walking freely
  }
  // Legacy parked bodies still support old clients. Shared fleet hulls are
  // supplied by the scene, instead of creating one invisible hull per player.
  a.obstacles = pilots.flatMap((p) => {
    const state = p.state ? JSON.parse(p.state) : {};
    if (!state.parked) return [];
    const pose = state.parked,
      x = (pose.p[0] - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
      z = (OFFICE_LAYOUT.base.originZ - pose.p[2]) / ACTOR_UNIT,
      y = pose.p[1] - 1.05 * ACTOR_UNIT;
    return [
      { x, z, w: 1, d: 3.5, y },
      { x, z: z + 0.2, w: 5.6, d: 1, y },
    ];
  });
  return a as Arena;
}
export function advanceBase(a: Arena, now: number, owner: SoulEntity = null): Arena {
  advanceArena(a, now, owner);
  a.desk = null;
  return a;
}

export function aircraftPose(
  index: number,
  airborne: boolean = false,
): { p: Vec3; q: [number, number, number, number]; v: Vec3 } {
  const bay = baseWorld(aircraftBay(index)),
    b = OFFICE_LAYOUT.base;
  return {
    p: [bay.x, airborne ? b.departureY : b.parkedY, bay.z],
    q: [0, Math.sin(b.yaw / 2), 0, Math.cos(b.yaw / 2)],
    v: airborne ? [-Math.sin(b.yaw) * b.speed, 0, -Math.cos(b.yaw) * b.speed] : [0, 0, 0],
  };
}
