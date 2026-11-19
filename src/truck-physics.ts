import type {
  DynamicRayCastVehicleController,
  RevoluteImpulseJoint,
  RigidBody,
} from '@dimforge/rapier3d-compat';
import { MAP } from './scale.ts';
import type { VehicleProfile } from './fleet.ts';
import { BRAKE_PER_DECEL, wheelSteering, type Wheel } from './castor-physics.ts';
import {
  FALL_KILL_SPEED,
  MODEL_UNIT,
  PhysicsWorld,
  rotate,
  toPhysics,
  toWorld,
  type Rapier,
  type Solid,
} from './physics-world.ts';

// The anti-air truck on Rapier: a 6x4 tractor and its gun trailer, two rigid bodies
// joined by a hitch that turns about the vertical axis. Each has its own ray-cast
// wheels and springs; the tractor steers on its front axle (Ackermann, pivot on the
// rear tandem) and the trailer follows. The trailer swings, pushes the tractor when
// braking (its overrun brake only slows it), sways on a bend and jackknifes when
// reversing: the hitch stops at the same ±0.65 rad the server accepts.
//
// Scale: a real truck (6 m) and light gun trailer, at the model's 0.28 scale and the
// same gravity (Froude: mass ∝ size³, speed ∝ √size): 6 t → 130 kg, 1.5 t → 45 kg,
// 55 km/h empty or 40 km/h towing → 5.8 m/s.
const MU = MODEL_UNIT;

// Running gear, measured on the model's low vertices (model units): `body` has three
// axles (z = -3.6, -1.2, -0.2), `trailer` two (z = 1.6, 2.4), wheels at |x| 0.72.
const HITCH = { x: 0, y: -0.18 * MU, z: 0.98 * MU }; // hinge, in tractor space
const TRACTOR_WHEELS: readonly Wheel[] = [-3.6, -1.2, -0.2].flatMap((z) =>
  [-1, 1].map((side) => ({ x: side * 0.72 * MU, y: -0.45 * MU, z: z * MU })),
);
const TRAILER_WHEELS: readonly Wheel[] = [1.6, 2.4].flatMap((z) =>
  [-1, 1].map((side) => ({
    x: side * 0.75 * MU,
    y: -0.5 * MU - HITCH.y, // in trailer space (origin on the hitch)
    z: z * MU - HITCH.z,
  })),
);
const WHEEL_RADIUS = 0.35 * MU;
const TRAILER_WHEEL_RADIUS = 0.3 * MU;
const FRONT_Z = -3.6 * MU;
const PIVOT_Z = -0.7 * MU; // middle of the rear tandem
const WHEELBASE = PIVOT_Z - FRONT_Z;
export const HITCH_LIMIT = 0.62; // rad: a little inside the server's clamp (0.65)

export const TRUCK_PHYSICS = Object.freeze({
  tractorMass: 130, // kg
  trailerMass: 45, // kg
  tractorCom: -0.3, // model units above the origin: a low centre of mass, no rollover
  trailerCom: -0.2,
  accel: 2.4, // m/s² at standstill (loaded 6x4)
  reverseSpeed: 0.5, // share of the top speed
  brake: 5.5, // m/s² when the throttle opposes the motion
  trailerBrake: 0.5, // share of the braking the trailer's overrun brake adds
  coast: 1.1,
  hold: 3.5,
  maxLateral: 2.8, // m/s² the steering may ask of the tyres (0.29 g, a loaded truck)
  steerLock: 0.5, // rad of front-wheel angle at standstill
  steerRate: 1.8, // rad/s the steering wheel is turned or released
  tyreGrip: 1.4,
  stiffness: 60, // softer than the Castor's 100: a light truck on stiffer springs bounces and rolls
  compression: 2.3,
  relaxation: 2.8,
  trailerStiffness: 60,
  topMargin: 1.06,
  lift: 0.18, // model units: spring top above the wheel centre
  ride: 0.054, // model units added to the spring length, to offset the sag: the hull rests at the model's ride height
  linearDamping: 0.05,
  angularDamping: 1,
  hitchDamping: 0.6, // N·m·s/rad of friction in the hitch (keeps the trailer from ringing)
});
export type TruckParams = typeof TRUCK_PHYSICS;

export const steerLimit = (speed: number, params: TruckParams = TRUCK_PHYSICS): number =>
  Math.min(
    params.steerLock,
    Math.atan((WHEELBASE * params.maxLateral) / Math.max(speed * speed, 1e-6)),
  );

/** The part of a vehicle state this rig reads and writes (world units). */
export interface TruckState {
  p: number[];
  q: number[];
  v: number[];
  hp: number;
  omega?: number[];
  gas?: number;
  landed?: boolean;
  fuelAvailable?: boolean;
  trailerAngle?: number;
}
export interface TruckControls {
  forward?: number;
  turn?: number;
}

const yawOf = (q: { x: number; y: number; z: number; w: number }): number =>
  Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
const compose = (
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number },
) => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
const yawQuaternion = (angle: number) => ({
  x: 0,
  y: Math.sin(angle / 2),
  z: 0,
  w: Math.cos(angle / 2),
});

export class TruckRig {
  params: TruckParams;
  physics: PhysicsWorld;
  tractor: RigidBody;
  trailer: RigidBody;
  tractorWheels: DynamicRayCastVehicleController;
  trailerWheels: DynamicRayCastVehicleController;
  hitch: RevoluteImpulseJoint;
  steer = 0;
  /** Last state written back, to detect a teleport. */
  pose: { p: number[]; q: number[] } | null = null;
  /** Vertical speed at the previous step. */
  fallSpeed = 0;

  constructor(RAPIER: Rapier, params: TruckParams = TRUCK_PHYSICS) {
    this.params = params;
    this.physics = new PhysicsWorld(RAPIER);
    const world = this.physics.world;
    const box = (m: number, width: number, height: number, length: number) => ({
      x: (m * (height * height + length * length)) / 12,
      y: (m * (width * width + length * length)) / 12,
      z: (m * (width * width + height * height)) / 12,
    });
    // Tractor: hull from the model's tractor box, mass low and forward (engine).
    this.tractor = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.8 * MU, 0)
        .setLinearDamping(params.linearDamping)
        .setAngularDamping(params.angularDamping)
        .setCanSleep(false)
        .setAdditionalMassProperties(
          params.tractorMass,
          { x: 0, y: params.tractorCom * MU, z: -1.6 * MU },
          box(params.tractorMass, 2.1 * MU, 1.6 * MU, 5.2 * MU),
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.05 * MU, 0.8 * MU, 2.58 * MU)
        .setTranslation(0, 0.25 * MU, -1.7 * MU)
        .setDensity(0)
        .setFriction(0)
        .setRestitution(0),
      this.tractor,
    );
    // Trailer: origin on the hitch, deck box and a low centre of mass.
    this.trailer = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(HITCH.x, 0.8 * MU + HITCH.y, HITCH.z)
        .setLinearDamping(params.linearDamping)
        .setAngularDamping(params.angularDamping)
        .setCanSleep(false)
        .setAdditionalMassProperties(
          params.trailerMass,
          { x: 0, y: params.trailerCom * MU, z: 0.6 * MU },
          box(params.trailerMass, 1.8 * MU, 1.2 * MU, 3.4 * MU),
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.9 * MU, 0.65 * MU, 1.7 * MU)
        .setTranslation(0, 0.2 * MU, 0.6 * MU)
        .setDensity(0)
        .setFriction(0)
        .setRestitution(0),
      this.trailer,
    );
    // The hitch turns about the vertical axis only, within the limit.
    this.hitch = world.createImpulseJoint(
      RAPIER.JointData.revolute(HITCH, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
      this.tractor,
      this.trailer,
      true,
    ) as RevoluteImpulseJoint;
    this.hitch.setLimits(-HITCH_LIMIT, HITCH_LIMIT);
    this.hitch.setContactsEnabled(false);
    this.tractorWheels = this.addWheels(
      world.createVehicleController(this.tractor),
      TRACTOR_WHEELS,
      WHEEL_RADIUS,
      params.stiffness,
    );
    this.trailerWheels = this.addWheels(
      world.createVehicleController(this.trailer),
      TRAILER_WHEELS,
      TRAILER_WHEEL_RADIUS,
      params.trailerStiffness,
    );
  }

  private addWheels(
    vehicle: DynamicRayCastVehicleController,
    wheels: readonly Wheel[],
    radius: number,
    stiffness: number,
  ): DynamicRayCastVehicleController {
    const params = this.params;
    // The wheel mounts sit above the rest height by the spring's sag, so that the
    // hull rests at the model's ride height (0.8 model units above the ground).
    const lift = params.lift * MU;
    for (const w of wheels)
      vehicle.addWheel(
        { x: w.x, y: w.y + lift, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
        lift + (0.04 + params.ride) * MU,
        radius,
      );
    for (let i = 0; i < wheels.length; i++) {
      vehicle.setWheelSuspensionStiffness(i, stiffness);
      vehicle.setWheelSuspensionCompression(i, this.params.compression);
      vehicle.setWheelSuspensionRelaxation(i, this.params.relaxation);
      vehicle.setWheelMaxSuspensionTravel(i, 0.3 * MU);
      vehicle.setWheelMaxSuspensionForce(i, 1e5);
      vehicle.setWheelFrictionSlip(i, this.params.tyreGrip);
      vehicle.setWheelSideFrictionStiffness(i, 1);
    }
    return vehicle;
  }

  // Place both bodies from the game's state when it is not the one this rig wrote.
  adopt(state: TruckState): void {
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
    const q = { x: state.q[0], y: state.q[1], z: state.q[2], w: state.q[3] },
      angle = Math.max(-HITCH_LIMIT, Math.min(HITCH_LIMIT, state.trailerAngle || 0)),
      v = { x: toPhysics(state.v[0]), y: toPhysics(state.v[1]), z: toPhysics(state.v[2]) },
      hinge = rotate(q, HITCH);
    this.tractor.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    this.tractor.setRotation(q, true);
    this.tractor.setLinvel(v, true);
    this.tractor.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.trailer.setTranslation({ x: p[0] + hinge.x, y: p[1] + hinge.y, z: p[2] + hinge.z }, true);
    this.trailer.setRotation(compose(q, yawQuaternion(angle)), true);
    this.trailer.setLinvel(v, true);
    this.trailer.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.fallSpeed = 0;
  }

  // Advance `state` (the vehicle state of the game, in world units) by dt and write it back.
  step(
    state: TruckState,
    controls: TruckControls,
    colliders: readonly Solid[],
    dt: number,
    profile: VehicleProfile,
  ): void {
    const params = this.params;
    this.physics.sync(colliders);
    this.adopt(state);
    const vmax = toPhysics(MAP.metres(profile.maxSpeed));
    const throttle =
      state.fuelAvailable === false ? 0 : Math.max(-1, Math.min(1, controls.forward || 0));
    const forward = rotate(this.tractor.rotation(), { x: 0, y: 0, z: -1 }),
      v = this.tractor.linvel(),
      along = v.x * forward.x + v.y * forward.y + v.z * forward.z;

    const limit = steerLimit(Math.abs(along), params);
    this.steer += Math.max(
      -params.steerRate * dt,
      Math.min(params.steerRate * dt, (controls.turn || 0) * limit - this.steer),
    );
    this.steer = Math.max(-limit, Math.min(limit, this.steer));

    let engine = 0,
      brake = 0;
    if (Math.abs(throttle) > 0.05) {
      if (throttle * along < -0.3) brake = params.brake;
      else {
        const top = (throttle > 0 ? vmax : vmax * params.reverseSpeed) * params.topMargin;
        engine =
          Math.sign(throttle) *
          Math.abs(throttle) *
          params.accel *
          Math.max(0, 1 - (Math.abs(along) / top) ** 2);
      }
    } else brake = Math.abs(along) < 0.25 ? params.hold : params.coast;
    // 6x4: the two rear axles drive; every wheel brakes; the trailer's overrun brake
    // follows the truck's.
    const total = params.tractorMass + params.trailerMass;
    TRACTOR_WHEELS.forEach((wheel, i) => {
      this.tractorWheels.setWheelEngineForce(
        i,
        wheel.z > FRONT_Z + 1e-6 ? (engine * total) / 4 : 0,
      );
      this.tractorWheels.setWheelBrake(i, brake * BRAKE_PER_DECEL);
      this.tractorWheels.setWheelSteering(i, wheelSteering(this.steer, wheel, PIVOT_Z, WHEELBASE));
    });
    TRAILER_WHEELS.forEach((_, i) => {
      this.trailerWheels.setWheelBrake(i, brake * params.trailerBrake * BRAKE_PER_DECEL);
    });

    // Friction in the hitch: a torque against the relative yaw rate.
    const wt = this.tractor.angvel(),
      wr = this.trailer.angvel(),
      relative = (wr.y - wt.y) * params.hitchDamping;
    this.trailer.resetTorques(true);
    this.tractor.resetTorques(true);
    this.trailer.addTorque({ x: 0, y: -relative, z: 0 }, true);
    this.tractor.addTorque({ x: 0, y: relative, z: 0 }, true);

    this.tractorWheels.updateVehicle(dt);
    this.trailerWheels.updateVehicle(dt);
    this.physics.step(dt);

    const t = this.tractor.translation(),
      r = this.tractor.rotation(),
      lv = this.tractor.linvel(),
      av = this.tractor.angvel(),
      tq = this.trailer.rotation();
    let contacts = 0;
    for (let i = 0; i < TRACTOR_WHEELS.length; i++)
      if (this.tractorWheels.wheelIsInContact(i)) contacts++;
    if (this.fallSpeed < -FALL_KILL_SPEED && lv.y - this.fallSpeed > FALL_KILL_SPEED / 2)
      state.hp = 0;
    this.fallSpeed = lv.y;
    this.pose = { p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] };
    // Trailer angle: its yaw relative to the tractor, in the tractor's frame.
    const rel = compose({ x: -r.x, y: -r.y, z: -r.z, w: r.w }, tq);
    Object.assign(state, {
      p: [toWorld(t.x), toWorld(t.y), toWorld(t.z)],
      q: [r.x, r.y, r.z, r.w],
      v: [toWorld(lv.x), toWorld(lv.y), toWorld(lv.z)],
      omega: [av.x, av.y, av.z],
      gas: Math.abs(throttle),
      landed: contacts >= 4,
      trailerAngle: Math.max(-HITCH_LIMIT, Math.min(HITCH_LIMIT, yawOf(rel))),
    });
    this.pose.p = state.p.map(toPhysics);
  }

  dispose(): void {
    this.physics.dispose();
  }
}
