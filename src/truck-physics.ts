import type { DynamicRayCastVehicleController, RigidBody } from '@dimforge/rapier3d-compat';
import { drawColliders, drawWheels, type DebugRig, type DebugSink } from './physics-debug.ts';
import { MAP } from './scale.ts';
import { TRAILER_LIMITS, type VehicleProfile } from './fleet.ts';
import { MODEL_DATA } from './meshy-flaktruck-data.js';
import { wheelSteering, type Wheel } from './castor-physics.ts';
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

// The anti-air truck on Rapier: a 6x4 tractor and its gun trailer, two rigid bodies
// joined by a ball hitch (three rotations, each with its own stop: yaw up to 100°, pitch
// ±26°, roll ±17°). Each has its own ray-cast wheels and springs; the tractor steers on
// its front axle (Ackermann, pivot on the rear tandem) and the trailer follows. The
// trailer swings, pitches under acceleration and braking, sways on a bend and jackknifes
// when reversing. The game's state carries its yaw (`trailerAngle`) and pitch
// (`trailerPitch`) in the tractor's frame.
//
// Scale: a real truck (6 m) and light gun trailer, at the model's 0.28 scale and the
// same gravity (Froude: mass ∝ size³, speed ∝ √size): 6 t → 130 kg, 1.5 t → 45 kg,
// 55 km/h empty or 40 km/h towing → 5.8 m/s.
const MU = MODEL_UNIT;

// Running gear, read from the model (the wheels are parts of its rig, see
// scripts/split-vehicle-parts.mjs): `wheel0…5` on the tractor (three axles, left then
// right from the front) and `trailerWheel0…3` on the trailer (two axles).
const pivot = (name: string): [number, number, number] => {
  const part = MODEL_DATA.parts.find((p: { part: string }) => p.part === name);
  if (!part) throw Error('Missing flak truck part ' + name);
  return part.pivot as [number, number, number];
};
const HITCH = {
  x: 0,
  y: pivot('trailer')[1] * MU,
  z: pivot('trailer')[2] * MU,
}; // hinge, in tractor space
export const TRACTOR_WHEELS: readonly Wheel[] = [0, 1, 2, 3, 4, 5].map((i) => {
  const [x, y, z] = pivot('wheel' + i);
  return { x: x * MU, y: y * MU, z: z * MU };
});
export const WHEEL_MODEL_RADIUS = 0.42; // measured on the wheel meshes, in model units
export const TRAILER_WHEEL_MODEL_RADIUS = 0.35;
export const WHEEL_RADIUS = WHEEL_MODEL_RADIUS * MU;
export const TRAILER_WHEEL_RADIUS = TRAILER_WHEEL_MODEL_RADIUS * MU;
// The trailer is modelled in its own frame (origin on the hitch); the part pivots are in the
// vehicle's frame, so the wheels' offsets from the hitch are the differences.
export const TRAILER_WHEELS: readonly Wheel[] = [0, 1, 2, 3].map((i) => {
  const [x, y, z] = pivot('trailerWheel' + i);
  return { x: x * MU, y: y * MU - HITCH.y, z: z * MU - HITCH.z };
});
const FRONT_Z = TRACTOR_WHEELS[0].z;
// The tandem's middle is the pivot of the steering geometry.
export const PIVOT_Z = (TRACTOR_WHEELS[2].z + TRACTOR_WHEELS[4].z) / 2;
export const PIVOT_MODEL_Z = PIVOT_Z / MU; // the same, in model units (the renderer's)
export const WHEELBASE = PIVOT_Z - FRONT_Z;
export const WHEELBASE_MODEL = WHEELBASE / MU;
// Stops of the ball hitch, a little inside what the game accepts (TRAILER_LIMITS).
export const HITCH_LIMITS = Object.freeze({
  yaw: TRAILER_LIMITS.yaw - 0.05,
  pitch: TRAILER_LIMITS.pitch - 0.05,
  roll: 0.3,
});

// Rapier's wheel brake is not a force: it is a friction impulse, so the deceleration of a
// chassis is the brake value times the wheel count over its mass. Measured on the 130 kg
// tractor: a brake value b per wheel decelerates by about 4.8·b m/s² (see test-truck-physics.mjs).
const BRAKE_PER_DECEL = 1 / 4.8;

export const TRUCK_PHYSICS = Object.freeze({
  tractorMass: 130, // kg
  trailerMass: 45, // kg
  tractorCom: -0.3, // model units above the origin: a low centre of mass, no rollover
  trailerCom: -0.2,
  accel: 1.2, // m/s² at standstill (loaded 6x4): calm, the former 2.4 was too brisk
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
  topMargin: 1.03,
  lift: 0.18, // model units: spring top above the wheel centre
  ride: 0.073, // model units added to the spring length, to offset the sag: the hull rests at the model's ride height
  trailerRide: 0.05, // same for the trailer's wheels: the trailer rests level
  linearDamping: 0.01, // small: at the doubled top speed the drag would eat half the thrust
  angularDamping: 1,
  hitchDamping: 0.6, // N·m·s/rad of friction in the hitch (keeps the trailer from ringing)
  hitchSpring: 300, // N·m/rad: a sway-control hitch pulls the trailer back in line (a trailer is
  // unstable backwards, and the short drawbar makes it fast); weak enough to jackknife
  hitchStop: 4000, // N·m/rad: stiffness of the hitch stops
  hitchStopDamping: 180, // N·m·s/rad: damping of the stops
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
  /** Yaw of the trailer in the tractor's frame (rad, positive to the left). */
  trailerAngle?: number;
  /** Pitch of the trailer in the tractor's frame (rad, positive nose up). */
  trailerPitch?: number;
  /** Angle of the front wheels asked for by the driver (rad, positive to the left). */
  steer?: number;
}
export interface TruckControls {
  forward?: number;
  turn?: number;
}

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
const pitchQuaternion = (angle: number) => ({
  x: Math.sin(angle / 2),
  y: 0,
  z: 0,
  w: Math.cos(angle / 2),
});
const rollQuaternion = (angle: number) => ({
  x: 0,
  y: 0,
  z: Math.sin(angle / 2),
  w: Math.cos(angle / 2),
});
type Quat = { x: number; y: number; z: number; w: number };
const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
// Rotation = yaw (about Y) · pitch (about X) · roll (about Z): three.js's 'YXZ' order.
const eulerYXZ = (q: Quat) => ({
  yaw: Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)),
  pitch: Math.asin(Math.max(-1, Math.min(1, -2 * (q.y * q.z - q.w * q.x)))),
  roll: Math.atan2(2 * (q.x * q.y + q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z)),
});

export class TruckRig implements DebugRig {
  params: TruckParams;
  physics: PhysicsWorld;
  tractor: RigidBody;
  trailer: RigidBody;
  tractorWheels: DynamicRayCastVehicleController;
  trailerWheels: DynamicRayCastVehicleController;
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
          { x: 0, y: params.trailerCom * MU, z: 1.5 * MU },
          box(params.trailerMass, 1.8 * MU, 1.2 * MU, 3.4 * MU),
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.9 * MU, 0.6 * MU, 1.6 * MU)
        .setTranslation(0, 0.3 * MU, 1.45 * MU)
        .setDensity(0)
        .setFriction(0)
        .setRestitution(0),
      this.trailer,
    );
    // A ball hitch: the stops on each rotation are soft torques, applied in step().
    const joint = world.createImpulseJoint(
      RAPIER.JointData.spherical(HITCH, { x: 0, y: 0, z: 0 }),
      this.tractor,
      this.trailer,
      true,
    );
    joint.setContactsEnabled(false);
    this.tractorWheels = this.addWheels(
      world.createVehicleController(this.tractor),
      TRACTOR_WHEELS,
      WHEEL_RADIUS,
      params.stiffness,
      params.ride,
    );
    this.trailerWheels = this.addWheels(
      world.createVehicleController(this.trailer),
      TRAILER_WHEELS,
      TRAILER_WHEEL_RADIUS,
      params.trailerStiffness,
      params.trailerRide,
    );
  }

  private addWheels(
    vehicle: DynamicRayCastVehicleController,
    wheels: readonly Wheel[],
    radius: number,
    stiffness: number,
    ride: number,
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
        lift + (0.04 + ride) * MU,
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
  /** Debug view (physics-debug.ts): the tractor and the trailer with their wheels' springs. */
  debugDraw(sink: DebugSink): void {
    drawColliders(this.physics.world, [this.tractor, this.trailer], sink);
    drawWheels(this.tractorWheels, this.tractor, sink, this.tractor.mass() * GRAVITY);
    drawWheels(this.trailerWheels, this.trailer, sink, this.trailer.mass() * GRAVITY);
  }

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
      yaw = Math.max(-HITCH_LIMITS.yaw, Math.min(HITCH_LIMITS.yaw, state.trailerAngle || 0)),
      pitch = Math.max(-HITCH_LIMITS.pitch, Math.min(HITCH_LIMITS.pitch, state.trailerPitch || 0)),
      v = { x: toPhysics(state.v[0]), y: toPhysics(state.v[1]), z: toPhysics(state.v[2]) },
      hinge = rotate(q, HITCH);
    this.tractor.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    this.tractor.setRotation(q, true);
    this.tractor.setLinvel(v, true);
    this.tractor.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.trailer.setTranslation({ x: p[0] + hinge.x, y: p[1] + hinge.y, z: p[2] + hinge.z }, true);
    this.trailer.setRotation(compose(compose(q, yawQuaternion(yaw)), pitchQuaternion(pitch)), true);
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
      // Only the front axle steers: the two rear axles are fixed.
      this.tractorWheels.setWheelSteering(
        i,
        wheel.z === FRONT_Z ? wheelSteering(this.steer, wheel, PIVOT_Z, WHEELBASE) : 0,
      );
    });
    TRAILER_WHEELS.forEach((_, i) => {
      this.trailerWheels.setWheelBrake(
        i,
        brake * params.trailerBrake * BRAKE_PER_DECEL * (params.trailerMass / params.tractorMass),
      );
    });

    this.hitchTorques();

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
    // The trailer's yaw and pitch relative to the tractor, in the tractor's frame.
    const hitch = eulerYXZ(compose(conjugate(r), tq));
    Object.assign(state, {
      p: [toWorld(t.x), toWorld(t.y), toWorld(t.z)],
      q: [r.x, r.y, r.z, r.w],
      v: [toWorld(lv.x), toWorld(lv.y), toWorld(lv.z)],
      omega: [av.x, av.y, av.z],
      gas: Math.abs(throttle),
      landed: contacts >= 4,
      trailerAngle: Math.max(-TRAILER_LIMITS.yaw, Math.min(TRAILER_LIMITS.yaw, hitch.yaw)),
      trailerPitch: Math.max(-TRAILER_LIMITS.pitch, Math.min(TRAILER_LIMITS.pitch, hitch.pitch)),
      steer: this.steer,
    });
    this.pose.p = state.p.map(toPhysics);
  }

  // Friction and stops of the ball hitch, as torques on the two bodies about the axes of the
  // yaw · pitch · roll decomposition of the trailer's rotation in the tractor's frame.
  private hitchTorques(): void {
    const params = this.params,
      tractor = this.tractor,
      trailer = this.trailer;
    tractor.resetTorques(true);
    trailer.resetTorques(true);
    const r = tractor.rotation(),
      angles = eulerYXZ(compose(conjugate(r), trailer.rotation())),
      wt = tractor.angvel(),
      wr = trailer.angvel(),
      spin = { x: wr.x - wt.x, y: wr.y - wt.y, z: wr.z - wt.z };
    const yawFrame = compose(r, yawQuaternion(angles.yaw)),
      pitchFrame = compose(yawFrame, pitchQuaternion(angles.pitch));
    const axes = [
      { angle: angles.yaw, limit: HITCH_LIMITS.yaw, axis: rotate(r, { x: 0, y: 1, z: 0 }) },
      {
        angle: angles.pitch,
        limit: HITCH_LIMITS.pitch,
        axis: rotate(yawFrame, { x: 1, y: 0, z: 0 }),
      },
      {
        angle: angles.roll,
        limit: HITCH_LIMITS.roll,
        axis: rotate(pitchFrame, { x: 0, y: 0, z: 1 }),
      },
    ];
    axes.forEach(({ angle, limit, axis }, index) => {
      const rate = spin.x * axis.x + spin.y * axis.y + spin.z * axis.z;
      let torque = -params.hitchDamping * rate;
      if (index === 0) torque -= params.hitchSpring * angle;
      const excess = Math.abs(angle) - limit;
      if (excess > 0)
        torque -= Math.sign(angle) * params.hitchStop * excess + params.hitchStopDamping * rate;
      const push = { x: axis.x * torque, y: axis.y * torque, z: axis.z * torque };
      trailer.addTorque(push, true);
      tractor.addTorque({ x: -push.x, y: -push.y, z: -push.z }, true);
    });
  }

  dispose(): void {
    this.physics.dispose();
  }
}
