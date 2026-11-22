import type { DynamicRayCastVehicleController, RigidBody } from '@dimforge/rapier3d-compat';
import { drawColliders, drawWheels, type DebugRig, type DebugSink } from './physics-debug.ts';
import { MODEL_DATA } from './meshy-castor-data.js';
import { MAP } from './scale.ts';
import { ackermannAngle } from './castor-wheels.ts';
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

export { FALL_KILL_SPEED };

export interface Wheel {
  x: number;
  y: number;
  z: number;
}
/** The part of a vehicle state this rig reads and writes (world units). */
export interface CastorState {
  p: number[];
  q: number[];
  v: number[];
  hp: number;
  omega?: number[];
  gas?: number;
  landed?: boolean;
  fuelAvailable?: boolean;
}
export interface CastorControls {
  forward?: number;
  turn?: number;
}

// The Castor on Rapier: a rigid chassis on a ray-cast 6x6 (one ray and one spring
// per wheel), driven like a real wheeled vehicle instead of the arcade tank step.
// All values are physics units (metres, kilograms, seconds, 9.81 m/s²), see
// physics-world.js; wheel positions come from the vehicle model.
const MU = MODEL_UNIT;
const wheelParts = MODEL_DATA.parts.filter((p) => /^wheel\d+$/.test(p.part));
export const WHEELS: readonly Wheel[] = wheelParts.map(({ pivot }) => ({
  x: pivot[0] * MU,
  y: pivot[1] * MU,
  z: pivot[2] * MU,
}));
export const WHEEL_RADIUS = MODEL_DATA.wheelRadius * MU;
// Axles: forward is -z. The front axle steers; the rear axles steer the other
// way around the pivot (the middle axle), as on a real multi-axle truck, so that
// no axle drags its tyres sideways.
const FRONT_Z = Math.min(...WHEELS.map((w) => w.z));
const axleZ = [...new Set(WHEELS.map((w) => w.z.toFixed(3)))]
  .map((key) => {
    const group = WHEELS.filter((w) => w.z.toFixed(3) === key);
    return group.reduce((sum, w) => sum + w.z, 0) / group.length;
  })
  .sort((a, b) => a - b);
const PIVOT_Z = axleZ[1];
export const WHEELBASE = PIVOT_Z - FRONT_Z; // front axle to steering pivot

// Rapier's wheel brake is not a force: measured on this chassis (400 kg, six
// wheels) a brake value b per wheel decelerates by about 1.85·b m/s² up to the
// grip limit. See test-castor-physics.mjs, which checks the resulting decelerations.
export const BRAKE_PER_DECEL = 0.54;

export const CASTOR_PHYSICS = Object.freeze({
  mass: 400, // kg
  accel: 2.5, // m/s² at standstill, full throttle: a progressive start (issue #171), calmer than the former 4
  reverseSpeed: 0.5, // share of the top speed
  topMargin: 1.1, // thrust fades towards this multiple of the top speed: drag makes up the rest
  brake: 7, // m/s² when the throttle opposes the motion
  coast: 1.2, // m/s² of engine braking without throttle
  hold: 4, // m/s² holding the vehicle still when stopped without throttle
  maxLateral: 5.5, // m/s²: what the steering may ask of the tyres (0.56 g)
  steerLock: 0.55, // rad of front-wheel angle at standstill
  steerRate: 2.4, // rad/s the steering wheel is turned or released
  tyreGrip: 1.6, // friction slip: about 1.6 g of grip before sliding
  stiffness: 100,
  compression: 2.3,
  relaxation: 2.8,
  linearDamping: 0.05,
  angularDamping: 1,
});

export type CastorParams = typeof CASTOR_PHYSICS;

// Wheels steer to roll about one centre: front positive (left), rear opposite.
// delta is the front-axle angle on the centre line; positive turns left.
export function wheelSteering(
  delta: number,
  wheel: Wheel,
  pivotZ = PIVOT_Z,
  wheelbase = WHEELBASE,
): number {
  return ackermannAngle(delta, wheel, pivotZ, wheelbase);
}
// Largest front-wheel angle at this speed: the full lock when slow, then only as
// much as the tyres can grip (lateral acceleration v²·tan(delta)/wheelbase).
export function steerLimit(speed: number, params: CastorParams = CASTOR_PHYSICS): number {
  const v2 = Math.max(speed * speed, 1e-6);
  return Math.min(params.steerLock, Math.atan((WHEELBASE * params.maxLateral) / v2));
}

export class CastorRig implements DebugRig {
  params: CastorParams;
  physics: PhysicsWorld;
  body: RigidBody;
  vehicle: DynamicRayCastVehicleController;
  steer = 0;
  /** Last state written back, to detect a teleport. */
  pose: { p: number[]; q: number[] } | null = null;
  /** Vertical speed at the previous step. */
  fallSpeed = 0;

  constructor(RAPIER: Rapier, params: CastorParams = CASTOR_PHYSICS) {
    this.params = params;
    this.physics = new PhysicsWorld(RAPIER);
    const world = this.physics.world;
    // Mass sits low (just above the axles) so the vehicle does not roll over;
    // the hull collider itself is massless.
    const width = 2.4 * MU,
      height = 1.6 * MU,
      length = 6 * MU,
      m = params.mass,
      comY = 0.1 * MU;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.8 * MU, 0)
        .setLinearDamping(params.linearDamping)
        .setAngularDamping(params.angularDamping)
        .setCanSleep(false)
        .setAdditionalMassProperties(
          m,
          { x: 0, y: comY, z: 0 },
          {
            x: (m * (height * height + length * length)) / 12,
            y: (m * (width * width + length * length)) / 12,
            z: (m * (width * width + height * height)) / 12,
          },
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.2 * MU, 0.9 * MU, 3 * MU)
        .setTranslation(0, 0.2 * MU, 0)
        .setDensity(0)
        .setFriction(0)
        .setRestitution(0),
      this.body,
    );
    this.vehicle = world.createVehicleController(this.body);
    const lift = 0.12 * MU;
    for (const w of WHEELS)
      this.vehicle.addWheel(
        { x: w.x, y: w.y + lift, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
        lift + 0.04 * MU,
        WHEEL_RADIUS,
      );
    for (let i = 0; i < WHEELS.length; i++) {
      this.vehicle.setWheelSuspensionStiffness(i, params.stiffness);
      this.vehicle.setWheelSuspensionCompression(i, params.compression);
      this.vehicle.setWheelSuspensionRelaxation(i, params.relaxation);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.3 * MU);
      this.vehicle.setWheelMaxSuspensionForce(i, 1e5);
      this.vehicle.setWheelFrictionSlip(i, params.tyreGrip);
      this.vehicle.setWheelSideFrictionStiffness(i, 1);
    }
  }

  // The game moves vehicles too (placement, respawn): follow its state when it
  // is not the one this rig wrote at the previous step.
  /** Debug view (physics-debug.ts): the chassis and each wheel's spring. */
  debugDraw(sink: DebugSink): void {
    drawColliders(this.physics.world, [this.body], sink);
    drawWheels(this.vehicle, this.body, sink, this.params.mass * GRAVITY);
  }

  adopt(state: CastorState): void {
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
    this.steer = 0;
    this.fallSpeed = 0;
  }

  // Advance `state` (the vehicle state of the game, in world units) by dt and write it back.
  step(
    state: CastorState,
    controls: CastorControls,
    colliders: readonly Solid[],
    dt: number,
    profile: VehicleProfile,
  ): void {
    const params = this.params,
      body = this.body,
      vehicle = this.vehicle;
    this.physics.sync(colliders);
    this.adopt(state);
    const vmax = toPhysics(MAP.metres(profile.maxSpeed));
    const throttle =
      state.fuelAvailable === false ? 0 : Math.max(-1, Math.min(1, controls.forward || 0));
    const forward = rotate(body.rotation(), { x: 0, y: 0, z: -1 }),
      v = body.linvel(),
      along = v.x * forward.x + v.y * forward.y + v.z * forward.z;

    // Steering: the wheel is turned at a limited rate, and the lock closes with
    // speed so that the tyres keep their grip. Reversing flips the yaw naturally.
    const target = (controls.turn || 0) * steerLimit(Math.abs(along), params);
    const rate = params.steerRate * dt;
    this.steer += Math.max(-rate, Math.min(rate, target - this.steer));
    this.steer = Math.max(
      -steerLimit(Math.abs(along), params),
      Math.min(steerLimit(Math.abs(along), params), this.steer),
    );

    // Engine and brakes: throttle against the motion brakes first, then reverses.
    const n = WHEELS.length;
    let engine = 0,
      brake = 0;
    if (Math.abs(throttle) > 0.05) {
      if (throttle * along < -0.3) brake = params.brake;
      else {
        const top = (throttle > 0 ? vmax : vmax * params.reverseSpeed) * params.topMargin;
        const share = Math.max(0, 1 - (Math.abs(along) / top) ** 2);
        engine = Math.sign(throttle) * Math.abs(throttle) * params.accel * share;
      }
    } else brake = Math.abs(along) < 0.25 ? params.hold : params.coast;
    for (let i = 0; i < n; i++) {
      vehicle.setWheelEngineForce(i, (engine * params.mass) / n);
      vehicle.setWheelBrake(i, brake * BRAKE_PER_DECEL);
      vehicle.setWheelSteering(i, wheelSteering(this.steer, WHEELS[i]));
    }
    vehicle.updateVehicle(dt);
    this.physics.step(dt);

    // Write back (world units). Landing: three wheels on the ground.
    const t = body.translation(),
      r = body.rotation(),
      lv = body.linvel(),
      av = body.angvel();
    let contacts = 0;
    for (let i = 0; i < n; i++) if (vehicle.wheelIsInContact(i)) contacts++;
    const grounded = contacts >= 3;
    // A hard landing is a sudden stop of a fast fall (the hull may hit first, the
    // wheels may never touch): the vertical speed jumps up in a single step.
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
      landed: grounded,
    });
    // Physics positions round-trip through world units: keep the written pose
    // identical to the state the game will hand back.
    this.pose.p = state.p.map(toPhysics);
  }

  dispose(): void {
    this.physics.dispose();
  }
}
