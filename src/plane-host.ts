import type { World, RigidBody, Collider } from '@dimforge/rapier3d-compat';
import { OFFICE_LAYOUT } from './layout.ts';
import type { VehicleProfile } from './fleet.ts';
import { K, PLANE_CRASH_IMPACT, PlaneRig, type PlaneState } from './plane-physics.ts';
import { PhysicsWorld, toWorld, type Rapier, type Solid } from './physics-world.ts';

/** Aircraft types the server simulates while nobody is aboard (the others: still the
 * host client's arcade step, until they are ported to plane-physics.ts). */
export const HOSTED_PLANES: ReadonlySet<string> = new Set(['fighter']);

const STEP = 1 / 60;
const MAX_STEPS = 15; // a stalled server catches up at most a quarter of a second

export interface HostedPlane {
  id: string;
  state: PlaneState;
  profile?: Partial<VehicleProfile> | null;
}
interface Entry extends HostedPlane {
  rig: PlaneRig;
  impact: number;
  asleep: boolean;
}
export interface PlaneUpdate {
  id: string;
  p: number[];
  q: number[];
  v: number[];
  omega: number[];
  landed: boolean;
  /** The aircraft is destroyed: it hit something hard, or left the room. */
  destroyed: boolean;
}

/**
 * The server's physics for the aircraft nobody flies (src/plane-physics.ts): all of a
 * room's parked aircraft share one Rapier world with the decor's triangles. They are
 * parked as the pilot leaves them (wheel brakes on, engine off); on a slope they come
 * to rest and the engine puts them to sleep, which costs nothing until someone takes
 * the controls (the aircraft then leaves this world, `sync`).
 */
export class PlaneHost {
  readonly physics: PhysicsWorld;
  private entries = new Map<string, Entry>();
  private last: number | null = null;
  private pending = 0;

  private R: Rapier;

  constructor(
    R: Rapier,
    decor: { addTo(world: World): Collider[] } | null,
    solids: readonly Solid[],
  ) {
    this.R = R;
    this.physics = new PhysicsWorld(R, { gravity: 9.81 * K });
    this.physics.useDecor(decor);
    this.physics.sync(solids);
  }

  get size(): number {
    return this.entries.size;
  }
  has(id: string): boolean {
    return this.entries.has(id);
  }
  /** The body of an aircraft (tests and the debug view). */
  body(id: string): RigidBody | undefined {
    return this.entries.get(id)?.rig.body;
  }

  /** Aircraft that must be simulated now: the others are dropped from the world. */
  sync(wanted: Iterable<HostedPlane>): void {
    const ids = new Set<string>();
    for (const plane of wanted) {
      ids.add(plane.id);
      if (this.entries.has(plane.id)) continue;
      const rig = new PlaneRig(this.R, undefined, this.physics, true);
      rig.adopt({ ...plane.state, gas: 0 });
      this.entries.set(plane.id, {
        ...plane,
        state: { ...plane.state },
        rig,
        impact: 0,
        asleep: false,
      });
    }
    for (const [id, entry] of this.entries)
      if (!ids.has(id)) {
        this.physics.world.removeRigidBody(entry.rig.body);
        this.entries.delete(id);
      }
  }

  /** Advances to `now` (ms). Returns the aircraft that moved (or were destroyed). */
  step(now: number): PlaneUpdate[] {
    if (this.last === null) this.last = now;
    this.pending = Math.min(this.pending + (now - this.last) / 1000, MAX_STEPS * STEP);
    this.last = now;
    const moved = new Set<string>();
    const idle = { pitch: 0, roll: 0, yaw: 0 };
    while (this.pending >= STEP) {
      this.pending -= STEP;
      let any = false;
      for (const entry of this.entries.values()) {
        if (entry.rig.asleep) continue;
        any = true;
        entry.state.gas = 0;
        entry.rig.forces(entry.state, idle, STEP, entry.profile, true);
      }
      if (!any) break;
      this.physics.step(STEP);
      for (const entry of this.entries.values()) {
        if (entry.rig.asleep && entry.asleep) continue;
        entry.impact = Math.max(entry.impact, entry.rig.impact());
        moved.add(entry.id);
      }
    }
    const updates: PlaneUpdate[] = [];
    const bounds = OFFICE_LAYOUT.bounds;
    for (const id of moved) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      const body = entry.rig.body,
        p = body.translation(),
        q = body.rotation(),
        v = body.linvel(),
        w = body.angvel();
      const world = [toWorld(p.x), toWorld(p.y), toWorld(p.z)];
      const asleep = body.isSleeping();
      const destroyed =
        entry.impact > PLANE_CRASH_IMPACT ||
        world[1] > bounds.ceiling ||
        Math.abs(world[0]) > bounds.x ||
        Math.abs(world[2]) > bounds.z;
      entry.impact = 0;
      // A body that fell asleep reports once more, then stays out of the updates.
      entry.asleep = asleep;
      entry.state.p = world;
      updates.push({
        id,
        p: world,
        q: [q.x, q.y, q.z, q.w],
        v: [toWorld(v.x), toWorld(v.y), toWorld(v.z)],
        omega: [w.x, w.y, w.z],
        landed: entry.rig.compression[0] > 0 || entry.rig.compression[1] > 0,
        destroyed,
      });
    }
    return updates;
  }

  dispose(): void {
    this.physics.dispose();
    this.entries.clear();
  }
}
