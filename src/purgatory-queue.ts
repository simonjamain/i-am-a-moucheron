// The purgatory's rules on top of the walking arena (walk-arena.ts): the
// insects' physical queue, Saint Pierre's desk and the paid VIP lane
// (docs/purgatory-queue.md). Shared by the server (authority on souls and
// signatures) and the clients (each simulates its own soul, the host the insects).
import {
  ACTOR_UNIT,
  PERSON_HEIGHT,
  HUMANOID_UNITS,
  WALK_WORLDS,
  WALKER_RADIUS,
  walkAcceleration,
} from './scale.ts';
import { PURGATORY_FRAME } from './arena-frame.ts';
import { advanceArena, createWalker } from './walk-arena.ts';
import type {
  Arena,
  ArenaBounds,
  ArenaObstacle,
  PlanarPoint,
  WalkBody,
  WalkEntity,
  WalkRules,
  WalkSeed,
} from './walk-arena.ts';

// Movement radius only (hits use meshes elsewhere). Issue #135 halved it so the
// slimmer character no longer snags on other players.
export const SOUL_RADIUS = (WALKER_RADIUS * HUMANOID_UNITS) / PERSON_HEIGHT,
  INSECT_RADIUS = 0.43,
  INSECT_MASS = 0.65;
export const QUEUE_SPACING = 1.85;
/** The insects' queue runs along x = 0, from the desk (z = 1.1) backwards. */
const LANE_HALF_WIDTH = 1.1,
  DESK = Object.freeze({ x: 0, z: 1.1, r: 1.25 }),
  /** Time Saint Pierre takes to stamp an insect's papers (ms). */
  INSECT_SERVICE_MS = 1500;
const inLane = (b: PlanarPoint): boolean => Math.abs(b.x) < LANE_HALF_WIDTH;

export function soulSpawn(index: number): PlanarPoint {
  return { x: DESK.x, z: DESK.z + index * QUEUE_SPACING };
}
// ---------------------------------------------------------------- staff
/**
 * Saint Pierre and the VIP guard (docs/purgatory-sky.md): STAFF_HP points of life
 * each. Killed, each walks the queue as a soul (kind 'enemy', enemyType its role),
 * the size of a person. The guard's soul is served like the insects and goes back to
 * its post; Saint Pierre cannot serve himself, so his soul waits until it is killed
 * again (STAFF_HP once more), and then he goes back behind his desk.
 */
export const STAFF_HP = 10000;
export type StaffRole = 'saint' | 'guard';
export const STAFF_ROLES: readonly StaffRole[] = Object.freeze(['saint', 'guard']);
export const isStaff = (type: unknown): type is StaffRole => type === 'saint' || type === 'guard';

export function createSoul(
  s: WalkSeed & { enemy_type?: string },
  index: number,
  now: number,
): WalkBody {
  const insect = s.kind === 'enemy' && !isStaff(s.enemy_type);
  // Bodies stand on the cloud's floor, at its height in the world.
  return {
    ...createWalker(
      s,
      soulSpawn(index),
      now,
      insect ? { r: INSECT_RADIUS, mass: INSECT_MASS } : { r: SOUL_RADIUS },
    ),
    y: PURGATORY_FRAME.originY,
  };
}

// ---------------------------------------------------------------- VIP lane
// A roped lane on the right of the insects' queue, closed by a rope gate that
// only lets players with the pass through. It ends at Saint Pierre's second
// window, where he serves a VIP once the insect at his first window is done.
// The pass is bought from the guard at the gate.
export const VIP_DESK = Object.freeze({ x: 5.2, z: 1.1, r: 1 });
export const VIP_GATE_Z = 9.2;
export const VIP_LANE: readonly ArenaObstacle[] = Object.freeze([
  { x: 3.9, z: VIP_GATE_Z / 2, w: 0.12, d: VIP_GATE_Z },
  { x: 6.5, z: VIP_GATE_Z / 2, w: 0.12, d: VIP_GATE_Z },
  { x: 5.2, z: VIP_GATE_Z, w: 2.72, d: 0.12, vip: true },
]);
export const VIP_GUARD = Object.freeze({ x: 7.1, z: 9.9, reach: 3.5 });
/** Where a player's soul appears: before both queues, near the guard. */
export const SOUL_ENTRANCE = Object.freeze({ x: 4.2, z: 11 });
/** Price of the pass in dollars: the wave number (wave 1: 1 $). */
export function vipPrice(wave: number): number {
  return Math.max(1, Math.floor(Number(wave) || 0));
}
export function inVipDesk(b: WalkBody): boolean {
  return !b.gone && Math.hypot(b.x - VIP_DESK.x, b.z - VIP_DESK.z) < VIP_DESK.r;
}
export function nearVipGuard(b: PlanarPoint): boolean {
  return Math.hypot(b.x - VIP_GUARD.x, b.z - VIP_GUARD.z) < VIP_GUARD.reach;
}

// ---------------------------------------------------------------- queue
/** An insect waiting earlier than this player (lower id) stands in the lane. */
function insectAhead(a: Arena, b: WalkBody): WalkBody[] {
  return a.bodies.filter(
    (other) => other.kind === 'enemy' && !other.gone && inLane(other) && other.id < b.id,
  );
}
// Each insect has a distinct place. Players reserve space by actually standing
// in the lane; tickets never grant exclusive access to the signing desk.
export function queueTargets(a: Arena): Map<number, PlanarPoint> {
  const insects = a.bodies
    .filter((b) => b.kind === 'enemy' && !b.gone)
    .sort((a, b) => (a.queueTicket ?? a.id) - (b.queueTicket ?? b.id) || a.id - b.id);
  const players = a.bodies.filter((b) => b.kind === 'player' && !b.gone && inLane(b));
  const targets = new Map<number, PlanarPoint>();
  let z = DESK.z;
  for (const b of insects) {
    while (players.some((p) => Math.abs(p.z - z) < QUEUE_SPACING * 0.85)) z += QUEUE_SPACING;
    targets.set(b.id, { x: 0, z });
    z += QUEUE_SPACING;
  }
  return targets;
}
/** Unit intent of an insect toward its place, using the side aisles to pass. */
function queueIntent(a: Arena, b: WalkBody, target: PlanarPoint | undefined): PlanarPoint {
  if (!target) return { x: 0, z: 0 };
  let z = target.z;
  // A person physically standing ahead is never bypassed automatically.
  if (z < b.z)
    for (const other of a.bodies) {
      if (other.kind !== 'player' || other.gone || !inLane(other)) continue;
      if (other.z < b.z && other.z > z) z = Math.max(z, other.z + QUEUE_SPACING);
    }
  let x = 0;
  const travelling = Math.abs(z - b.z) > 0.3;
  const blocked = a.bodies.some(
    (other) =>
      other.id !== b.id &&
      !other.gone &&
      inLane(other) &&
      other.z > Math.min(z, b.z) + 0.1 &&
      other.z < Math.max(z, b.z) - 0.1,
  );
  // Use the side aisles to regain a displaced place or return to the tail.
  // Commit to the aisle until level with the reserved place, then rejoin.
  if (travelling && (blocked || Math.abs(b.x) > 1.2)) {
    x = Math.abs(b.x) > 0.2 ? Math.sign(b.x) * 2.1 : z > b.z ? 2.1 : -2.1;
    if (Math.abs(b.x - x) > 0.15) z = b.z;
  }
  const dx = x - b.x,
    dz = z - b.z,
    d = Math.hypot(dx, dz);
  if (d < 0.08) return { x: 0, z: 0 };
  const scale = Math.max(1, d);
  return { x: dx / scale, z: dz / scale };
}
/** The side aisle is an entrance, not a shortcut past waiting insects. */
function keepQueueOrder(a: Arena, b: WalkBody): void {
  if (b.kind !== 'player' || !inLane(b)) return;
  const earlier = insectAhead(a, b);
  if (!earlier.length) return;
  const tail = Math.max(...earlier.map((other) => other.z)) + QUEUE_SPACING;
  if (b.z < tail) {
    b.z = tail;
    b.vz = Math.max(0, b.vz);
  }
}

// ---------------------------------------------------------------- desk
export function inDeskZone(b: WalkBody): boolean {
  return !b.gone && b.z >= 0.48 && Math.hypot(b.x - DESK.x, b.z - DESK.z) < DESK.r;
}
/** Closest body at the insects' window; a player waits behind earlier insects. */
function mainWindowOccupant(a: Arena): WalkBody | null {
  const d2 = (b: WalkBody): number => (b.x - DESK.x) ** 2 + (b.z - DESK.z) ** 2;
  return (
    a.bodies
      .filter((b) => inDeskZone(b) && (b.kind !== 'player' || !insectAhead(a, b).length))
      .sort((x, y) => d2(x) - d2(y) || x.id - y.id)[0] || null
  );
}
/** Body Saint Pierre serves now: the insect he started, else a VIP, else the queue. */
export function deskOccupant(a: Arena): WalkBody | null {
  // Saint Pierre is dead: nobody is served.
  if (a.saintDown) return null;
  const main = mainWindowOccupant(a);
  if (main?.kind === 'enemy' && main.served > 0) return main;
  const d = (b: WalkBody): number => Math.hypot(b.x - VIP_DESK.x, b.z - VIP_DESK.z);
  // The guard is dead: the VIP window is closed.
  const vip = a.bodies
    .filter((b) => !a.vipClosed && b.kind === 'player' && b.vip && inVipDesk(b))
    .sort((x, y) => d(x) - d(y) || x.id - y.id)[0];
  return vip || main;
}
/**
 * The clipboard a player's soul may use now (docs/purgatory-scene.md): the one of
 * the window where Saint Pierre serves it ('desk' or 'vip'), else none. A soul
 * without the pass never gets the VIP clipboard.
 */
export function clipboardWindow(a: Arena, b: WalkBody | null | undefined): 'desk' | 'vip' | null {
  if (!b || b.gone || b.kind !== 'player' || deskOccupant(a)?.id !== b.id) return null;
  return b.vip && inVipDesk(b) ? 'vip' : 'desk';
}
/** Saint Pierre stamps the insect at his desk; players sign their papers themselves. */
function serveDesk(a: Arena, now: number, ms: number, owned: (b: WalkBody) => boolean): void {
  a.desk = deskOccupant(a)?.id ?? null;
  for (const b of a.bodies) {
    if (owned(b) && b.kind === 'enemy' && b.id === a.desk) {
      b.served += ms;
      if (b.served >= INSECT_SERVICE_MS) {
        b.gone = true;
        a.desk = null;
        a.events.push({ id: ++a.eventSeq, at: now, kind: 'stamp', target: b.id, x: 0, z: -1 });
        if (a.events.length > 24) a.events.shift();
      }
    } else b.served = 0;
  }
}

export const PURGATORY_RULES: WalkRules = Object.freeze({
  // A soul walks exactly like a person in the office (scale.ts, walkAcceleration).
  acceleration: walkAcceleration(WALK_WORLDS.purgatory),
  // Heights are world heights of the same person as in the office.
  verticalUnit: ACTOR_UNIT,
  npcAcceleration: 14,
  bounds: (a: Arena): ArenaBounds => ({
    minX: -10,
    maxX: 10,
    minZ: 0,
    maxZ: Math.max(80, a.bodies.length * QUEUE_SPACING + 5),
  }),
  steer(a: Arena): Map<number, PlanarPoint> {
    const intents = new Map<number, PlanarPoint>();
    for (const [id, place] of queueTargets(a)) {
      const b = a.bodies.find((b) => b.id === id)!;
      intents.set(id, queueIntent(a, b, place));
    }
    return intents;
  },
  constrain: keepQueueOrder,
  passes: (b: WalkBody, o: ArenaObstacle): boolean => !!(o.vip && b.vip),
  afterStep: serveDesk,
});

export function advancePurgatory(a: Arena, to: number, owner: WalkEntity = null): Arena {
  return advanceArena(a, to, PURGATORY_RULES, owner);
}
