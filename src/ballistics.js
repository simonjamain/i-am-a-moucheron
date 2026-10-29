import { MAP, REFERENCE } from './scale.js';
// dv/dt = gravity - k |v| v. k = rho Cd A / (2m), in reference metres.
export const BALLISTICS = Object.freeze({ bullet: 0.0007, shell: 0.00015 });
export const HUMAN_AERO = Object.freeze({
  mass: 80,
  density: 1.225,
  gravity: 9.81,
  terminal: 54,
  canopyTerminal: 5.5,
});
export function stepBallisticVelocity(v, dt, shell = false, ratio = MAP.ratio) {
  const k = (shell ? BALLISTICS.shell : BALLISTICS.bullet) / ratio;
  v.y -= REFERENCE.gravity * ratio * dt * 0.5;
  v.multiplyScalar(1 / (1 + k * v.length() * dt));
  v.y -= REFERENCE.gravity * ratio * dt * 0.5;
}
export function stepFall(body, dt, ratio = MAP.ratio) {
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
export function toggleParachute(body) {
  if (!body || body.grounded !== false) return false;
  body.parachute = !body.parachute;
  return true;
}
