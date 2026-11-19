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
