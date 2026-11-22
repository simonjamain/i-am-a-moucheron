import type { World, RigidBody, Collider } from '@dimforge/rapier3d-compat';
import { OFFICE_LAYOUT } from './layout.ts';
import { MAP } from './scale.ts';
import type { VehicleProfile } from './fleet.ts';
import { PLANE_CRASH_IMPACT, PLANE_TYPES, PlaneRig, type PlaneState } from './plane-physics.ts';
import { HELI_CRASH_IMPACT, HELI_TYPES, HeliRig } from './heli-physics.ts';
import { TankRig } from './tank-physics.ts';
import { CastorRig } from './castor-physics.ts';
import { TruckRig } from './truck-physics.ts';
import { PhysicsWorld, toWorld, type Rapier, type Solid } from './physics-world.ts';

/** Ground vehicles the server simulates while nobody is aboard. */
const GROUND_RIGS = { tank: TankRig, castor: CastorRig, flaktruck: TruckRig } as const;
export const HOSTED_GROUND: ReadonlySet<string> = new Set(Object.keys(GROUND_RIGS));
/** Aircraft the server simulates while nobody is aboard. */
export const HOSTED_PLANES: ReadonlySet<string> = new Set([...PLANE_TYPES, ...HELI_TYPES]);
/** Everything the server parks. */
export const isHosted = (type: string): boolean =>
  HOSTED_PLANES.has(type) || HOSTED_GROUND.has(type);

const STEP = 1 / 60;
const MAX_STEPS = 15; // a stalled server catches up at most a quarter of a second
const CALM = 1; // seconds a ground vehicle must be at rest before it is put to sleep

export interface HostedVehicle {
  id: string;
  /** Vehicle type (src/fleet.ts): its geometry and its rig. */
  type: string;
  state: PlaneState & Record<string, unknown>;
  profile?: Partial<VehicleProfile> | null;
}
type GroundRig = TankRig | CastorRig | TruckRig;
interface Entry extends HostedVehicle {
  plane?: PlaneRig | HeliRig;
  ground?: GroundRig;
  impact: number;
  /** Ground vehicles: seconds at rest, and put to sleep. */
  calm: number;
  frozen: boolean;
  /** Reported once more after it fell asleep. */
  reported: boolean;
}
export interface ParkedUpdate {
  id: string;
  /** The fields of the vehicle's state that changed (position, attitude, speeds…). */
  state: Record<string, unknown>;
  /** The vehicle is destroyed: it hit something hard, fell, or left the room. */
  destroyed: boolean;
}

/**
 * The server's physics for the vehicles nobody drives (src/plane-physics.ts and the ground
 * rigs): all of a room's parked vehicles share one Rapier world with the decor's
 * triangles. They are left as the driver or pilot left them (brakes on, engine off); aircraft
 * come to rest and the engine puts them to sleep, ground vehicles are put to sleep once they
 * have been at rest for a second. A sleeper costs nothing until someone takes the controls
 * (the vehicle then leaves this world, `sync`) or something wakes it.
 */
export class ParkedHost {
  readonly physics: PhysicsWorld;
  private entries = new Map<string, Entry>();
  private last: number | null = null;
  private pending = 0;
  private R: Rapier;
  private solids: readonly Solid[];

  constructor(
    R: Rapier,
    decor: { addTo(world: World): Collider[] } | null,
    solids: readonly Solid[],
  ) {
    this.R = R;
    this.solids = solids;
    this.physics = new PhysicsWorld(R);
    this.physics.deferred = true;
    this.physics.useDecor(decor);
    this.physics.sync(solids);
  }

  get size(): number {
    return this.entries.size;
  }
  has(id: string): boolean {
    return this.entries.has(id);
  }
  /** The first rigid body of a vehicle (tests and the debug view). */
  body(id: string): RigidBody | undefined {
    const entry = this.entries.get(id);
    return entry?.plane?.body ?? entry?.ground?.bodies[0];
  }
  /** The recoil of a gun on a parked vehicle (a tank fired by its gunner): wakes it. */
  kick(id: string, aim: readonly number[]): void {
    const entry = this.entries.get(id);
    if (!entry?.ground || !('kick' in entry.ground)) return;
    entry.ground.kick(aim);
    entry.frozen = false;
    entry.calm = 0;
  }
  /** Every body of a vehicle is asleep. */
  asleep(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    return entry.plane ? entry.plane.asleep : !!entry.ground?.bodies.every((b) => b.isSleeping());
  }

  /** Vehicles that must be simulated now: the others are dropped from the world. */
  sync(wanted: Iterable<HostedVehicle>): void {
    const ids = new Set<string>();
    for (const vehicle of wanted) {
      ids.add(vehicle.id);
      if (this.entries.has(vehicle.id)) continue;
      const state = { ...vehicle.state };
      const entry: Entry = {
        ...vehicle,
        state,
        impact: 0,
        calm: 0,
        frozen: false,
        reported: false,
      };
      if (HELI_TYPES.has(vehicle.type)) {
        entry.plane = new HeliRig(this.R, vehicle.type, this.physics, true);
        entry.plane.adopt({ ...state, gas: 0 });
      } else if (PLANE_TYPES.has(vehicle.type)) {
        entry.plane = new PlaneRig(this.R, vehicle.type, this.physics, true);
        entry.plane.adopt({ ...state, gas: 0 });
      } else if (vehicle.type in GROUND_RIGS) {
        const Rig = GROUND_RIGS[vehicle.type as keyof typeof GROUND_RIGS];
        entry.ground = new Rig(this.R, undefined, this.physics) as GroundRig;
        // The rig adopts the state on its first step.
      } else continue;
      this.entries.set(vehicle.id, entry);
    }
    for (const [id, entry] of this.entries)
      if (!ids.has(id)) {
        for (const body of entry.plane ? [entry.plane.body] : (entry.ground?.bodies ?? []))
          this.physics.world.removeRigidBody(body);
        this.entries.delete(id);
      }
  }

  /** Advances to `now` (ms). Returns the vehicles that moved (or were destroyed). */
  step(now: number): ParkedUpdate[] {
    if (this.last === null) this.last = now;
    this.pending = Math.min(this.pending + (now - this.last) / 1000, MAX_STEPS * STEP);
    this.last = now;
    const moved = new Set<string>();
    const idle = { pitch: 0, roll: 0, yaw: 0 };
    const stopped = { forward: 0, turn: 0 };
    while (this.pending >= STEP) {
      this.pending -= STEP;
      let any = false;
      for (const entry of this.entries.values()) {
        if (entry.plane) {
          if (entry.plane.asleep) continue;
          any = true;
          entry.state.gas = 0;
          entry.plane.forces(entry.state, idle, STEP, entry.profile, true);
        } else if (entry.ground) {
          if (entry.frozen) {
            // Something woke it (a collision): it is simulated again.
            if (entry.ground.bodies.some((b) => !b.isSleeping())) entry.frozen = false;
            else continue;
          }
          any = true;
          entry.ground.step(
            entry.state as never,
            stopped,
            this.solids,
            STEP,
            (entry.profile ?? {}) as VehicleProfile,
          );
          const s = entry.state as { v: number[]; omega?: number[] };
          // Vertical speed: the solver leaves a small constant residue on a vehicle at rest.
          const calm =
            Math.hypot(s.v[0], s.v[2]) < MAP.metres(0.15) &&
            Math.abs(s.v[1]) < MAP.metres(1.2) &&
            Math.hypot(...(s.omega ?? [0, 0, 0])) < 0.05;
          entry.calm = calm ? entry.calm + STEP : 0;
          if (entry.calm >= CALM) {
            for (const body of entry.ground.bodies) body.sleep();
            entry.frozen = true;
            entry.calm = 0;
          }
          moved.add(entry.id);
        }
      }
      if (!any) break;
      // Aircraft only apply their forces; ground rigs also ask for the step themselves.
      this.physics.step(STEP);
      this.physics.flush();
      for (const entry of this.entries.values()) {
        if (!entry.plane || (entry.plane.asleep && entry.reported)) continue;
        entry.impact = Math.max(entry.impact, entry.plane.impact());
        moved.add(entry.id);
      }
    }
    const updates: ParkedUpdate[] = [];
    const bounds = OFFICE_LAYOUT.bounds;
    for (const id of moved) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      if (entry.plane) {
        const body = entry.plane.body,
          p = body.translation(),
          q = body.rotation(),
          v = body.linvel(),
          w = body.angvel();
        const world = [toWorld(p.x), toWorld(p.y), toWorld(p.z)];
        const destroyed =
          entry.impact >
            (entry.plane instanceof HeliRig ? HELI_CRASH_IMPACT : PLANE_CRASH_IMPACT) ||
          world[1] > bounds.ceiling ||
          Math.abs(world[0]) > bounds.x ||
          Math.abs(world[2]) > bounds.z;
        entry.impact = 0;
        // A body that fell asleep reports once more, then stays out of the updates.
        entry.reported = body.isSleeping();
        entry.state.p = world;
        updates.push({
          id,
          state: {
            p: world,
            q: [q.x, q.y, q.z, q.w],
            v: [toWorld(v.x), toWorld(v.y), toWorld(v.z)],
            omega: [w.x, w.y, w.z],
            landed: entry.plane.compression[0] > 0 || entry.plane.compression[1] > 0,
            gas: 0,
            ...(entry.plane instanceof HeliRig ? { rotorPower: entry.plane.rotorPower } : {}),
          },
          destroyed,
        });
      } else {
        updates.push({ id, state: { ...entry.state }, destroyed: entry.state.hp <= 0 });
      }
    }
    return updates;
  }

  dispose(): void {
    this.physics.dispose();
    this.entries.clear();
  }
}
