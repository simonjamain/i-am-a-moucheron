import type * as THREE from 'three';
// Castor 6×6 wheel kinematics (model units; the vehicle model is scaled by
// ACTOR_UNIT). Rolling without slipping: each wheel spins at its own ground
// speed, forward speed plus the yaw contribution of its lateral offset, so a
// pivot on the spot turns the left and right wheels in opposite directions.
export const CASTOR_WHEEL_RADIUS = 0.57;
export const CASTOR_MAX_STEER = 0.5;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

// Signed forward speed and yaw rate of a displayed model between two frames.
/** Per-model memory kept in `userData.wheelMemory` between frames. */
export interface WheelMemory {
  yaw?: number;
  yawRate?: number;
}
export interface GroundMotion {
  forwardSpeed: number;
  yawRate: number;
}
export interface WheelOptions {
  scale: number;
  turnRate: number;
}
export interface WheelPose {
  spin: number;
  steer: number;
}

export function trackGroundMotion(
  memory: WheelMemory,
  yaw: number,
  forwardSpeed: number,
  dt: number,
): GroundMotion {
  const previous = memory.yaw;
  memory.yaw = yaw;
  if (previous === undefined || !(dt > 0)) {
    memory.yawRate = 0;
    return { forwardSpeed, yawRate: 0 };
  }
  const measured = wrap(yaw - previous) / dt;
  // Smooth network interpolation noise without delaying a stop for long.
  memory.yawRate =
    (memory.yawRate || 0) + (measured - (memory.yawRate || 0)) * Math.min(1, dt * 15);
  if (Math.abs(memory.yawRate) < 1e-4) memory.yawRate = 0;
  return { forwardSpeed, yawRate: memory.yawRate };
}

// wheel: { x, z } in model units (forward is -z). Returns the spin increment
// around the axle (negative = rolling forward) and the steering angle.
export function wheelPose(
  wheel: { x: number; z: number },
  { forwardSpeed, yawRate }: GroundMotion,
  { scale, turnRate, frontZ }: WheelOptions & { frontZ: number },
  dt: number,
): WheelPose {
  const groundSpeed = forwardSpeed + yawRate * wheel.x * scale;
  const spin = (-groundSpeed / (CASTOR_WHEEL_RADIUS * scale)) * dt;
  const turn = turnRate > 0 ? Math.max(-1, Math.min(1, yawRate / turnRate)) : 0;
  const steeringDirection = forwardSpeed < -0.0001 ? -1 : 1;
  const steer = wheel.z <= frontZ ? turn * CASTOR_MAX_STEER * steeringDirection : 0;
  return { spin, steer };
}

export function animateCastorWheels(
  wheels: readonly THREE.Object3D[],
  motion: GroundMotion,
  options: WheelOptions,
  dt: number,
): void {
  const frontZ = Math.min(...wheels.map((w) => w.position.z));
  for (const axle of wheels) {
    const { spin, steer } = wheelPose(
      { x: axle.position.x, z: axle.position.z },
      motion,
      { ...options, frontZ },
      dt,
    );
    axle.rotation.order = 'YXZ';
    axle.rotation.x = (axle.rotation.x + spin) % (2 * Math.PI);
    axle.rotation.y = steer;
  }
}

// Ackermann geometry: the angle of a wheel (positive to the left) when the front axle is
// turned by `delta` on the centre line, so that every wheel rolls about one centre on the
// line of the axle at `pivotZ`. Any consistent unit; forward is -z.
export function ackermannAngle(
  delta: number,
  wheel: { x: number; z: number },
  pivotZ: number,
  wheelbase: number,
): number {
  if (Math.abs(delta) < 1e-6) return 0;
  const radius = wheelbase / Math.tan(delta); // signed: positive centre on the left
  return Math.atan((pivotZ - wheel.z) / (radius + wheel.x));
}

// The wheels of a vehicle whose driver turns the front axle (the anti-air truck): the front
// wheels take the angle the driver asked for, which exists even at a standstill and travels
// with the vehicle's state, so that other players see it too; the other axles are fixed.
// Every wheel spins with its ground speed. wheel nodes: model units, forward is -z.
export interface DrivenWheelMotion {
  /** Angle of the front wheels asked for (rad, positive to the left). */
  steer: number;
  forwardSpeed: number;
  yawRate: number;
}
export function animateDrivenWheels(
  wheels: readonly THREE.Object3D[],
  { steer, forwardSpeed, yawRate }: DrivenWheelMotion,
  {
    scale,
    pivotZ,
    wheelbase,
    radius,
  }: { scale: number; pivotZ: number; wheelbase: number; radius: number },
  dt: number,
): void {
  const frontZ = Math.min(...wheels.map((w) => w.position.z));
  for (const axle of wheels) {
    const front = Math.abs(axle.position.z - frontZ) < 1e-6;
    const target = front
      ? ackermannAngle(steer, { x: axle.position.x, z: axle.position.z }, pivotZ, wheelbase)
      : 0;
    // The network brings the steering at 20 Hz: ease towards it.
    const rotationY = Math.abs(axle.rotation.y - target) < 1e-4 ? target : axle.rotation.y;
    axle.rotation.order = 'YXZ';
    axle.rotation.y = rotationY + (target - rotationY) * Math.min(1, dt * 30);
    const ground = forwardSpeed + yawRate * axle.position.x * scale;
    axle.rotation.x = (axle.rotation.x + (-ground / (radius * scale)) * dt) % (2 * Math.PI);
  }
}

// Wheels that only roll (a trailer's): spin from the speed along their own heading.
export function animateRollingWheels(
  wheels: readonly THREE.Object3D[],
  forwardSpeed: number,
  { scale, radius }: { scale: number; radius: number },
  dt: number,
): void {
  const spin = (-forwardSpeed / (radius * scale)) * dt;
  for (const axle of wheels) axle.rotation.x = (axle.rotation.x + spin) % (2 * Math.PI);
}

// The wheels of a tracked vehicle: every road wheel, idler and sprocket turns with the speed
// of its own track, forward speed plus the yaw rate times its lateral offset (the outer track
// runs faster in a turn, the two run in opposite directions in a pivot). Each node carries its
// radius in model units in `userData.radius`.
export function animateTrackedWheels(
  wheels: readonly THREE.Object3D[],
  { forwardSpeed, yawRate }: GroundMotion,
  scale: number,
  dt: number,
): void {
  for (const wheel of wheels) {
    const ground = forwardSpeed + yawRate * wheel.position.x * scale;
    const radius = (wheel.userData.radius as number | undefined) ?? 0.28;
    wheel.rotation.x = (wheel.rotation.x + (-ground / (radius * scale)) * dt) % (2 * Math.PI);
  }
}
