import { MAP, REFERENCE } from './scale.ts';
import { WALKER_FREEFALL_SPEED } from './field-physics.ts';
import type { Vector3 } from 'three';

/** Vertical fall state integrated by stepFall (office metres, m/s). */
export interface FallingBody {
  y: number;
  vy: number;
  parachute?: boolean;
  grounded?: boolean;
}
// dv/dt = gravity - k |v| v. k = rho Cd A / (2m), in reference metres.
export const BALLISTICS = Object.freeze({ bullet: 0.0007, shell: 0.00015 });
export const HUMAN_AERO = Object.freeze({
  mass: 80,
  density: 1.225,
  gravity: 9.81,
  terminal: 54,
  canopyTerminal: 5.5,
});
export function stepBallisticVelocity(
  v: Vector3,
  dt: number,
  shell = false,
  ratio: number = MAP.ratio,
): void {
  const k = (shell ? BALLISTICS.shell : BALLISTICS.bullet) / ratio;
  v.y -= REFERENCE.gravity * ratio * dt * 0.5;
  v.multiplyScalar(1 / (1 + k * v.length() * dt));
  v.y -= REFERENCE.gravity * ratio * dt * 0.5;
}
export function stepFall(body: FallingBody, dt: number, ratio: number = MAP.ratio): void {
  const steps = Math.max(1, Math.ceil(dt * 240)),
    h = dt / steps,
    g = HUMAN_AERO.gravity * ratio,
    vt = (body.parachute ? HUMAN_AERO.canopyTerminal : HUMAN_AERO.terminal) * ratio,
    k = g / (vt * vt);
  for (let i = 0; i < steps; i++) {
    const previous = body.vy;
    let v = previous - (g * h) / 2;
    v /= 1 + k * Math.abs(v) * h;
    v -= (g * h) / 2;
    body.y += ((previous + v) * h) / 2;
    body.vy = v;
  }
}
export function toggleParachute(body: FallingBody | null | undefined): boolean {
  if (!body || body.grounded !== false) return false;
  // Opening needs a real fall: the descent of an ordinary jump never reaches this speed.
  if (!body.parachute && body.vy > -WALKER_FREEFALL_SPEED * MAP.ratio) return false;
  body.parachute = !body.parachute;
  return true;
}
