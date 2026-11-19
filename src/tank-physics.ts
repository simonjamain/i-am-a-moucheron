import type { RigidBody } from '@dimforge/rapier3d-compat';
import { MAP } from './scale.ts';
import type { VehicleProfile } from './fleet.ts';
import {
  FALL_KILL_SPEED,
  GRAVITY,
  MODEL_UNIT,
  PhysicsWorld,
  rotate,
  toPhysics,
  toWorld,
  type Rapier,
  type Solid,
} from './physics-world.ts';

// The medium tank on Rapier: a rigid hull on one spring per road wheel (twelve ray-cast
// suspensions), driven like a tracked vehicle. Each track is commanded to a belt speed,
// and pushes the ground along the hull at its wheels; sliding sideways is resisted only
// partly, so the tank pivots on the spot. Pitch under braking, roll in turns and the
// way the hull settles on steps all come from the springs, which is also what the
// deformable tracks will be drawn from (`wheelCompression`).
//
// Scale: the tank is the model of a real medium tank, not a toy. At the same gravity,
// geometric similarity (Froude) scales masses with size³, speeds with √size and rates
// with 1/√size. The model's hull is 1.23 m long (a 5.9 m Sherman hull at 0.208): a 30 t
// tank becomes 270 kg, a 40 km/h top speed 5 m/s, a pivot of 0.6 rad/s 1.3 rad/s.
const MU = MODEL_UNIT;

// Running gear, measured on the hull mesh (model units): the tracks are the parts of
// `body` with |x| from 0.62 to 1.03, whose flat contact patch spans z = -1.02…1.55
// from y = -0.80 (ground). test-tank-physics.mjs checks these against the mesh.
export const TRACK_X = 0.79 * MU; // centre line of each track
export const WHEEL_RADIUS = 0.3 * MU;
export const WHEEL_Z = [-1, -0.49, 0.02, 0.53, 1.04, 1.55].map((z) => z * MU);
export const GROUND_CLEARANCE = 0.8 * MU; // hull origin above the ground at rest

export const TANK_PHYSICS = Object.freeze({
  mass: 270, // kg
  reverseSpeed: 0.5, // share of the top speed
  thrust: 1.2, // m/s² per tank, both tracks, at standstill: calm, the former 2.4 was too brisk
  brakeGrip: 0.9, // longitudinal friction: holds the tank up to a 42° slope
  sideGrip: 0.4, // sideways friction: lower than the above, so that the tank pivots
  steerThrust: 6, // thrust of the steering difference, in the same units as `thrust` (per wheel)
  brakeForce: 6, // braking against the motion, in units of `thrust`
  coastForce: 3, // holding force when no key is pressed, in units of `thrust`
  slopeAssist: 1, // share of the weight along a slope that the tracks climb without slowing down
  yawSoftness: 0.3, // rad/s of yaw error over which the steering goes to full thrust
  beltSoftness: 0.15, // m/s over which the holding force builds up
  slipSpeed: 0.08, // m/s over which sideways friction builds up to its limit
  sag: 0.04, // m: spring compression with the hull at rest
  droop: 0.1, // m: extension of the spring at full droop, below the rest height
  bump: 0.1, // m: extra compression (up to the hull touching the ground)
  damping: 0.45, // damping ratio of the hull on its springs
  linearDamping: 0.02,
  angularDamping: 0.4,
});
export type TankParams = typeof TANK_PHYSICS;

/** The part of a vehicle state this rig reads and writes (world units). */
export interface TankState {
  p: number[];
  q: number[];
  v: number[];
  hp: number;
  omega?: number[];
  gas?: number;
  landed?: boolean;
  fuelAvailable?: boolean;
}
export interface TankControls {
  forward?: number;
  turn?: number;
}
interface Mount {
  x: number;
  z: number;
  side: -1 | 1;
}
const MOUNTS: readonly Mount[] = ([-1, 1] as const).flatMap((side) =>
  WHEEL_Z.map((z) => ({ x: side * TRACK_X, z, side })),
);
export const WHEEL_COUNT = MOUNTS.length;

// Hull collider: a box with chamfered lower ends, so that the nose rides up a step.
const hullPoints = (): Float32Array => {
  const w = 1 * MU,
    top = 0.5 * MU,
    low = -0.55 * MU,
    mid = 0 * MU,
    front = -1.67 * MU,
    rear = 2.15 * MU,
    noseFoot = -1.07 * MU,
    tailFoot = 1.75 * MU;
  const ring: Array<[number, number]> = [
    [front, mid],
    [front, top],
    [rear, top],
    [rear, mid],
    [tailFoot, low],
    [noseFoot, low],
  ];
  return new Float32Array(ring.flatMap(([z, y]) => [-w, y, z, w, y, z]));
};

export class TankRig {
  params: TankParams;
  physics: PhysicsWorld;
  body: RigidBody;
  /** Spring compression per wheel in metres, 0 when the wheel hangs (read by the renderer). */
  wheelCompression: number[] = new Array<number>(WHEEL_COUNT).fill(0);
  /** Belt speed of the left and right tracks, in m/s. */
  beltSpeed: [number, number] = [0, 0];
  /** Last state written back, to detect a teleport. */
  pose: { p: number[]; q: number[] } | null = null;
  /** Vertical speed at the previous step. */
  fallSpeed = 0;
  readonly stiffness: number;
  readonly damper: number;
  readonly restLength: number;
  readonly mountY: number;

  constructor(RAPIER: Rapier, params: TankParams = TANK_PHYSICS) {
    this.params = params;
    this.physics = new PhysicsWorld(RAPIER);
    const world = this.physics.world,
      m = params.mass;
    // The mass sits low and in the middle: no rollover at the speeds the tank reaches.
    const width = 2 * MU,
      height = 1.4 * MU,
      length = 3.8 * MU;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, GROUND_CLEARANCE, 0)
        .setLinearDamping(params.linearDamping)
        .setAngularDamping(params.angularDamping)
        .setCanSleep(false)
        .setAdditionalMassProperties(
          m,
          { x: 0, y: 0, z: 0.25 * MU },
          {
            x: (m * (height * height + length * length)) / 12,
            y: (m * (width * width + length * length)) / 12,
            z: (m * (width * width + height * height)) / 12,
          },
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    const hull = RAPIER.ColliderDesc.convexHull(hullPoints());
    if (!hull) throw Error('Tank hull is degenerate');
    world.createCollider(hull.setDensity(0).setFriction(0.1).setRestitution(0), this.body);
    // Springs: the static load of one spring compresses it by `sag`; the damper gives the
    // chosen damping ratio of the hull on its twelve springs.
    this.stiffness = (m * GRAVITY) / WHEEL_COUNT / params.sag;
    this.damper = 2 * params.damping * Math.sqrt(this.stiffness * (m / WHEEL_COUNT));
    this.restLength = params.sag + params.droop;
    // The spring top is where the ground is at the springs' rest length plus the sag.
    this.mountY = -GROUND_CLEARANCE + (this.restLength - params.sag);
  }

  adopt(state: TankState): void {
    const p = state.p.map(toPhysics),
      last = this.pose;
    if (
      last &&
      Math.hypot(p[0] - last.p[0], p[1] - last.p[1], p[2] - last.p[2]) < 1e-3 &&
      Math.abs(
        state.q[0] * last.q[0] +
          state.q[1] * last.q[1] +
          state.q[2] * last.q[2] +
          state.q[3] * last.q[3],
      ) > 0.99999
    )
      return;
    this.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    this.body.setRotation({ x: state.q[0], y: state.q[1], z: state.q[2], w: state.q[3] }, true);
    this.body.setLinvel(
      { x: toPhysics(state.v[0]), y: toPhysics(state.v[1]), z: toPhysics(state.v[2]) },
      true,
    );
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.fallSpeed = 0;
  }

  // Advance `state` (the vehicle state of the game, in world units) by dt and write it back.
  step(
    state: TankState,
    controls: TankControls,
    colliders: readonly Solid[],
    dt: number,
    profile: VehicleProfile,
  ): void {
    const params = this.params,
      body = this.body,
      mass = params.mass;
    this.physics.sync(colliders);
    this.adopt(state);

    const topSpeed = toPhysics(MAP.metres(profile.maxSpeed)),
      pivotRate = profile.turn;
    const throttle =
      state.fuelAvailable === false ? 0 : Math.max(-1, Math.min(1, controls.forward || 0));
    const turn = Math.max(-1, Math.min(1, controls.turn || 0));
    // Track commands, as on a real tank: forward (Z) pushes both tracks, backward (S) pulls
    // both; turning (Q/D) adds a difference between the tracks (positive turn = left: the
    // right track pushes more, the left one less or backwards), at any speed and straight
    // from the start, so that Z+Q slows the left track a little while the tank accelerates.
    // The yaw asked for shrinks with the speed so that the tracks keep their grip: the
    // lateral acceleration (speed × yaw rate) stays below what they hold.
    const grip = 0.8 * params.sideGrip * GRAVITY;

    const q = body.rotation(),
      p = body.translation(),
      v = body.linvel(),
      w = body.angvel();
    const up = rotate(q, { x: 0, y: 1, z: 0 }),
      forward = rotate(q, { x: 0, y: 0, z: -1 }),
      right = rotate(q, { x: 1, y: 0, z: 0 });
    body.resetForces(true);
    body.resetTorques(true);

    const along = v.x * forward.x + v.y * forward.y + v.z * forward.z,
      yawRate = w.x * up.x + w.y * up.y + w.z * up.z;
    // Both tracks: the same push, whatever the steering.
    const share = (params.thrust * mass) / WHEEL_COUNT;
    let common = 0;
    if (Math.abs(throttle) > 0.05) {
      if (throttle * along < -0.3) common = -Math.sign(along) * params.brakeForce * share;
      else {
        const top = throttle > 0 ? topSpeed : topSpeed * params.reverseSpeed;
        common = throttle * share * Math.max(0, 1 - (Math.abs(along) / top) ** 2);
      }
      // A tank has the power to climb: the pull of gravity along the hull is cancelled while
      // a key is pressed, so that a step or a ramp does not slow it down.
      common +=
        (Math.abs(throttle) * params.slopeAssist * mass * GRAVITY * forward.y) / WHEEL_COUNT;
    } else common = -Math.tanh(along / params.beltSoftness) * params.coastForce * share;
    // The steering: a difference of pushes between the two tracks that drives the yaw rate
    // to the one asked for (full lock at standstill, less at speed).
    const wantedYaw = turn * Math.min(pivotRate, grip / Math.max(Math.abs(along), 0.5));
    const differential =
      params.steerThrust * share * Math.tanh((wantedYaw - yawRate) / params.yawSoftness);
    const beltSums = [0, 0],
      beltCounts = [0, 0];
    let contacts = 0;
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const mount = MOUNTS[i],
        side = mount.side < 0 ? 0 : 1;
      const local = { x: mount.x, y: this.mountY, z: mount.z },
        offset = rotate(q, local),
        origin = { x: p.x + offset.x, y: p.y + offset.y, z: p.z + offset.z };
      const hit = this.physics.world.castRay(
        new this.physics.R.Ray(origin, { x: -up.x, y: -up.y, z: -up.z }),
        this.restLength,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );
      this.wheelCompression[i] = 0;
      if (!hit) continue;
      const compression = this.restLength - hit.timeOfImpact;
      if (compression <= 0) continue;
      this.wheelCompression[i] = Math.min(compression, params.sag + params.bump);
      const contact = {
          x: origin.x - up.x * hit.timeOfImpact,
          y: origin.y - up.y * hit.timeOfImpact,
          z: origin.z - up.z * hit.timeOfImpact,
        },
        arm = { x: contact.x - p.x, y: contact.y - p.y, z: contact.z - p.z },
        // Velocity of the hull at the contact point.
        vp = {
          x: v.x + w.y * arm.z - w.z * arm.y,
          y: v.y + w.z * arm.x - w.x * arm.z,
          z: v.z + w.x * arm.y - w.y * arm.x,
        };
      const along = vp.x * forward.x + vp.y * forward.y + vp.z * forward.z,
        across = vp.x * right.x + vp.y * right.y + vp.z * right.z,
        rise = vp.x * up.x + vp.y * up.y + vp.z * up.z;
      // Spring and damper along the hull's up axis; a spring only pushes.
      const load = Math.max(0, this.stiffness * compression - this.damper * rise);
      // Tracks: grip is a share of the load. A track pushes the belt speed towards its
      // command (drive limited by the thrust, braking only by grip); sideways, the track
      // only resists sliding.
      const gripLimit = params.brakeGrip * load;
      const push = Math.max(
        -gripLimit,
        Math.min(gripLimit, common + (side === 0 ? -differential : differential)),
      );
      const sideLimit = params.sideGrip * load;
      // Dry friction, smoothed around zero so that it does not chatter at rest.
      const slide = -sideLimit * Math.tanh(across / params.slipSpeed);
      body.addForceAtPoint(
        {
          x: up.x * load + forward.x * push + right.x * slide,
          y: up.y * load + forward.y * push + right.y * slide,
          z: up.z * load + forward.z * push + right.z * slide,
        },
        contact,
        true,
      );
      beltSums[side] += along;
      beltCounts[side]++;
      contacts++;
    }
    this.beltSpeed = [
      beltCounts[0] ? beltSums[0] / beltCounts[0] : 0,
      beltCounts[1] ? beltSums[1] / beltCounts[1] : 0,
    ];
    this.physics.step(dt);

    // Write back (world units).
    const t = body.translation(),
      r = body.rotation(),
      lv = body.linvel(),
      av = body.angvel();
    // A hard landing is a sudden stop of a fast fall: the vertical speed jumps up in one step.
    if (this.fallSpeed < -FALL_KILL_SPEED && lv.y - this.fallSpeed > FALL_KILL_SPEED / 2)
      state.hp = 0;
    this.fallSpeed = lv.y;
    this.pose = { p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] };
    Object.assign(state, {
      p: [toWorld(t.x), toWorld(t.y), toWorld(t.z)],
      q: [r.x, r.y, r.z, r.w],
      v: [toWorld(lv.x), toWorld(lv.y), toWorld(lv.z)],
      omega: [av.x, av.y, av.z],
      gas: Math.abs(throttle),
      landed: contacts >= 4,
    });
    this.pose.p = state.p.map(toPhysics);
  }

  dispose(): void {
    this.physics.dispose();
  }
}
