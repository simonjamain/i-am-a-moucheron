// Ribbons of air (docs/air-ribbons.md): white strips that leave the wings and stay in
// the air where they were drawn. In normal flight they are absent; approaching the
// stall they appear at the tips and over the wings, and in the stall they tear away
// from the wing in turbulent, widening streamers. Nothing is drawn on the screen: the
// ribbons belong to the world and everybody sees them on every aircraft. One geometry
// and one draw call hold every ribbon; the points are emitted in the world and age
// where they were left (like src/engine-smoke.ts).
import type * as THREE from 'three/webgpu';
import { AIRCRAFT_GEOMETRY } from './aircraft-geometry.ts';
import { MAP } from './scale.ts';
import { tsl } from './gpu-passes.ts';
import type { Three } from './types.ts';

/** Ribbons only form above this speed (reference m/s): a parked plane draws none. */
export const RIBBON_MIN_SPEED = 6;
/** The ribbons start at this fraction of the stall angle, and are full at the stall. */
export const ONSET_START = 0.55;
/** Angle (rad) over which the stall deepens past the stall angle (plane-physics.ts). */
export const STALL_SPAN = 0.2;
const POINTS = 18;
const MAX_RIBBONS = 48;
/** Each emitted segment is drawn as this many pieces of a smooth curve (Catmull-Rom). */
const SUBDIV = 4;
const SAMPLES = (POINTS - 1) * SUBDIV + 1;
/** Ribbons per plane: one at each wingtip. */
const PER_PLANE = 2;
/** Constant width of a ribbon, in model units (only the opacity grows with the stall). */
const WIDTH = 0.16;
const SPACING = 0.45; // model units between two emitted points
const MAX_STEP = 0.07; // seconds: also emit a point when the plane hardly moves

/** Wing aerodynamics read from the plane's parameters (PlaneParams). */
export interface WingAero {
  stallAngle: number;
  zeroLift: number;
}
/** Condition of the air over the wings, each value in [0, 1]. */
export interface Airflow {
  /** Approach of the stall: 0 well away, 1 at the stall angle. */
  onset: number;
  /** Depth of the stall: 0 at the stall angle, 1 deeply stalled. */
  stalled: number;
  /** Overall strength of the ribbons (and of the hiss). */
  level: number;
}
export const CALM: Airflow = Object.freeze({ onset: 0, stalled: 0, level: 0 });

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Angle of attack (rad) of a velocity seen from the aircraft, nose along -Z, up along +Y. */
export function attackAngle(
  T: Three,
  quaternion: THREE.Quaternion,
  velocity: THREE.Vector3,
): { alpha: number; speed: number } {
  const local = velocity.clone().applyQuaternion(quaternion.clone().invert());
  return { alpha: Math.atan2(-local.y, -local.z), speed: velocity.length() / MAP.ratio };
}

/** State of the airflow for an angle of attack and a speed (reference metres per second). */
export function airflow(alpha: number, speed: number, wing: WingAero): Airflow {
  if (!(speed > RIBBON_MIN_SPEED) || !Number.isFinite(alpha)) return CALM;
  // The same angle plane-physics.ts stalls on: wing set at an incidence.
  const effective = Math.abs(alpha + wing.zeroLift);
  const onset = smooth(ONSET_START * wing.stallAngle, wing.stallAngle, effective);
  const stalled = Math.min(1, Math.max(0, (effective - wing.stallAngle) / STALL_SPAN));
  return { onset, stalled, level: Math.max(0.5 * onset, stalled) };
}

/** What a ribbon looks like for an airflow: sizes in model units, life in seconds. */
export interface RibbonLook {
  opacity: number;
  width: number;
  life: number;
  wobble: number;
}
export function ribbonLook(flow: Airflow): RibbonLook {
  return {
    opacity: 0.1 + 0.6 * flow.level,
    width: WIDTH,
    life: 0.55 + 0.45 * flow.onset + 0.9 * flow.stalled,
    wobble: 0.04 * flow.onset + 0.7 * flow.stalled,
  };
}

/**
 * Where the ribbons leave the wings, in model units: both wingtips, a little inside the
 * wing (and ahead of its trailing edge) so the square start of the ribbon stays hidden
 * in the model.
 */
export function wingAnchors(type: string): readonly (readonly [number, number, number])[] {
  const boxes = AIRCRAFT_GEOMETRY[type]?.boxes ?? [];
  let right: (typeof boxes)[number] | null = null,
    left: (typeof boxes)[number] | null = null;
  for (const box of boxes) {
    if (!right || box.at[0] + box.half[0] > right.at[0] + right.half[0]) right = box;
    if (!left || box.at[0] - box.half[0] < left.at[0] - left.half[0]) left = box;
  }
  if (!right || !left) return [];
  const tip = (box: typeof right, side: 1 | -1): [number, number, number] => [
    side * (side > 0 ? box.at[0] + box.half[0] : box.half[0] - box.at[0]) * 0.9,
    box.at[1],
    box.at[2] + box.half[2] * 0.5,
  ];
  return [tip(right, 1), tip(left, -1)];
}

interface RibbonPoint {
  x: number;
  y: number;
  z: number;
  age: number;
  seed: number;
  look: RibbonLook;
}
interface Ribbon {
  points: RibbonPoint[];
  head: THREE.Vector3;
  live: boolean;
  look: RibbonLook;
  unit: number;
  sinceLast: number;
}

export class AirRibbons {
  T: Three;
  random: () => number;
  ribbons = new Map<string, Ribbon>();
  /** Airflow of each aircraft at its last emission (read by the sound). */
  levels = new Map<string, Airflow>();
  positions = new Float32Array(MAX_RIBBONS * SAMPLES * 2 * 3);
  alphas = new Float32Array(MAX_RIBBONS * SAMPLES * 2);
  sides = new Float32Array(MAX_RIBBONS * SAMPLES * 2);
  indices = new Uint16Array(MAX_RIBBONS * (SAMPLES - 1) * 6);
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.NodeMaterial>;

  constructor(T: Three, scene: THREE.Object3D, random: () => number = Math.random) {
    this.T = T;
    this.random = random;
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3));
    geometry.setAttribute('alpha', new T.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('side', new T.BufferAttribute(this.sides, 1));
    geometry.setIndex(new T.BufferAttribute(this.indices, 1));
    geometry.setDrawRange(0, 0);
    // White ribbon, faded by the vertex alpha and towards its two edges.
    const { attribute, vec4 } = tsl(T);
    const edge = attribute('side', 'float');
    const material = new T.NodeMaterial();
    material.fragmentNode = vec4(
      1,
      1,
      1,
      attribute('alpha', 'float').mul(edge.mul(edge).oneMinus()),
    );
    material.transparent = true;
    material.depthWrite = false;
    material.side = T.DoubleSide;
    this.mesh = new T.Mesh(geometry, material);
    this.mesh.name = 'air-ribbons';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /**
   * One aircraft this frame: reads its airflow from the velocity and the model's
   * orientation, and extends its ribbons while the air is not calm.
   */
  emit(
    id: string,
    type: string,
    model: THREE.Object3D,
    velocity: THREE.Vector3,
    wing: WingAero,
    flying: boolean,
    dt: number,
  ): Airflow {
    const { alpha, speed } = attackAngle(this.T, model.quaternion, velocity);
    const flow = flying ? airflow(alpha, speed, wing) : CALM;
    this.levels.set(id, flow);
    const anchors = wingAnchors(type);
    model.updateWorldMatrix(true, false);
    const unit = model.getWorldScale(new this.T.Vector3()).x;
    anchors.forEach((anchor, i) => {
      const key = id + ':' + i;
      let ribbon = this.ribbons.get(key);
      if (flow.level <= 0.01) {
        if (ribbon) ribbon.live = false;
        return;
      }
      if (!ribbon) {
        if (this.ribbons.size >= MAX_RIBBONS) return;
        ribbon = {
          points: [],
          head: new this.T.Vector3(),
          live: false,
          look: ribbonLook(flow),
          unit,
          sinceLast: 0,
        };
        this.ribbons.set(key, ribbon);
      }
      ribbon.head.set(...anchor);
      model.localToWorld(ribbon.head);
      ribbon.live = true;
      ribbon.look = ribbonLook(flow);
      ribbon.unit = unit;
      ribbon.sinceLast += dt;
      const last = ribbon.points[0];
      const far =
        !last ||
        Math.hypot(last.x - ribbon.head.x, last.y - ribbon.head.y, last.z - ribbon.head.z) >
          SPACING * unit;
      if (far || ribbon.sinceLast > MAX_STEP) {
        ribbon.sinceLast = 0;
        ribbon.points.unshift({
          x: ribbon.head.x,
          y: ribbon.head.y,
          z: ribbon.head.z,
          age: 0,
          seed: this.random() * 6.28,
          look: ribbon.look,
        });
        if (ribbon.points.length > POINTS - 1) ribbon.points.pop();
      }
    });
    return flow;
  }

  /** Forgets an aircraft that left the room. */
  forget(id: string): void {
    this.levels.delete(id);
    for (let i = 0; i < PER_PLANE; i++) this.ribbons.delete(id + ':' + i);
  }

  /** Ages every point, drops the dead ones and rebuilds the strip facing the camera. */
  update(dt: number, camera: THREE.Camera | null | undefined): number {
    const T = this.T;
    const eye = camera?.position ?? new T.Vector3();
    const tangent = new T.Vector3(),
      view = new T.Vector3(),
      sideways = new T.Vector3(),
      up = new T.Vector3(0, 1, 0);
    let vertex = 0,
      index = 0;
    for (const [key, ribbon] of this.ribbons) {
      for (const p of ribbon.points) p.age += dt;
      ribbon.points = ribbon.points.filter((p) => p.age < p.look.life);
      if (!ribbon.live && !ribbon.points.length) {
        this.ribbons.delete(key);
        continue;
      }
      // The strip starts at the wing itself while the aircraft emits.
      const chain: { p: THREE.Vector3; look: RibbonLook; age: number; seed: number }[] = [];
      if (ribbon.live) chain.push({ p: ribbon.head.clone(), look: ribbon.look, age: 0, seed: 0 });
      for (const p of ribbon.points)
        chain.push({ p: new T.Vector3(p.x, p.y, p.z), look: p.look, age: p.age, seed: p.seed });
      const n = chain.length;
      if (n < 2) continue;
      if (vertex + SAMPLES * 2 > MAX_RIBBONS * SAMPLES * 2) break;
      // Each emitted point drifts off the line of the wing, more as the stall deepens, and
      // fades along the ribbon: the oldest point a ribbon can hold is already invisible,
      // so nothing is cut off while it is still visible.
      const bent = chain.map((c, i) => {
        tangent.copy(chain[Math.min(n - 1, i + 1)].p).sub(chain[Math.max(0, i - 1)].p);
        if (tangent.lengthSq() < 1e-12) tangent.set(0, 0, -1);
        tangent.normalize();
        sideways.crossVectors(tangent, up);
        if (sideways.lengthSq() < 1e-8) sideways.set(1, 0, 0);
        sideways.normalize();
        const wobble = c.look.wobble * ribbon.unit * Math.min(1, c.age * 3);
        const p = c.p.clone();
        p.addScaledVector(sideways, Math.sin(c.age * 9 + c.seed) * wobble);
        p.addScaledVector(up, Math.cos(c.age * 7 + c.seed * 1.7) * wobble * 0.6);
        const t = Math.max(Math.min(1, c.age / c.look.life), Math.min(1, i / (POINTS - 1)));
        return {
          p,
          alpha: c.look.opacity * (1 - t) ** 1.6,
          half: 0.5 * c.look.width * ribbon.unit,
        };
      });
      // A smooth curve through the points (centripetal Catmull-Rom, SUBDIV pieces per
      // segment): the turbulence stays round however few points are emitted, and unevenly
      // spaced points (one just emitted next to the wing) never make a loop or a kink.
      const curve: { p: THREE.Vector3; alpha: number; half: number }[] = [];
      for (let i = 0; i < n - 1; i++) {
        const p1 = bent[i],
          p2 = bent[i + 1];
        // Ends of the ribbon extend their last segment in a straight line.
        const p0 = i > 0 ? bent[i - 1].p : p1.p.clone().multiplyScalar(2).sub(p2.p),
          p3 = i + 2 < n ? bent[i + 2].p : p2.p.clone().multiplyScalar(2).sub(p1.p);
        const t1 = Math.sqrt(Math.max(1e-9, p0.distanceTo(p1.p))),
          t2 = t1 + Math.sqrt(Math.max(1e-9, p1.p.distanceTo(p2.p))),
          t3 = t2 + Math.sqrt(Math.max(1e-9, p2.p.distanceTo(p3)));
        for (let k = 0; k < SUBDIV; k++) {
          const f = k / SUBDIV,
            t = t1 + (t2 - t1) * f;
          const lerp = (a: THREE.Vector3, b: THREE.Vector3, ta: number, tb: number) =>
            a
              .clone()
              .multiplyScalar((tb - t) / (tb - ta))
              .addScaledVector(b, (t - ta) / (tb - ta));
          const a1 = lerp(p0, p1.p, 0, t1),
            a2 = lerp(p1.p, p2.p, t1, t2),
            a3 = lerp(p2.p, p3, t2, t3);
          const b1 = lerp(a1, a2, 0, t2),
            b2 = lerp(a2, a3, t1, t3);
          curve.push({
            p: lerp(b1, b2, t1, t2),
            alpha: p1.alpha + (p2.alpha - p1.alpha) * f,
            half: p1.half + (p2.half - p1.half) * f,
          });
        }
      }
      curve.push(bent[n - 1]);
      const first = vertex;
      curve.forEach((c, i) => {
        tangent.copy(curve[Math.min(curve.length - 1, i + 1)].p).sub(curve[Math.max(0, i - 1)].p);
        if (tangent.lengthSq() < 1e-12) tangent.set(0, 0, -1);
        tangent.normalize();
        view.copy(eye).sub(c.p);
        sideways.crossVectors(tangent, view);
        if (sideways.lengthSq() < 1e-12) sideways.set(0, 1, 0);
        sideways.normalize();
        for (const s of [-1, 1]) {
          this.positions.set(
            [
              c.p.x + sideways.x * c.half * s,
              c.p.y + sideways.y * c.half * s,
              c.p.z + sideways.z * c.half * s,
            ],
            vertex * 3,
          );
          this.alphas[vertex] = c.alpha;
          this.sides[vertex] = s;
          vertex++;
        }
      });
      for (let k = 0; k < curve.length - 1; k++) {
        const a = first + k * 2;
        this.indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], index);
        index += 6;
      }
    }
    const geometry = this.mesh.geometry;
    geometry.setDrawRange(0, index);
    for (const name of ['position', 'alpha', 'side']) geometry.attributes[name].needsUpdate = true;
    if (geometry.index) geometry.index.needsUpdate = true;
    return index / 6;
  }

  clear(): void {
    this.ribbons.clear();
    this.levels.clear();
    this.mesh.geometry.setDrawRange(0, 0);
  }
}
