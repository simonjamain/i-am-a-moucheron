import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { ACTOR_UNIT, MAP } from './scale.ts';
import { VEHICLES, type VehicleProfile } from './fleet.ts';
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
import type { PlaneState } from './plane-physics.ts';

// A helicopter as a Rapier rigid body, flown with forces. The "instructor" piloting of the old
// step is kept (the mouse gives the attitude, at most 45°; the collective gives a vertical
// speed; neutral hovers), but it now acts on a real body: the rotor pushes along the body's
// up axis (so tilting accelerates), drag against the world-horizontal speed sets the top
// speed, a spun-down rotor falls, and the airframe, the rotor disc and the landing gear are
// colliders and springs, like the aircraft of src/plane-physics.ts. Details: docs/heli-physics.md.
//
// Scale: reference metres, as in plane-physics.ts (`K` physics metres per reference metre).
const K = toPhysics(MAP.metres(1));
const G = 9.81;
const M = ACTOR_UNIT / MAP.metres(1); // reference metres per model unit

/** Speed (reference m/s) of a touchdown or of a single contact from which the helicopter is destroyed. */
export const HELI_CRASH_IMPACT = 8;
export const HELI_MAX_TILT = Math.PI / 4;
/** Climb and descent speeds at full collective (reference m/s). */
const CLIMB = 8;
const DESCENT = 30;
/** Keyboard turn rate (rad/s), see HELI.yawRate. */
const YAW_RATE = 1.4;

interface HeliGeometry {
  /** Scale of the model in the game relative to the mesh data these numbers come from. */
  scale?: number;
  /** Height of the wheel or skid bottoms (model units). */
  ground: number;
  /** Springs: mount point at the wheel hub (model units), share of the weight. */
  gears: readonly { x: number; z: number; share: number; grip: number }[];
  com: readonly number[];
  boxes: readonly { name: string; half: readonly number[]; at: readonly number[] }[];
  /** Rotor discs (model units): centre and radius. */
  discs: readonly { at: readonly number[]; r: number }[];
  size: { span: number; length: number; height: number };
}
// Measured on the models' mesh islands (scripts/split-vehicle-parts.mjs): model units, x to
// the right, y up, the nose towards -z.
export const HELI_GEOMETRY: Readonly<Record<string, HeliGeometry>> = {
  // Attack helicopter: tricycle wheels (two mains under the cabin, one at the nose).
  helicopter: {
    ground: -1.1,
    gears: [
      { x: -0.8, z: -0.31, share: 0.4, grip: 1 },
      { x: 0.8, z: -0.31, share: 0.4, grip: 1 },
      { x: 0.03, z: -2.33, share: 0.2, grip: 0.15 },
    ],
    com: [0, 0, -0.714],
    boxes: [
      { name: 'cabin', half: [0.53, 0.8, 1.95], at: [0, 0.1, -1.33] },
      { name: 'boom', half: [0.15, 0.38, 1.35], at: [0, 0.37, 1.95] },
      { name: 'wingL', half: [0.75, 0.19, 0.29], at: [-1.14, 0.01, -0.21] },
      { name: 'wingR', half: [0.75, 0.19, 0.29], at: [1.14, 0.01, -0.21] },
    ],
    discs: [{ at: [0.008, 0.99, -0.656], r: 2.5 }],
    size: { span: 5.1, length: 6.6, height: 2.5 },
  },
  // Flying Castor: tandem rotors, two long skids.
  flyingcastor: {
    scale: 0.7, // FLYING_CASTOR_SCALE: the numbers below are in the mesh's own units
    ground: -1,
    gears: [
      { x: -1.385, z: -3, share: 0.25, grip: 1 },
      { x: 1.385, z: -3, share: 0.25, grip: 1 },
      { x: -1.385, z: 0.8, share: 0.25, grip: 1 },
      { x: 1.385, z: 0.8, share: 0.25, grip: 1 },
    ],
    com: [0, 0.5, -1.1],
    boxes: [
      { name: 'hull', half: [1.25, 1.1, 4], at: [0, 0.65, -0.35] },
      { name: 'frontPylon', half: [0.4, 0.6, 0.4], at: [-0.05, 2.3, -2.35] },
      { name: 'rearPylon', half: [0.45, 0.6, 0.5], at: [-0.05, 2.3, 2.5] },
    ],
    discs: [
      { at: [-0.05, 3.1, -2.36], r: 1.5 },
      { at: [-0.03, 3.4, 2.58], r: 1.5 },
    ],
    size: { span: 3.6, length: 9, height: 3.6 },
  },
};
/** The rotorcraft flown by the physics engine. */
export const HELI_TYPES: ReadonlySet<string> = new Set(Object.keys(HELI_GEOMETRY));

interface Gear {
  x: number;
  y: number;
  z: number;
  rest: number;
  sag: number;
  share: number;
  grip: number;
}
export interface HeliSpec {
  type: string;
  mass: number;
  gears: readonly Gear[];
  parts: readonly { name: string; half: number[]; at: number[] }[];
  discs: readonly { at: number[]; r: number }[];
  com: readonly number[];
  size: { span: number; length: number; height: number };
  sag: number;
}
const specs = new Map<string, HeliSpec>();
export function heliSpec(type: string): HeliSpec {
  let spec = specs.get(type);
  if (spec) return spec;
  const g = HELI_GEOMETRY[type];
  if (!g) throw Error('No helicopter physics for ' + type);
  const u = M * (g.scale ?? 1); // reference metres per unit of the numbers above
  const rest = 0.35 * -g.ground * u,
    sag = 0.07 * -g.ground * u;
  spec = {
    type,
    mass: 80,
    gears: g.gears.map((p) => ({
      x: p.x * u,
      y: g.ground * u + rest,
      z: p.z * u,
      rest,
      sag,
      share: p.share,
      grip: p.grip,
    })),
    parts: g.boxes.map((b) => ({
      name: b.name,
      half: b.half.map((v) => v * u),
      at: b.at.map((v) => v * u),
    })),
    discs: g.discs.map((d) => ({ at: d.at.map((v) => v * u), r: d.r * u })),
    com: g.com.map((v) => v * u),
    size: {
      span: g.size.span * u,
      length: g.size.length * u,
      height: g.size.height * u,
    },
    sag,
  };
  specs.set(type, spec);
  return spec;
}

/** The state the rig reads and writes (the helicopter's own fields on top of the aircraft's). */
export interface HeliState extends PlaneState {
  collective?: number;
  rotorPower?: number;
  engine?: number | boolean;
}
export interface HeliControls {
  /** -1 (descend) to 1 (climb); 0 holds the altitude. */
  collective?: number;
  /** Attitude commands (-1..1) when the keys force them; undefined: the mouse direction. */
  pitch?: number;
  roll?: number;
  /** Turn rate command (-1..1) when no mouse direction steers. */
  yaw?: number;
  direction?: number[] | null;
  /** A pilot is at the controls (the rotor spins up); false: it spins down. */
  occupied?: boolean;
}

type V3 = { x: number; y: number; z: number };
type Q4 = { x: number; y: number; z: number; w: number };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const qmul = (a: Q4, b: Q4): Q4 => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
const axisAngle = (x: number, y: number, z: number, angle: number): Q4 => {
  const s = Math.sin(angle / 2),
    n = Math.hypot(x, y, z) || 1;
  return { x: (x / n) * s, y: (y / n) * s, z: (z / n) * s, w: Math.cos(angle / 2) };
};
/** The rotation (as an axis times an angle) that takes `from` to `to`. */
function rotationBetween(from: Q4, to: Q4): V3 {
  const q = qmul(to, { x: -from.x, y: -from.y, z: -from.z, w: from.w });
  const sign = q.w < 0 ? -1 : 1,
    s = Math.hypot(q.x, q.y, q.z),
    angle = 2 * Math.atan2(s, q.w * sign);
  if (s < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: (q.x / s) * sign * angle, y: (q.y / s) * sign * angle, z: (q.z / s) * sign * angle };
}

export class HeliRig implements DebugRig {
  physics: PhysicsWorld;
  body: RigidBody;
  spec: HeliSpec;
  /** What PlaneRig offers to the room's parked-vehicle host and the client. */
  compression: number[];
  speed = 0;
  rotorPower = 1;
  pose: { p: number[]; q: number[] } | null = null;
  debug = {
    thrust: [0, 0, 0],
    drag: [0, 0, 0],
    gear: [] as { origin: number[]; end: number[]; hit: number[] | null; load: number[] }[],
  };
  private colliders: Collider[] = [];
  private collective = 0;
  /** Fastest closing speed of a gear spring since the last `impact()` (reference m/s). */
  private touchdown = 0;

  constructor(RAPIER: Rapier, type = 'helicopter', physics?: PhysicsWorld, canSleep = false) {
    const spec = heliSpec(type);
    this.spec = spec;
    this.compression = spec.gears.map(() => 0);
    this.physics = physics ?? new PhysicsWorld(RAPIER, { gravity: G * K });
    const m = spec.mass,
      { span, length, height } = spec.size;
    this.body = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 3 * K, 0)
        .setCanSleep(canSleep)
        .setGravityScale((G * K) / this.physics.gravity)
        .setCcdEnabled(true)
        .setAdditionalMassProperties(
          m,
          { x: spec.com[0] * K, y: spec.com[1] * K, z: spec.com[2] * K },
          {
            x: (m * (height * height + length * length) * K * K) / 12,
            y: (m * (span * span + length * length) * K * K) / 12,
            z: (m * (span * span + height * height) * K * K) / 12,
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
    // A rotor disc is a thin cylinder: touching anything with it is a crash.
    for (const disc of spec.discs)
      this.colliders.push(
        this.physics.world.createCollider(
          RAPIER.ColliderDesc.cylinder(0.03 * K, disc.r * K)
            .setTranslation(disc.at[0] * K, disc.at[1] * K, disc.at[2] * K)
            .setDensity(0)
            .setFriction(0.3)
            .setRestitution(0),
          this.body,
        ),
      );
  }

  adopt(state: HeliState): void {
    const p = state.p.map(toPhysics),
      last = this.pose,
      q = state.q;
    this.collective = Number.isFinite(state.collective) ? (state.collective as number) : 0;
    this.rotorPower = state.rotorPower ?? this.rotorPower;
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
    state: HeliState,
    controls: HeliControls,
    colliders: readonly Solid[],
    dt: number,
    profile?: Partial<VehicleProfile> | null,
  ): void {
    if (state.hp <= 0) return;
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
    this.publish(state, grounded);
    state.impact = impact;
    if (impact > HELI_CRASH_IMPACT) state.hp = 0;
  }

  /** Writes the body's pose and the helicopter's own fields to the game state. */
  publish(state: HeliState, grounded: boolean): void {
    const p = this.body.translation(),
      q = this.body.rotation(),
      v = this.body.linvel(),
      w = this.body.angvel();
    state.p = [toWorld(p.x), toWorld(p.y), toWorld(p.z)];
    state.q = [q.x, q.y, q.z, q.w];
    state.v = [toWorld(v.x), toWorld(v.y), toWorld(v.z)];
    state.omega = [w.x, w.y, w.z];
    state.landed = grounded;
    state.collective = this.collective;
    state.rotorPower = this.rotorPower;
    this.pose = { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] };
  }

  /** Asleep once at rest with the rotor stopped (a spinning rotor keeps it awake). */
  get asleep(): boolean {
    return this.body.isSleeping() && this.rotorPower < 0.02;
  }

  debugDraw(sink: DebugSink): void {
    const weight = this.spec.mass * G * K,
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
    arrow(sink, at, this.debug.thrust, scale, DEBUG_COLORS.thrust);
    arrow(sink, at, this.debug.drag, scale, DEBUG_COLORS.drag);
    arrow(sink, at, [0, -weight, 0], scale, DEBUG_COLORS.gravity);
    const v = this.body.linvel();
    arrow(sink, at, [v.x, v.y, v.z], 0.1, DEBUG_COLORS.velocity);
    cross(sink, at, 0.06, DEBUG_COLORS.centre);
  }

  /**
   * Applies this step's forces (rotor, drag, gear) and the pilot's attitude rates; the caller
   * then steps the world. `parked`: nobody is aboard: the rotor spins down, wheel brakes on, and
   * the engine may put the body to sleep.
   */
  forces(
    state: HeliState,
    controls: HeliControls,
    dt: number,
    profile?: Partial<VehicleProfile> | null,
    parked = false,
  ): { grounded: boolean } {
    const body = this.body,
      spec = this.spec,
      m = spec.mass;
    if (parked && body.isSleeping() && this.rotorPower < 0.02) return { grounded: true };
    const q = body.rotation(),
      p = body.translation(),
      vp = body.linvel(),
      wp = body.angvel();
    const wake = !parked || this.rotorPower > 0.02;
    body.resetForces(wake);
    body.resetTorques(wake);
    const v = { x: vp.x / K, y: vp.y / K, z: vp.z / K }; // reference m/s, world
    this.speed = Math.hypot(v.x, v.y, v.z);

    // Rotor: spins up with a pilot at the controls and fuel, spins down otherwise.
    const powered =
      !parked && state.engine !== 0 && state.engine !== false && state.fuelAvailable !== false;
    const rotorTarget = powered && controls.occupied !== false ? 1 : 0;
    this.rotorPower +=
      (rotorTarget - this.rotorPower) * (1 - Math.exp(-dt * (rotorTarget ? 2 : 0.8)));
    const input = powered ? clamp(controls.collective ?? 0, -1, 1) : 0;
    this.collective += (input - this.collective) * (1 - Math.exp(-dt * 2.5));

    const up = rotate(q, { x: 0, y: 1, z: 0 });
    // Vertical speed the pilot asks for; the rotor's thrust is whatever holds it (hover at
    // neutral), along the body's up axis: tilted, the same lift also pushes sideways.
    const climbTarget = this.collective * (this.collective < 0 ? DESCENT : CLIMB);
    let lift = G + 2 * (climbTarget - v.y);
    // Standing on its gear with no climb asked, the rotor just keeps most of the weight off.
    const onGear = this.compression.some((c) => c > 0);
    if (onGear && climbTarget <= 0) lift = Math.min(lift, 0.8 * G);
    const thrust = clamp(lift / Math.max(0.5, up.y), 0, 2.2 * G) * this.rotorPower;
    // Drag against the horizontal speed: balanced by the horizontal thrust at the tilt limit
    // (G·tan 45°) it gives the profile's top speed.
    const vmax = profile?.maxSpeed ?? VEHICLES[spec.type as keyof typeof VEHICLES]?.maxSpeed ?? 42;
    const horizontal = Math.hypot(v.x, v.z),
      drag = (G / (vmax * vmax)) * horizontal + 0.02;
    const accel = {
      x: up.x * thrust - drag * v.x,
      y: up.y * thrust,
      z: up.z * thrust - drag * v.z,
    };
    body.addForce({ x: accel.x * K * m, y: accel.y * K * m, z: accel.z * K * m }, wake);
    this.debug.thrust = [up.x * thrust * K * m, up.y * thrust * K * m, up.z * thrust * K * m];
    this.debug.drag = [-drag * v.x * K * m, 0, -drag * v.z * K * m];

    // Attitude: the old instructor, as an angular rate towards the target (about 2 per second).
    const fwd = rotate(q, { x: 0, y: 0, z: -1 });
    const heading = Math.atan2(-fwd.x, -fwd.z);
    const dir = controls.direction
      ? (() => {
          const [dx, dy, dz] = controls.direction;
          const l = Math.hypot(dx, dy, dz) || 1;
          return { x: dx / l, y: dy / l, z: dz / l };
        })()
      : null;
    const pitch =
      controls.pitch !== undefined
        ? clamp(controls.pitch, -1, 1) * HELI_MAX_TILT
        : dir
          ? clamp(Math.asin(clamp(dir.y, -1, 1)), -HELI_MAX_TILT, HELI_MAX_TILT)
          : 0;
    const roll =
      controls.roll !== undefined
        ? clamp(controls.roll, -1, 1) * HELI_MAX_TILT
        : dir
          ? clamp((fwd.z * dir.x - fwd.x * dir.z) * -HELI_MAX_TILT, -HELI_MAX_TILT, HELI_MAX_TILT)
          : 0;
    const tiltLength = Math.hypot(pitch, roll),
      tilt = Math.min(HELI_MAX_TILT, tiltLength);
    let yawWanted = heading;
    if (dir) yawWanted = Math.atan2(-dir.x, -dir.z);
    let target = axisAngle(0, 1, 0, yawWanted);
    if (tilt > 1e-6) target = qmul(target, axisAngle(pitch, 0, roll, tilt));
    const error = rotationBetween(q, target);
    const wanted = { x: 2 * error.x, y: 2 * error.y, z: 2 * error.z };
    if (!dir) wanted.y += -clamp(controls.yaw ?? 0, -1, 1) * YAW_RATE;
    const response = 1 - Math.exp(-12 * dt);

    // Landing gear: a ray and a spring per wheel or skid (static load = its share of the weight).
    const down = { x: -up.x, y: -up.y, z: -up.z };
    let grounded = false;
    this.compression = this.compression.map(() => 0);
    this.debug.gear = [];
    spec.gears.forEach((gear, i) => {
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
      const record = {
        origin: [origin.x, origin.y, origin.z],
        end: [
          origin.x + down.x * gear.rest * K,
          origin.y + down.y * gear.rest * K,
          origin.z + down.z * gear.rest * K,
        ],
        hit: null as number[] | null,
        load: [0, 0, 0],
      };
      this.debug.gear.push(record);
      if (!hit) return;
      const compression = (gear.rest * K - hit.timeOfImpact) / K;
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
        rise = point.x * nrm.x + point.y * nrm.y + point.z * nrm.z;
      const k = (gear.share * (m * G * K)) / (gear.sag * K);
      const c = 2 * 0.6 * Math.sqrt(k * m * gear.share);
      const load = Math.max(0, k * compression * K - c * rise);
      this.touchdown = Math.max(this.touchdown, -rise / K);
      const f0 = rotate(q, { x: 0, y: 0, z: -1 });
      const dn = f0.x * nrm.x + f0.y * nrm.y + f0.z * nrm.z;
      let fx = f0.x - nrm.x * dn,
        fy = f0.y - nrm.y * dn,
        fz = f0.z - nrm.z * dn;
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl;
      fy /= fl;
      fz /= fl;
      const ax = fy * nrm.z - fz * nrm.y,
        ay = fz * nrm.x - fx * nrm.z,
        az = fx * nrm.y - fy * nrm.x;
      const along = (point.x * fx + point.y * fy + point.z * fz) / K,
        across = (point.x * ax + point.y * ay + point.z * az) / K;
      // Parked or idling on the ground: brakes and a stiff friction; lifting off: free.
      const braking = parked ? 1 : lift < G ? 0.55 : 0.03,
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
    });

    // The pilot's rates. Standing on the gear with the rotor not lifting, only the turn is
    // imposed (tilting is the gear's and the gravity's business); a parked helicopter is the
    // engine's.
    const holding = grounded && lift < G;
    if (parked) {
      if (!grounded) body.setAngvel({ x: wp.x * 0.98, y: wp.y * 0.98, z: wp.z * 0.98 }, true);
    } else {
      const next = {
        x: holding ? wp.x : wp.x + (wanted.x - wp.x) * response,
        y: wp.y + (wanted.y - wp.y) * response,
        z: holding ? wp.z : wp.z + (wanted.z - wp.z) * response,
      };
      body.setAngvel(next, true);
    }
    return { grounded };
  }

  /** Strongest contact impulse of the airframe and the rotor discs (the gear is rays). */
  impact(): number {
    let impulse = 0;
    for (const collider of this.colliders)
      this.physics.world.contactPairsWith(collider, (other) => {
        this.physics.world.contactPair(collider, other, (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++)
            impulse = Math.max(impulse, manifold.contactImpulse(i));
        });
      });
    // The springs soften a touchdown: the hardest landing is also read from their closing speed.
    const hardest = Math.max(impulse / (this.spec.mass * K), this.touchdown);
    this.touchdown = 0;
    return hardest;
  }
}
