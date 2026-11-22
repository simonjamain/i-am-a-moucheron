import type { RigidBody } from '@dimforge/rapier3d-compat';
import { ACTOR_UNIT, MAP } from './scale.ts';
import { VEHICLES, type VehicleProfile } from './fleet.ts';
import { AIRCRAFT_GEOMETRY } from './aircraft-geometry.ts';
import {
  DEBUG_COLORS,
  arrow,
  cross,
  drawColliders,
  type DebugRig,
  type DebugSink,
} from './physics-debug.ts';
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

// Control authority per axis, from the air over the surfaces (quadratic: a surface at
// half speed has a quarter of the force). With no airspeed there is none: on the ground
// with the engine off the stick does nothing. The propeller blows air over the tail, so
// elevator and rudder keep a little authority with power on; the ailerons only feel the
// wings' airspeed. Very high speed stiffens the controls a little (as the old step did).
export interface ControlAuthority {
  pitch: number;
  roll: number;
  yaw: number;
}
export const PROPWASH = 14; // m/s of air at full throttle, standing still
export function controlAuthority(
  speed: number,
  gas: number,
  engine: boolean,
  profile?: Partial<VehicleProfile> | null,
  params: PlaneParams = PLANE_PARAMS,
): ControlAuthority {
  const c = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const reference = profile?.authoritySpeed ?? 13;
  const wash = engine
    ? PROPWASH * c(gas, 0, 1) * Math.max(0, 1 - (speed / params.thrustLimit) ** 2)
    : 0;
  const tail = Math.hypot(speed, wash);
  const stiff = c(38 / Math.max(speed, 38), 0.55, 1);
  const surface = (flow: number, full: number): number => c(flow / full, 0, 1) ** 2 * stiff;
  return {
    pitch: surface(tail, reference * 1.5),
    yaw: surface(tail, reference * 1.5),
    roll: surface(speed, reference * 2),
  };
}

interface Gear {
  /** Mount point of the spring in the body frame (reference metres). */
  x: number;
  y: number;
  z: number;
  /** Length of the ray (the spring fully extended) and the static compression, in
   * reference metres: the travel is `rest`, the aircraft sits `sag` lower at rest. */
  rest: number;
  sag: number;
  /** Share of the weight it carries at rest, and its sideways grip. */
  share: number;
  grip: number;
}
/** Reference metres per model unit: one model unit is ACTOR_UNIT world metres. */
export const MODEL_TO_REF = ACTOR_UNIT / MAP.metres(1);
const M = MODEL_TO_REF;

// The aircraft, from their models (src/aircraft-geometry.ts, measured on the meshes by
// scripts/measure-aircraft.mjs; model units, x to the right, y up, the nose towards -z).
// The main wheels stand on the model's wheel hubs, the tail rests where the model's tail
// does, the centre of mass is behind the wheels (a fifth of the weight on the tail).
export interface PlaneSpec {
  type: string;
  params: PlaneParams;
  gears: readonly Gear[];
  /** Colliders of the airframe: centre and half extents in reference metres. */
  parts: readonly { name: string; half: number[]; at: number[] }[];
  /** Centre of mass, reference metres. */
  com: readonly number[];
  /** Span, length and height of the airframe (reference metres): inertia. */
  size: { span: number; length: number; height: number };
  /** Static compression of the main springs (reference metres): a parked aircraft's
   * wheels ride this much higher than when the springs are extended. */
  sag: number;
  /** Main wheel radius (model units), to spin them. */
  wheelRadius: number;
}
// Fighter: the values the pilot flew and approved; the others derive theirs from their top
// speed (stall at a third of it) with the same lift, drag and thrust law.
const FIGHTER_GEAR = { rest: 1.2, sag: 0.14 };
const TYPES = ['fighter', 'bomber', 'lightfighter', 'medbomber', 'interceptor', 'spitfire'];
/** The aircraft flown by the physics engine (the helicopters keep their own step). */
export const PLANE_TYPES: ReadonlySet<string> = new Set(TYPES);
const specs = new Map<string, PlaneSpec>();
export function planeSpec(type: string): PlaneSpec {
  let spec = specs.get(type);
  if (spec) return spec;
  const geometry = AIRCRAFT_GEOMETRY[type],
    profile = (VEHICLES as unknown as Record<string, VehicleProfile | undefined>)[type];
  if (!geometry || !profile) throw Error('No plane physics for ' + type);
  const ground = geometry.ground,
    fixed = type === 'fighter';
  const rest = fixed ? FIGHTER_GEAR.rest : 0.615 * -ground * M,
    sag = fixed ? FIGHTER_GEAR.sag : 0.0718 * -ground * M;
  const [left, right] = geometry.wheels;
  const x = (Math.abs(left.x) + Math.abs(right.x)) / 2,
    z = (left.z + right.z) / 2;
  const gears: Gear[] = [
    { x: -x * M, y: ground * M + rest, z: z * M, rest, sag, share: 0.4, grip: 1 },
    { x: x * M, y: ground * M + rest, z: z * M, rest, sag, share: 0.4, grip: 1 },
    // The tail wheel has half the travel of the mains.
    {
      x: 0,
      y: geometry.tail.y * M + rest / 2,
      z: geometry.tail.z * M,
      rest: rest / 2,
      sag: sag / 2,
      share: 0.2,
      grip: 0.15,
    },
  ];
  const maxSpeed = profile.maxSpeed ?? 52.5;
  const params: PlaneParams = fixed
    ? PLANE_PARAMS
    : {
        ...PLANE_PARAMS,
        stallSpeed: +(0.32 * maxSpeed).toFixed(1),
        thrustLimit: +(1.33 * maxSpeed).toFixed(1),
        // A stronger engine accelerates harder (the Spitfire's is nine times the biplane's).
        thrust: +(
          PLANE_PARAMS.thrust * Math.min(1.8, Math.max(1, Math.sqrt(profile.thrust / 7.4)))
        ).toFixed(2),
        mass: Math.round(50 * (profile.span / 10.4) ** 2),
      };
  spec = {
    type,
    params,
    gears,
    parts: geometry.boxes.map((b) => ({
      name: b.name,
      half: b.half.map((v) => v * M),
      at: b.at.map((v) => v * M),
    })),
    com: geometry.com.map((v) => v * M),
    size: { span: profile.span, length: profile.length, height: 2.4 * (profile.span / 10.4) },
    sag,
    wheelRadius: (left.r + right.r) / 2,
  };
  specs.set(type, spec);
  return spec;
}

export class PlaneRig implements DebugRig {
  physics: PhysicsWorld;
  body: RigidBody;
  params: PlaneParams;
  spec: PlaneSpec;
  /** Angle of attack, sideslip and speed (reference units) at the last step. */
  alpha = 0;
  beta = 0;
  speed = 0;
  stall = 1;
  /** Compression of each gear spring at the last step (0 when in the air). */
  compression: number[];
  pose: { p: number[]; q: number[] } | null = null;
  /** What the debug view draws: forces in newtons (world frame) and the gear springs. */
  debug = {
    lift: [0, 0, 0],
    drag: [0, 0, 0],
    thrust: [0, 0, 0],
    gear: [] as { origin: number[]; end: number[]; hit: number[] | null; load: number[] }[],
  };
  private colliders: import('@dimforge/rapier3d-compat').Collider[] = [];

  /**
   * `physics`: a shared world (the server keeps all the parked aircraft of a room in one,
   * with the decor copied once); by default the rig has its own. `canSleep`: parked
   * aircraft let the engine put them to sleep; a flown one is pushed every step.
   */
  constructor(RAPIER: Rapier, type = 'fighter', physics?: PhysicsWorld, canSleep = false) {
    const spec = planeSpec(type),
      params = spec.params;
    this.spec = spec;
    this.params = params;
    this.compression = spec.gears.map(() => 0);
    this.physics = physics ?? new PhysicsWorld(RAPIER, { gravity: G * K });
    const m = params.mass,
      span = spec.size.span * K,
      length = spec.size.length * K,
      height = spec.size.height * K;
    this.body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 3 * K, 0)
        .setCanSleep(canSleep)
        // In a shared world (gravity of the ground vehicles) the aircraft's own gravity is
        // G in reference metres, that is G·K here.
        .setGravityScale((G * K) / this.physics.gravity)
        .setCcdEnabled(true)
        .setAdditionalMassProperties(
          m,
          { x: spec.com[0] * K, y: spec.com[1] * K, z: spec.com[2] * K },
          {
            x: (m * (height * height + length * length)) / 12,
            y: (m * (span * span + length * length)) / 12,
            z: (m * (span * span + height * height)) / 12,
          },
          { x: 0, y: 0, z: 0, w: 1 },
        ),
    );
    for (const part of spec.parts)
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
      grounded = this.forces(state, controls, h, profile).grounded;
      this.physics.step(h);
      impact = Math.max(impact, this.impact());
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

  /** Debug view (physics-debug.ts): colliders, gear springs and the main forces. */
  debugDraw(sink: DebugSink): void {
    const weight = this.params.mass * G * K,
      p = this.body.translation(),
      at = [p.x, p.y, p.z],
      scale = 1 / weight;
    drawColliders(this.physics.world, [this.body], sink);
    for (const gear of this.debug.gear) {
      sink(gear.origin, gear.end, DEBUG_COLORS.rest);
      if (gear.hit) {
        sink(gear.origin, gear.hit, DEBUG_COLORS.compressed);
        cross(sink, gear.hit, 0.05, DEBUG_COLORS.contact);
        arrow(sink, gear.hit, gear.load, scale, DEBUG_COLORS.load);
      }
    }
    arrow(sink, at, this.debug.lift, scale, DEBUG_COLORS.lift);
    arrow(sink, at, this.debug.drag, scale, DEBUG_COLORS.drag);
    arrow(sink, at, this.debug.thrust, scale, DEBUG_COLORS.thrust);
    arrow(sink, at, [0, -weight, 0], scale, DEBUG_COLORS.gravity);
    const v = this.body.linvel();
    arrow(sink, at, [v.x, v.y, v.z], 0.1, DEBUG_COLORS.velocity);
    cross(sink, at, 0.06, DEBUG_COLORS.centre);
  }

  /** Lets the engine's own sleep (no push, no wake-up) take the parked aircraft. */
  get asleep(): boolean {
    return this.body.isSleeping();
  }

  /**
   * Applies this step's forces (aerodynamics, thrust, gear) and the pilot's rates; the
   * caller then steps the world. `parked`: nobody is aboard: no pilot, no engine, wheel
   * brakes on, and the engine may put the body to sleep (nothing is applied to a sleeper).
   */
  forces(
    state: PlaneState,
    controls: PlaneControls,
    dt: number,
    profile?: Partial<VehicleProfile> | null,
    parked = false,
  ): { grounded: boolean } {
    const body = this.body,
      params = this.params,
      m = params.mass;
    if (parked && body.isSleeping()) return { grounded: true };
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
    const wake = !parked; // a parked aircraft must be allowed to fall asleep
    body.resetForces(wake);
    body.resetTorques(wake);

    // Aerodynamics.
    this.speed = speed;
    let alpha = 0,
      beta = 0;
    const accel = { x: 0, y: 0, z: 0 }; // body frame, reference m/s² (gravity is the engine's)
    const liftA = { x: 0, y: 0, z: 0 },
      dragA = { x: 0, y: 0, z: 0 };
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
      liftA.y = dynamic * cl * -dz;
      liftA.z = dynamic * cl * dy;
      dragA.x =
        ((-dynamic * local.x) / speed) * cd -
        dynamic * 0.9 * Math.sin(beta) * Math.abs(Math.cos(beta));
      dragA.y = ((-dynamic * local.y) / speed) * cd;
      dragA.z = ((-dynamic * local.z) / speed) * cd;
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
    accel.x = liftA.x + dragA.x;
    accel.y = liftA.y + dragA.y;
    accel.z = liftA.z + dragA.z - thrust;
    const worldAccel = rotate(q, accel);
    const asForce = (a: { x: number; y: number; z: number }): number[] => {
      const w = rotate(q, a);
      return [w.x * K * m, w.y * K * m, w.z * K * m];
    };
    this.debug.lift = asForce(liftA);
    this.debug.drag = asForce(dragA);
    this.debug.thrust = asForce({ x: 0, y: 0, z: -thrust });
    body.addForce(
      { x: worldAccel.x * K * m, y: worldAccel.y * K * m, z: worldAccel.z * K * m },
      wake,
    );

    // Rotation: the pilot sets target rates, the air makes the aircraft point along its
    // flight path and drops the nose in a stall.
    const auth = controlAuthority(speed, gas, engine, profile, params),
      turn = profile?.turn ?? 1,
      response = 1 - Math.exp(-9 * dt);
    const wl = rotate(inverse, wp);
    const q2 = Math.min(3, (speed / params.stallSpeed) ** 2);
    // On its wheels, the pitch and roll commands are set rates that would override the
    // gear springs: they only count once there is real speed to lift the tail or a wing.
    const onWheels = this.compression.some((c) => c > 0),
      lift = onWheels
        ? Math.min(1, Math.max(0, (speed - 0.5 * params.stallSpeed) / (0.4 * params.stallSpeed)))
        : 1;
    const target = {
      x: controls.pitch * 1.12 * auth.pitch * lift * turn,
      y: -controls.yaw * 0.8 * auth.yaw * turn,
      z: controls.roll * 2.25 * auth.roll * lift * turn,
    };
    // Standing on its wheels at low speed, pitch and roll are the gear's and gravity's
    // business (the aircraft settles onto its tail wheel): no rate is imposed on them.
    const settling = onWheels && lift === 0;
    let rx = settling ? wl.x : wl.x + (target.x - wl.x) * response,
      ry = wl.y + (target.y - wl.y) * response,
      rz = settling ? wl.z : wl.z + (target.z - wl.z) * response;
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
    this.compression = this.compression.map(() => 0);
    this.debug.gear = [];
    this.spec.gears.forEach((gear, i) => {
      const mount = rotate(q, { x: gear.x * K, y: gear.y * K, z: gear.z * K });
      const origin = { x: p.x + mount.x, y: p.y + mount.y, z: p.z + mount.z };
      const hit = this.physics.world.castRayAndGetNormal(
        new this.physics.R.Ray(origin, down),
        gear.rest * K,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );
      const rayEnd = [
        origin.x + down.x * gear.rest * K,
        origin.y + down.y * gear.rest * K,
        origin.z + down.z * gear.rest * K,
      ];
      const record = {
        origin: [origin.x, origin.y, origin.z],
        end: rayEnd,
        hit: null as number[] | null,
        load: [0, 0, 0],
      };
      this.debug.gear.push(record);
      if (!hit) return;
      const compression = (gear.rest * K - hit.timeOfImpact) / K; // reference metres
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
      const k = (gear.share * (m * G * K)) / (gear.sag * K); // N per physics metre
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
      // Parked: full brakes and a stiff friction curve, so that a slope does not make
      // the aircraft creep (it comes to rest, then the engine puts it to sleep).
      const braking = parked ? 1 : gas < 0.12 ? 0.55 : 0.02,
        soft = parked ? 0.05 : 1;
      const long = -load * braking * Math.tanh(along / (1.5 * soft)),
        side = -load * gear.grip * 0.9 * Math.tanh(across / (0.8 * soft));
      const push = {
        x: nrm.x * load + fx * long + ax * side,
        y: nrm.y * load + fy * long + ay * side,
        z: nrm.z * load + fz * long + az * side,
      };
      body.addForceAtPoint(push, contact, wake);
      record.hit = [contact.x, contact.y, contact.z];
      record.load = [push.x, push.y, push.z];
      grounded = true;
      if (i < 2) mainsDown++;
    });
    // A parked aircraft on its wheels is left to the engine; in the air its rates still
    // follow the aerodynamics (nose into the wind), without the pilot's targets.
    if (!parked || !grounded) body.setAngvel(rotate(q, { x: rx, y: ry, z: rz }), true);
    return { grounded: grounded && mainsDown > 0 };
  }

  /** Strongest contact impulse of the airframe (the gear is rays, not colliders). */
  impact(): number {
    let impulse = 0;
    for (const collider of this.colliders)
      this.physics.world.contactPairsWith(collider, (other) => {
        this.physics.world.contactPair(collider, other, (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++)
            impulse = Math.max(impulse, manifold.contactImpulse(i));
        });
      });
    return impulse / (this.params.mass * K);
  }
}
