import type { RigidBody } from '@dimforge/rapier3d-compat';
import { MAP } from './scale.ts';
import type { VehicleProfile } from './fleet.ts';
import {
  PhysicsWorld,
  rotate,
  toPhysics,
  toWorld,
  type Rapier,
  type Solid,
} from './physics-world.ts';

// An aircraft as a Rapier rigid body, flown with forces: lift and drag from the angle
// of attack (with a real stall), thrust, weathercock stability, and a landing gear on
// ray-cast springs (the same technique as the tank's suspension). Pilot commands are
// the pitch / roll / yaw of src/mouse-flight.ts (the mouse "instructor") or the keys.
//
// Method after the arcade flight models used in games (vazgriz/FlightSim: lift and
// induced drag from an angle-of-attack curve, steering as a target angular rate;
// brihernandez/MouseFlight: direction-based mouse aim). Details: docs/plane-physics.md.
//
// Scale. The dynamics are written in "reference metres" (what the old stepFlight used:
// a biplane stalls at 17 m/s and tops at 52 m/s, whatever the miniature ratio) and
// converted to the physics world, where a reference metre is K physics metres. Lengths,
// speeds and accelerations all scale by K; time and gravity-in-reference-metres do not,
// so the manoeuvres keep their timing.
export const K = toPhysics(MAP.metres(1));
const G = 9.81; // m/s² in reference metres

/** Speed change (reference m/s) of a single contact from which the aircraft is destroyed. */
export const PLANE_CRASH_IMPACT = 16;

export interface PlaneParams {
  /** Speed (m/s) at which full lift balances weight at the stall angle. */
  stallSpeed: number;
  /** Stall angle of attack (rad) and the lift slope below it (per rad). */
  stallAngle: number;
  liftSlope: number;
  /** Zero-lift angle of attack, negative: the wing is set at an incidence, so a level
   * aircraft at cruise speed needs no stick (rad, added to the angle of attack). */
  zeroLift: number;
  /** Drag coefficient at zero lift and the induced-drag factor (CD = CD0 + k CL²). */
  dragZero: number;
  inducedDrag: number;
  /** Static thrust acceleration (m/s²) at full throttle; it fades towards `thrustLimit`. */
  thrust: number;
  thrustLimit: number;
  /** Mass in physics kilograms (only matters for contacts: forces are scaled by it). */
  mass: number;
}
export const PLANE_PARAMS: Readonly<PlaneParams> = Object.freeze({
  stallSpeed: 17,
  stallAngle: 0.3,
  liftSlope: 4.5,
  zeroLift: 0.055,
  dragZero: 0.02,
  inducedDrag: 0.07,
  thrust: 3.2,
  thrustLimit: 70,
  mass: 50,
});

/** The state this rig reads and writes (world units, like the other rigs). */
export interface PlaneState {
  p: number[];
  q: number[];
  v: number[];
  /** Angular velocity (rad/s, world frame). */
  omega?: number[];
  hp: number;
  gas?: number;
  landed?: boolean;
  /** Set by the rig: the strongest impact of the step, in reference m/s of speed change. */
  impact?: number;
  fuelAvailable?: boolean;
}
export interface PlaneControls {
  pitch: number;
  roll: number;
  yaw: number;
}

// Lift coefficient against angle of attack: linear up to the stall, then a drop to a
// plate-like curve (the wing keeps some lift, far less than before).
export function liftCoefficient(alpha: number, params: PlaneParams = PLANE_PARAMS): number {
  const e = alpha + params.zeroLift,
    a = Math.abs(e),
    sign = Math.sign(e) || 1,
    max = params.liftSlope * params.stallAngle;
  if (a <= params.stallAngle) return params.liftSlope * e;
  const post = 0.55 * max * Math.abs(Math.sin(2 * Math.min(a, Math.PI / 2))) * 1.25;
  const blend = Math.min(1, (a - params.stallAngle) / 0.12);
  return sign * (max + (Math.min(post, max) - max) * blend);
}
export function dragCoefficient(alpha: number, params: PlaneParams = PLANE_PARAMS): number {
  const cl = liftCoefficient(alpha, params),
    s = Math.sin(alpha + params.zeroLift);
  const stalled = Math.min(
    1,
    Math.max(0, (Math.abs(alpha + params.zeroLift) - params.stallAngle) / 0.2),
  );
  return params.dragZero + params.inducedDrag * cl * cl + 0.9 * s * s * stalled;
}

// Control authority: low speed means little air over the surfaces (as stepFlight).
export function authority(speed: number, profile?: Partial<VehicleProfile> | null): number {
  const c = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  return c(speed / (profile?.authoritySpeed ?? 13), 0.12, 1) * c(38 / Math.max(speed, 38), 0.55, 1);
}

interface Gear {
  /** Mount point of the spring in the body frame (reference metres). */
  x: number;
  y: number;
  z: number;
  /** Share of the weight it carries at rest, and its sideways grip. */
  share: number;
  grip: number;
}
// Biplane geometry in reference metres (forward is -z). The wheels touch the ground
// 1.95 m under the centre (VEHICLES.fighter.gear); the tail skid lowers the nose.
const REST = 1.2;
const GEARS: readonly Gear[] = [
  { x: -1.35, y: -0.75, z: -0.7, share: 0.4, grip: 1 },
  { x: 1.35, y: -0.75, z: -0.7, share: 0.4, grip: 1 },
  { x: 0, y: -0.2, z: 3.5, share: 0.2, grip: 0.25 },
];
const SAG = 0.14; // static compression of a spring (reference metres)

// Body colliders (half extents and centre, reference metres): they only matter when
// the airframe hits something, the gear carries the aircraft on the ground.
const PARTS = [
  { name: 'fuselage', half: [0.35, 0.45, 2.9], at: [0, 0, 0.3] },
  { name: 'upperWing', half: [5.0, 0.07, 0.95], at: [0, 1.15, -0.5] },
  { name: 'lowerWing', half: [4.6, 0.07, 0.85], at: [0, -0.55, -0.4] },
  { name: 'tail', half: [1.3, 0.06, 0.55], at: [0, 0.35, 3.5] },
  { name: 'fin', half: [0.06, 0.55, 0.55], at: [0, 0.9, 3.55] },
] as const;

export class PlaneRig {
  physics: PhysicsWorld;
  body: RigidBody;
  params: PlaneParams;
  /** Angle of attack, sideslip and speed (reference units) at the last step. */
  alpha = 0;
  beta = 0;
  speed = 0;
  stall = 1;
  /** Compression of each gear spring at the last step (0 when in the air). */
  compression = [0, 0, 0];
  pose: { p: number[]; q: number[] } | null = null;
  private colliders: import('@dimforge/rapier3d-compat').Collider[] = [];

  constructor(RAPIER: Rapier, params: PlaneParams = PLANE_PARAMS) {
    this.params = params;
    this.physics = new PhysicsWorld(RAPIER, { gravity: G * K });
    const m = params.mass,
      span = 10.4 * K,
      length = 8.2 * K,
      height = 2.4 * K;
    this.body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 3 * K, 0)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setAdditionalMassProperties(
          m,
          { x: 0, y: 0, z: 0 },
          {
            x: (m * (height * height + length * length)) / 12,
            y: (m * (span * span + length * length)) / 12,
            z: (m * (span * span + height * height)) / 12,
          },
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    for (const part of PARTS)
      this.colliders.push(
        this.physics.world.createCollider(
          RAPIER.ColliderDesc.cuboid(...(part.half.map((v) => v * K) as [number, number, number]))
            .setTranslation(part.at[0] * K, part.at[1] * K, part.at[2] * K)
            .setDensity(0)
            .setFriction(0.5)
            .setRestitution(0.05),
          this.body,
        ),
      );
  }

  /** Puts the body where the game has the aircraft (a new flight, a teleport). */
  adopt(state: PlaneState): void {
    const p = state.p.map(toPhysics),
      last = this.pose;
    const q = state.q;
    if (
      last &&
      Math.hypot(p[0] - last.p[0], p[1] - last.p[1], p[2] - last.p[2]) < 1e-3 &&
      Math.abs(q[0] * last.q[0] + q[1] * last.q[1] + q[2] * last.q[2] + q[3] * last.q[3]) > 0.9999
    )
      return;
    this.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    this.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
    const v = state.v.map((x) => toPhysics(x));
    this.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
    const w = state.omega ?? [0, 0, 0];
    this.body.setAngvel({ x: w[0], y: w[1], z: w[2] }, true);
  }

  step(
    state: PlaneState,
    controls: PlaneControls,
    colliders: readonly Solid[],
    dt: number,
    profile?: Partial<VehicleProfile> | null,
  ): void {
    this.adopt(state);
    this.physics.sync(colliders);
    const n = Math.max(1, Math.ceil(dt * 120)),
      h = dt / n;
    let impact = 0,
      grounded = false;
    for (let i = 0; i < n; i++) {
      const info = this.substep(state, controls, h, profile);
      grounded = info.grounded;
      impact = Math.max(impact, info.impact);
    }
    const p = this.body.translation(),
      q = this.body.rotation(),
      v = this.body.linvel(),
      w = this.body.angvel();
    state.p = [toWorld(p.x), toWorld(p.y), toWorld(p.z)];
    state.q = [q.x, q.y, q.z, q.w];
    state.v = [toWorld(v.x), toWorld(v.y), toWorld(v.z)];
    state.omega = [w.x, w.y, w.z];
    state.landed = grounded;
    state.impact = impact;
    this.pose = { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] };
  }

  private substep(
    state: PlaneState,
    controls: PlaneControls,
    dt: number,
    profile?: Partial<VehicleProfile> | null,
  ): { grounded: boolean; impact: number } {
    const body = this.body,
      params = this.params,
      m = params.mass;
    const q = body.rotation(),
      p = body.translation(),
      vp = body.linvel(),
      wp = body.angvel();
    const inverse = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    // Velocity in reference metres per second, in the body frame (x right, y up, -z ahead).
    const vRef = { x: vp.x / K, y: vp.y / K, z: vp.z / K };
    const local = rotate(inverse, vRef);
    const speed = Math.hypot(local.x, local.y, local.z);
    const gas = state.gas ?? 0,
      engine = state.fuelAvailable !== false && state.hp > 0;
    body.resetForces(true);
    body.resetTorques(true);

    // Aerodynamics.
    this.speed = speed;
    let alpha = 0,
      beta = 0;
    const accel = { x: 0, y: 0, z: 0 }; // body frame, reference m/s² (gravity is the engine's)
    if (speed > 0.5) {
      alpha = Math.atan2(-local.y, -local.z);
      beta = Math.atan2(local.x, -local.z);
      const dynamic =
        (G * (speed / params.stallSpeed) ** 2) / (params.liftSlope * params.stallAngle);
      const cl = liftCoefficient(alpha, params),
        cd = dragCoefficient(alpha, params);
      // Lift is perpendicular to the flow in the symmetry plane; drag opposes the flow.
      const flat = Math.hypot(local.y, local.z) || 1,
        dy = local.y / flat,
        dz = local.z / flat;
      accel.y += dynamic * cl * -dz;
      accel.z += dynamic * cl * dy;
      accel.x += ((-dynamic * local.x) / speed) * cd;
      accel.y += ((-dynamic * local.y) / speed) * cd;
      accel.z += ((-dynamic * local.z) / speed) * cd;
      accel.x += -dynamic * 0.9 * Math.sin(beta) * Math.abs(Math.cos(beta));
    }
    this.alpha = alpha;
    this.beta = beta;
    this.stall =
      1 -
      0.8 * Math.min(1, Math.max(0, (Math.abs(alpha + params.zeroLift) - params.stallAngle) / 0.2));
    // Thrust along the nose, fading with speed (a propeller).
    const thrust = engine
      ? params.thrust * gas * Math.max(0, 1 - (speed / params.thrustLimit) ** 2)
      : 0;
    accel.z -= thrust;
    const worldAccel = rotate(q, accel);
    body.addForce(
      { x: worldAccel.x * K * m, y: worldAccel.y * K * m, z: worldAccel.z * K * m },
      true,
    );

    // Rotation: the pilot sets target rates, the air makes the aircraft point along its
    // flight path and drops the nose in a stall.
    const auth = authority(speed, profile),
      turn = profile?.turn ?? 1,
      response = 1 - Math.exp(-9 * dt);
    const wl = rotate(inverse, wp);
    const q2 = Math.min(3, (speed / params.stallSpeed) ** 2);
    const target = {
      x: controls.pitch * 1.12 * auth * turn,
      y: -controls.yaw * 0.8 * auth * turn,
      z: controls.roll * 2.25 * auth * turn,
    };
    let rx = wl.x + (target.x - wl.x) * response,
      ry = wl.y + (target.y - wl.y) * response,
      rz = wl.z + (target.z - wl.z) * response;
    rx += -2.2 * q2 * alpha * dt;
    ry += -2.0 * q2 * beta * dt;
    const effective = alpha + params.zeroLift;
    const over = Math.min(1, Math.max(0, (Math.abs(effective) - params.stallAngle) / 0.2));
    rx += -Math.sign(effective) * 2.5 * over * dt;

    // Landing gear: a ray and a spring per wheel (static load = its share of the weight).
    const up = rotate(q, { x: 0, y: 1, z: 0 });
    const down = { x: -up.x, y: -up.y, z: -up.z };
    let grounded = false,
      mainsDown = 0;
    this.compression = [0, 0, 0];
    GEARS.forEach((gear, i) => {
      const mount = rotate(q, { x: gear.x * K, y: gear.y * K, z: gear.z * K });
      const origin = { x: p.x + mount.x, y: p.y + mount.y, z: p.z + mount.z };
      const hit = this.physics.world.castRayAndGetNormal(
        new this.physics.R.Ray(origin, down),
        REST * K,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );
      if (!hit) return;
      const compression = (REST * K - hit.timeOfImpact) / K; // reference metres
      if (compression <= 0) return;
      this.compression[i] = compression;
      const contact = {
        x: origin.x + down.x * hit.timeOfImpact,
        y: origin.y + down.y * hit.timeOfImpact,
        z: origin.z + down.z * hit.timeOfImpact,
      };
      const arm = { x: contact.x - p.x, y: contact.y - p.y, z: contact.z - p.z };
      const point = {
        x: vp.x + wp.y * arm.z - wp.z * arm.y,
        y: vp.y + wp.z * arm.x - wp.x * arm.z,
        z: vp.z + wp.x * arm.y - wp.y * arm.x,
      };
      const nrm = hit.normal,
        rise = point.x * nrm.x + point.y * nrm.y + point.z * nrm.z; // m/s (physics)
      const k = (gear.share * (m * G * K)) / (SAG * K); // N per physics metre
      const c = 2 * 0.6 * Math.sqrt(k * m * gear.share);
      const load = Math.max(0, k * compression * K - c * rise);
      // Wheel frame on the ground: along the nose, across.
      const fwd = rotate(q, { x: 0, y: 0, z: -1 });
      const dn = fwd.x * nrm.x + fwd.y * nrm.y + fwd.z * nrm.z;
      let fx = fwd.x - nrm.x * dn,
        fy = fwd.y - nrm.y * dn,
        fz = fwd.z - nrm.z * dn;
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl;
      fy /= fl;
      fz /= fl;
      const ax = fy * nrm.z - fz * nrm.y,
        ay = fz * nrm.x - fx * nrm.z,
        az = fx * nrm.y - fy * nrm.x;
      const along = (point.x * fx + point.y * fy + point.z * fz) / K,
        across = (point.x * ax + point.y * ay + point.z * az) / K;
      const braking = gas < 0.12 ? 0.55 : 0.02;
      const long = -load * braking * Math.tanh(along / 1.5),
        side = -load * gear.grip * 0.9 * Math.tanh(across / 0.8);
      body.addForceAtPoint(
        {
          x: nrm.x * load + fx * long + ax * side,
          y: nrm.y * load + fy * long + ay * side,
          z: nrm.z * load + fz * long + az * side,
        },
        contact,
        true,
      );
      grounded = true;
      if (i < 2) mainsDown++;
    });
    // Taxiing: the rudder turns the aircraft on the ground at any speed.
    if (grounded) ry = ry + (-controls.yaw * 0.7 - ry) * response;
    const wlOut = rotate(q, { x: rx, y: ry, z: rz });
    body.setAngvel(wlOut, true);
    this.physics.step(dt);

    // Strongest contact impulse of the airframe (the gear is rays, not colliders).
    let impulse = 0;
    for (const collider of this.colliders)
      this.physics.world.contactPairsWith(collider, (other) => {
        this.physics.world.contactPair(collider, other, (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++)
            impulse = Math.max(impulse, manifold.contactImpulse(i));
        });
      });
    return { grounded: grounded && mainsDown > 0, impact: impulse / (m * K) };
  }
}
