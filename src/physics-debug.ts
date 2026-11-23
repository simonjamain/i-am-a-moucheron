import type * as THREE from 'three/webgpu';
import type { DynamicRayCastVehicleController, RigidBody, World } from '@dimforge/rapier3d-compat';
import { rotate, toWorld } from './physics-world.ts';
import type { Three } from './types.ts';

// Display of the physics engine (debug view, independent of the room's debug mode): the
// rigid bodies' colliders, the wheel springs with their rest length and their maximum
// travel, the contact points, and the main forces. Rigs describe themselves in physics
// metres through `debugDraw(sink)`; this module turns them into world-space lines.
// Colours are listed in docs/physics-debug.md.
export type Point = readonly number[];
export type DebugSink = (a: Point, b: Point, color: number) => void;
export interface DebugRig {
  debugDraw(sink: DebugSink): void;
}

export const DEBUG_COLORS = Object.freeze({
  collider: 0x40e0ff, // outline of a rigid body's colliders
  rest: 0x40ff60, // spring at rest length
  travel: 0xffc040, // extra travel before it bottoms out
  compressed: 0xff5040, // spring as it is now (up to the contact)
  contact: 0xffffff, // contact point
  load: 0xff40ff, // force pushed by a spring
  lift: 0x4080ff,
  drag: 0xff8040,
  thrust: 0xffee40,
  gravity: 0x909090,
  velocity: 0xe0e0e0,
  centre: 0xffffff, // centre of mass
});

/** Edges of a cross at `p`, `size` physics metres wide. */
export function cross(sink: DebugSink, p: Point, size: number, color: number): void {
  for (let axis = 0; axis < 3; axis++) {
    const a = [p[0], p[1], p[2]],
      b = [p[0], p[1], p[2]];
    a[axis] -= size / 2;
    b[axis] += size / 2;
    sink(a, b, color);
  }
}

/** The colliders attached to the given bodies, from the engine's own debug renderer. */
export function drawColliders(world: World, bodies: readonly RigidBody[], sink: DebugSink): void {
  const mine = new Set(bodies.map((b) => b.handle));
  const buffers = world.debugRender(undefined, (collider) => {
    const parent = collider.parent();
    return !!parent && mine.has(parent.handle);
  });
  const v = buffers.vertices;
  for (let i = 0; i + 5 < v.length; i += 6)
    sink([v[i], v[i + 1], v[i + 2]], [v[i + 3], v[i + 4], v[i + 5]], DEBUG_COLORS.collider);
}

/** An arrow from `from` along `force`, `scale` metres per newton. */
export function arrow(
  sink: DebugSink,
  from: Point,
  force: Point,
  scale: number,
  color: number,
): void {
  const to = [from[0] + force[0] * scale, from[1] + force[1] * scale, from[2] + force[2] * scale];
  sink(from, to, color);
  const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  if (len < 1e-6) return;
  // Small head: two barbs back along the arrow, perpendicular to a helper axis.
  const d = [(to[0] - from[0]) / len, (to[1] - from[1]) / len, (to[2] - from[2]) / len];
  const h = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const s = [d[1] * h[2] - d[2] * h[1], d[2] * h[0] - d[0] * h[2], d[0] * h[1] - d[1] * h[0]];
  const sl = Math.hypot(...s) || 1,
    head = Math.min(0.12 * len, 0.06);
  for (const k of [-1, 1])
    sink(
      to,
      [
        to[0] - d[0] * head + (s[0] / sl) * head * 0.5 * k,
        to[1] - d[1] * head + (s[1] / sl) * head * 0.5 * k,
        to[2] - d[2] * head + (s[2] / sl) * head * 0.5 * k,
      ],
      color,
    );
}

/**
 * Wheels of a ray-cast vehicle controller: for each wheel, the spring at rest length
 * (green), the travel beyond it (amber), the length it has now (red, ending at the
 * contact point) and the spring force.
 */
export function drawWheels(
  controller: DynamicRayCastVehicleController,
  body: RigidBody,
  sink: DebugSink,
  weight: number,
): void {
  const q = body.rotation(),
    p = body.translation();
  for (let i = 0; i < controller.numWheels(); i++) {
    const cs = controller.wheelChassisConnectionPointCs(i),
      dir = controller.wheelDirectionCs(i);
    if (!cs || !dir) continue;
    const r = rotate(q, cs),
      d = rotate(q, dir),
      origin = [p.x + r.x, p.y + r.y, p.z + r.z];
    const rest = controller.wheelSuspensionRestLength(i) ?? 0,
      travel = controller.wheelMaxSuspensionTravel(i) ?? 0,
      now = controller.wheelSuspensionLength(i) ?? rest;
    const at = (t: number): number[] => [
      origin[0] + d.x * t,
      origin[1] + d.y * t,
      origin[2] + d.z * t,
    ];
    sink(origin, at(rest), DEBUG_COLORS.rest);
    sink(at(rest), at(rest + travel), DEBUG_COLORS.travel);
    cross(sink, origin, 0.04, DEBUG_COLORS.contact);
    if (controller.wheelIsInContact(i)) {
      sink(origin, at(now), DEBUG_COLORS.compressed);
      cross(sink, at(now), 0.05, DEBUG_COLORS.contact);
      const force = controller.wheelSuspensionForce(i) ?? 0;
      arrow(
        sink,
        at(now),
        [-d.x * force, -d.y * force, -d.z * force],
        1 / weight,
        DEBUG_COLORS.load,
      );
    }
  }
  const c = body.worldCom();
  cross(sink, [c.x, c.y, c.z], 0.06, DEBUG_COLORS.centre);
}

/** The lines of the rigs, drawn in the scene in world units. */
export class PhysicsOverlay {
  readonly lines: THREE.LineSegments;
  private positions: Float32Array<ArrayBuffer> = new Float32Array(3 * 2 * 2048);
  private colors: Float32Array<ArrayBuffer> = new Float32Array(3 * 2 * 2048);
  private count = 0;
  private T: Three;
  private geometry: THREE.BufferGeometry;

  constructor(T: Three, scene: THREE.Object3D) {
    this.T = T;
    this.geometry = new T.BufferGeometry();
    this.lines = new T.LineSegments(
      this.geometry,
      new T.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  private push: DebugSink = (a, b, color) => {
    if (this.count * 6 + 6 > this.positions.length) {
      const grow = (old: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> => {
        const next = new Float32Array(old.length * 2);
        next.set(old);
        return next;
      };
      this.positions = grow(this.positions);
      this.colors = grow(this.colors);
    }
    const o = this.count * 6,
      r = ((color >> 16) & 255) / 255,
      g = ((color >> 8) & 255) / 255,
      bl = (color & 255) / 255;
    for (let i = 0; i < 3; i++) {
      this.positions[o + i] = toWorld(a[i]);
      this.positions[o + 3 + i] = toWorld(b[i]);
    }
    this.colors.set([r, g, bl, r, g, bl], o);
    this.count++;
  };

  /** Rebuilds the lines of this frame (or hides them when disabled). */
  update(rigs: Iterable<DebugRig>, enabled: boolean): void {
    this.lines.visible = enabled;
    if (!enabled) {
      this.count = 0;
      return;
    }
    this.count = 0;
    for (const rig of rigs) rig.debugDraw(this.push);
    const used = this.count * 6;
    this.geometry.setAttribute(
      'position',
      new this.T.BufferAttribute(this.positions.subarray(0, used), 3),
    );
    this.geometry.setAttribute(
      'color',
      new this.T.BufferAttribute(this.colors.subarray(0, used), 3),
    );
    this.geometry.computeBoundingSphere();
  }
}
