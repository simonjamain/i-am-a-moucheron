import { MAP, ACTOR_UNIT, REFERENCE } from './scale.js';
import { OFFICE_LAYOUT } from './layout.js';
import { advanceArena, createSoul } from './purgatory-physics.js';
export function aircraftBay(index) {
  const col = index % 10,
    row = Math.floor(index / 10);
  const x = -29 + col * 6.4,
    z = 4 + row * 3.6;
  return { x, z, entryX: x + (col === 9 ? -3.15 : 3.15), entryZ: z };
}
export function baseWorld(p) {
  const b = OFFICE_LAYOUT.base;
  return { x: b.originX + p.x * ACTOR_UNIT, y: p.y ?? b.deckY, z: b.originZ - p.z * ACTOR_UNIT };
}
export function baseBody(p, now) {
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
    r: 0.32,
    face: Math.PI,
    paper: p.board_paper,
  };
}
export function baseAccess(body, bay) {
  return (
    !!body &&
    !body.gone &&
    !body.parachute &&
    Math.abs((body.y ?? OFFICE_LAYOUT.base.deckY) - OFFICE_LAYOUT.base.deckY) < 2 * ACTOR_UNIT &&
    Math.hypot(body.x - bay.entryX, body.z - bay.entryZ) < 1.25
  );
}
export function reconcileBase(a, pilots, now) {
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
  // Arena planar coordinates use ACTOR_UNIT; target a 6 m/s reference run.
  a.acceleration = (MAP.metres(REFERENCE.walk) / ACTOR_UNIT) * 7.45;
  const walkers = pilots.filter((p) => p.life === 'alive' && p.mode === 'foot'),
    ids = new Set(walkers.map((p) => p.id));
  a.bodies = a.bodies.filter((b) => ids.has(b.entity));
  for (const p of walkers) {
    let b = a.bodies.find((b) => b.entity === p.id);
    if (!b) {
      b = baseBody({ ...p, walkSpawn: p.state ? JSON.parse(p.state).walkSpawn : null }, now);
      a.bodies.push(b);
    }
    b.paper = p.board_paper;
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
  return a;
}
export function advanceBase(a, now, owner = null) {
  advanceArena(a, now, owner);
  a.desk = null;
  return a;
}

export function aircraftPose(index, airborne = false) {
  const bay = baseWorld(aircraftBay(index)),
    b = OFFICE_LAYOUT.base;
  return {
    p: [bay.x, airborne ? b.departureY : b.parkedY, bay.z],
    q: [0, Math.sin(b.yaw / 2), 0, Math.cos(b.yaw / 2)],
    v: airborne ? [-Math.sin(b.yaw) * b.speed, 0, -Math.cos(b.yaw) * b.speed] : [0, 0, 0],
  };
}
