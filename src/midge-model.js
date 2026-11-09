import { MIDGE_DATA as D } from './midge-data.js';

// Midge enemy: user-supplied Meshy "Angry Little Fly" with its SmartRig skeleton
// plus two wing bones added at import. The GLB has no clip: the flight cycle
// below poses the bones procedurally (wing beat, body bob, dangling legs,
// abdomen and antennae). Swarms reach thousands of midges, so the cycle is
// skinned once on the CPU into a vertex animation texture (VAT) that a single
// InstancedMesh samples per instance phase (src/midge-batch.js).

// One loop holds an integer number of wing beats so every secondary motion
// loops with it. FRAMES_PER_BEAT samples are interpolated linearly in the shader.
export const MIDGE_FLIGHT = Object.freeze({
  loop: 1, // seconds
  beats: 7, // wing beats per loop (7 Hz)
  framesPerBeat: 12,
  frames: 84,
  // Wing elevation (rad, above horizontal) at the top and bottom of the stroke.
  wingUp: 0.95,
  wingDown: -0.2,
  // Angle behind the lateral axis (rad): mean and half range over a stroke.
  wingSweep: 0.55,
  wingSweepRange: 0.3,
  wingTwist: 0.4,
});
// Presentation in the game's midge units: head towards -Z (client heading),
// thorax at the origin, body length about 1.9 units (old procedural midge: 1.55).
export const MIDGE_MODEL = Object.freeze({ scale: 0.8, centre: [0, 0.82, 0.05] });

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const view = (b64, Type) => {
  const raw = bytes(b64);
  return new Type(raw.buffer, raw.byteOffset, raw.byteLength / Type.BYTES_PER_ELEMENT);
};
const TAU = Math.PI * 2;
const index = Object.fromEntries(D.bones.map((b, i) => [b.name, i]));
export const MIDGE_BONES = Object.freeze({
  root: 'Bone_000',
  abdomen: ['Bone_007', 'Bone_006', 'Bone_005'],
  head: 'Bone_017',
  antennae: [
    ['Bone_033', 'Bone_032', 'Bone_031'],
    ['Bone_037', 'Bone_036', 'Bone_035'],
  ],
  // Upper leg bones, front to rear; second bone is the knee.
  legs: [
    ['Bone_026', 'Bone_025'],
    ['Bone_029', 'Bone_028'],
    ['Bone_020', 'Bone_019'],
    ['Bone_023', 'Bone_022'],
    ['Bone_012', 'Bone_011'],
    ['Bone_015', 'Bone_014'],
  ],
  wings: ['Wing_L', 'Wing_R'],
});

const cache = new WeakMap();
function shared(T) {
  let s = cache.get(T);
  if (s) return s;
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(view(D.positions, Float32Array), 3));
  geometry.setAttribute('uv', new T.BufferAttribute(view(D.uvs, Float32Array), 2));
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(Array.from(bytes(D.joints)), 4));
  geometry.setAttribute(
    'skinWeight',
    new T.Float32BufferAttribute(
      Array.from(bytes(D.weights), (w) => w / 255),
      4,
    ),
  );
  geometry.setIndex(new T.BufferAttribute(view(D.indices, Uint16Array), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const texture =
    typeof document === 'undefined' ? new T.Texture() : new T.TextureLoader().load(D.texture);
  texture.colorSpace = T.SRGBColorSpace;
  texture.flipY = false;
  const inverses = view(D.inverseBindMatrices, Float32Array);
  const boneInverses = D.bones.map((_, i) => new T.Matrix4().fromArray(inverses, i * 16));
  // Bind-pose world rotations, to express model-space rotations in bone space.
  const bindWorld = boneInverses.map((m) =>
    new T.Quaternion().setFromRotationMatrix(m.clone().invert()),
  );
  s = { geometry, texture, boneInverses, bindWorld };
  cache.set(T, s);
  return s;
}

// Bind-pose span of a wing (model space): hinge -> farthest vertex of its shell.
const spans = new WeakMap();
function wingSpan(T, side) {
  let list = spans.get(T);
  if (!list) {
    const { geometry } = shared(T);
    const p = geometry.attributes.position.array,
      j = geometry.attributes.skinIndex.array;
    list = MIDGE_BONES.wings.map((name, k) => {
      const bone = index[name];
      const hinge = new T.Vector3().fromArray(D.source.addedWingBones[k].hinge);
      let tip = hinge.clone(),
        best = 0;
      for (let v = 0; v < p.length / 3; v++) {
        if (j[v * 4] !== bone) continue;
        const d = new T.Vector3().fromArray(p, v * 3).distanceToSquared(hinge);
        if (d > best) ((best = d), tip.fromArray(p, v * 3));
      }
      return tip.sub(hinge).normalize();
    });
    spans.set(T, list);
  }
  return list[side];
}

export function midgeTexture(T) {
  return shared(T).texture;
}

// Presentation matrix: model metres (feet at y = 0, head +Z) -> game midge units.
export function presentation(T) {
  const [x, y, z] = MIDGE_MODEL.centre;
  return new T.Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new T.Matrix4().makeScale(MIDGE_MODEL.scale, MIDGE_MODEL.scale, MIDGE_MODEL.scale))
    .multiply(new T.Matrix4().makeTranslation(-x, -y, -z));
}

// Model-space rotation deltas of the flight cycle at loop phase t in [0, 1).
// The fly faces +Z, Y is up, so +X is its left side.
export function flightPose(T, t) {
  const F = MIDGE_FLIGHT;
  const beat = TAU * F.beats * t; // wing stroke angle
  const slow = TAU * t; // one secondary sway per loop
  const e = (x, y, z, order = 'XYZ') =>
    new T.Quaternion().setFromEuler(new T.Euler(x, y, z, order));
  const pose = {};
  // Stroke: cos = 1 at the top. `sweep` is the angle behind the lateral axis:
  // the wing moves forward during the downstroke (sin > 0) and back on the
  // upstroke, pushing air backwards (forward flight), and pitches (twists
  // about its span) at the turns, so the tip draws a figure of eight.
  const stroke = Math.cos(beat);
  const elevation = F.wingDown + ((F.wingUp - F.wingDown) * (1 + stroke)) / 2;
  const sweep = F.wingSweep - F.wingSweepRange * Math.sin(beat);
  const twist = -F.wingTwist * Math.sin(beat);
  for (const [k, name] of MIDGE_BONES.wings.entries()) {
    const s = k ? -1 : 1;
    const direction = new T.Vector3(
      s * Math.cos(elevation) * Math.cos(sweep),
      Math.sin(elevation),
      -Math.cos(elevation) * Math.sin(sweep),
    );
    const turn = new T.Quaternion().setFromUnitVectors(wingSpan(T, k), direction);
    pose[name] = {
      rotation: new T.Quaternion().setFromAxisAngle(direction, s * twist).multiply(turn),
    };
  }
  // Body: rises on each downstroke, slow pitch and roll sway over the loop.
  pose[MIDGE_BONES.root] = {
    offset: [0.02 * Math.sin(slow * 2), 0.035 * Math.sin(beat - 0.6), 0],
    rotation: e(0.06 * Math.sin(slow) - 0.04, 0, 0.07 * Math.sin(slow + 1)),
  };
  // Abdomen: a lagging wave down the three segments.
  MIDGE_BONES.abdomen.forEach((name, k) => {
    pose[name] = { rotation: e(0.08 + 0.07 * Math.sin(slow * 2 - k * 0.7), 0, 0) };
  });
  pose[MIDGE_BONES.head] = { rotation: e(0.05 * Math.sin(slow * 2 + 1), 0.08 * Math.sin(slow), 0) };
  MIDGE_BONES.antennae.forEach((chain, side) => {
    chain.forEach((name, k) => {
      pose[name] = {
        rotation: e(
          0.22 * Math.sin(slow * 3 + side * 1.3 - k * 0.9),
          0,
          0.1 * Math.sin(slow * 4 + side),
        ),
      };
    });
  });
  // Legs: folded under the body and trailing back, swinging slightly.
  MIDGE_BONES.legs.forEach(([upper, knee], k) => {
    const s = k % 2 ? -1 : 1; // even = +X (left)
    const pair = Math.floor(k / 2); // 0 front, 2 rear
    const swing = 0.12 * Math.sin(slow * 2 - pair * 0.8 + (s > 0 ? 0 : 0.5));
    pose[upper] = { rotation: e(0.45 + pair * 0.2 + swing, 0, -s * 0.85, 'ZXY') };
    pose[knee] = { rotation: e(0.3 + swing * 0.5, 0, s * 0.35, 'ZXY') };
  });
  return pose;
}

// One rigged midge (SkinnedMesh): corpses, previews and non-WebGL fallback.
// `pose(t)` applies the flight cycle at loop phase t.
export function createMidgeRig(T, material) {
  const { geometry, texture, boneInverses, bindWorld } = shared(T);
  const bones = D.bones.map((b) => {
    const bone = new T.Bone();
    bone.name = b.name;
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.r);
    return bone;
  });
  const rest = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  const rig = new T.Group();
  rig.name = 'moucheron-squelette';
  D.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : rig).add(bones[i]));
  const mesh = new T.SkinnedMesh(
    geometry,
    material || new T.MeshStandardMaterial({ map: texture, roughness: 0.75, side: T.DoubleSide }),
  );
  mesh.name = 'moucheron-meshy';
  mesh.frustumCulled = false;
  rig.add(mesh);
  const skeleton = new T.Skeleton(bones, boneInverses);
  rig.updateMatrixWorld(true);
  mesh.bind(skeleton, new T.Matrix4());
  const container = new T.Group();
  container.name = 'moucheron';
  presentation(T).decompose(rig.position, rig.quaternion, rig.scale);
  container.add(rig);
  const inverseParent = new T.Quaternion();
  const rig_ = {
    container,
    mesh,
    skeleton,
    bones: Object.fromEntries(bones.map((b) => [b.name, b])),
    pose(t) {
      const pose = flightPose(T, ((t % 1) + 1) % 1);
      bones.forEach((bone, i) => {
        bone.position.copy(rest[i].p);
        bone.quaternion.copy(rest[i].q);
        const p = pose[bone.name];
        if (!p) return;
        // local = inverse(parent bind world) * delta(model space) * bind world.
        const parent = D.bones[i].parent;
        if (parent >= 0) inverseParent.copy(bindWorld[parent]).invert();
        else inverseParent.identity();
        if (p.rotation)
          bone.quaternion.copy(inverseParent).multiply(p.rotation).multiply(bindWorld[i]);
        if (p.offset)
          bone.position.add(new T.Vector3().fromArray(p.offset).applyQuaternion(inverseParent));
      });
      rig.updateMatrixWorld(true);
      return rig_;
    },
    // Flight cycle at time `ms` for a midge whose roster phase is in radians.
    animate(ms, phase = 0) {
      return rig_.pose(ms / 1000 / MIDGE_FLIGHT.loop + phase / TAU);
    },
  };
  // Bounds (hit tests, Box3) of a mid-stroke pose, before any parent scale.
  rig_.pose(0.3 / MIDGE_FLIGHT.beats);
  container.updateMatrixWorld(true);
  skeleton.update();
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return rig_;
}

// Skin the flight cycle into frames (positions and normals in presentation
// space). Returns Float32Arrays of frames * vertices * 3.
export function bakeFlight(T, frames = MIDGE_FLIGHT.frames) {
  const { geometry, boneInverses } = shared(T);
  const rig = createMidgeRig(T, new T.MeshBasicMaterial());
  const bones = rig.skeleton.bones;
  const base = geometry.attributes.position.array,
    normal = geometry.attributes.normal.array,
    joints = geometry.attributes.skinIndex.array,
    weights = geometry.attributes.skinWeight.array;
  const count = base.length / 3;
  const positions = new Float32Array(frames * count * 3),
    normals = new Float32Array(frames * count * 3);
  const P = presentation(T);
  const skin = bones.map(() => new T.Matrix4());
  const rigInverse = new T.Matrix4();
  const m = new T.Matrix4(),
    n = new T.Matrix3();
  const v = new T.Vector3(),
    w = new T.Vector3(),
    acc = new T.Vector3(),
    nacc = new T.Vector3();
  for (let f = 0; f < frames; f++) {
    rig.pose(f / frames);
    const rigRoot = rig.container.children[0];
    rigInverse.copy(rigRoot.matrixWorld).invert();
    // Bone matrices relative to the rig root (model metres), then presentation.
    bones.forEach((bone, i) =>
      skin[i]
        .multiplyMatrices(rigInverse, bone.matrixWorld)
        .multiply(boneInverses[i])
        .premultiply(P),
    );
    for (let k = 0; k < count; k++) {
      acc.set(0, 0, 0);
      nacc.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const weight = weights[k * 4 + j];
        if (!weight) continue;
        m.copy(skin[joints[k * 4 + j]]);
        acc.addScaledVector(v.fromArray(base, k * 3).applyMatrix4(m), weight);
        nacc.addScaledVector(w.fromArray(normal, k * 3).applyMatrix3(n.setFromMatrix4(m)), weight);
      }
      nacc.normalize();
      const o = (f * count + k) * 3;
      positions[o] = acc.x;
      positions[o + 1] = acc.y;
      positions[o + 2] = acc.z;
      normals[o] = nacc.x;
      normals[o + 1] = nacc.y;
      normals[o + 2] = nacc.z;
    }
  }
  return { frames, count, positions, normals };
}

export const MIDGE_SOURCE = D.source;
export const midgeBoneIndex = (name) => index[name];
export function midgeGeometry(T) {
  return shared(T).geometry;
}
