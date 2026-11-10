// Shared machinery for rigged Meshy creatures without clips (midge, ant,
// spider): decode the imported data, build a SkinnedMesh rig posed by a
// procedural cycle, and skin that cycle into frames for a vertex animation
// texture (src/creature-batch.js). Poses are rotation/offset deltas expressed
// in model space around each bone's own pivot, so species code never depends
// on the SmartRig bones' local axes.

export const TAU = Math.PI * 2;
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const view = (b64, Type) => {
  const raw = bytes(b64);
  return new Type(raw.buffer, raw.byteOffset, raw.byteLength / Type.BYTES_PER_ELEMENT);
};

// Rotation (model space) and the new foot position of a two-bone leg so that
// `foot` lands on `target`: the knee bends about the leg plane's normal, then
// the hip turns the straightened chain towards the target. Positions are
// bind-pose model-space Vector3 (hip may carry a body offset); lengths come
// from the bind pose. Targets beyond reach are clamped along the hip line.
export function solveLeg(T, hip, knee, foot, target, bindHip = hip) {
  const a = new T.Vector3().subVectors(knee, bindHip),
    b = new T.Vector3().subVectors(foot, knee);
  const la = a.length(),
    lb = b.length();
  const axis = new T.Vector3().crossVectors(a, b).normalize();
  const reach = new T.Vector3().subVectors(target, hip);
  const d = Math.min(la + lb - 1e-3, Math.max(Math.abs(la - lb) + 1e-3, reach.length()));
  const bend = Math.acos(Math.max(-1, Math.min(1, (d * d - la * la - lb * lb) / (2 * la * lb))));
  const bind = Math.acos(Math.max(-1, Math.min(1, a.dot(b) / (la * lb))));
  const kneeDelta = new T.Quaternion().setFromAxisAngle(axis, bend - bind);
  const straight = a.clone().add(b.clone().applyQuaternion(kneeDelta));
  const hipDelta = new T.Quaternion().setFromUnitVectors(
    straight.clone().normalize(),
    reach.clone().normalize(),
  );
  const landed = hip.clone().add(straight.applyQuaternion(hipDelta));
  return { hipDelta, kneeDelta, landed, clamped: Math.abs(d - reach.length()) > 1e-6 };
}

// `D` is the imported data module; `config`:
//   name: scene object names; presentation(T): Matrix4 model metres -> game units;
//   pose(T, t, helpers): model-space deltas {bone: {rotation?, offset?}} at cycle
//   phase t in [0, 1); rest: phase of the bind-like resting pose; frames: VAT
//   frames per cycle.
export function defineCreature(D, config) {
  const index = Object.fromEntries(D.bones.map((b, i) => [b.name, i]));
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
    const bindMatrices = boneInverses.map((m) => m.clone().invert());
    // Bind-pose world rotations and positions (model space).
    const bindWorld = bindMatrices.map((m) => new T.Quaternion().setFromRotationMatrix(m));
    const bindPosition = bindMatrices.map((m) => new T.Vector3().setFromMatrixPosition(m));
    s = { geometry, texture, boneInverses, bindWorld, bindPosition };
    cache.set(T, s);
    return s;
  }
  // Bind-pose vertex of `bone` (dominant weight) with the lowest y: the point
  // that touches the ground for a foot bone.
  const lowest = new Map();
  function lowestVertex(T, name) {
    if (!lowest.has(name)) {
      const { geometry } = shared(T);
      const p = geometry.attributes.position.array,
        j = geometry.attributes.skinIndex.array;
      let best = null;
      for (let v = 0; v < p.length / 3; v++)
        if (j[v * 4] === index[name] && (!best || p[v * 3 + 1] < best.y))
          best = new T.Vector3().fromArray(p, v * 3);
      lowest.set(name, best);
    }
    return lowest.get(name)?.clone() ?? null;
  }
  const helpers = (T) => ({
    bind: (name) => shared(T).bindPosition[index[name]].clone(),
    lowest: (name) => lowestVertex(T, name),
    euler: (x, y, z, order = 'XYZ') => new T.Quaternion().setFromEuler(new T.Euler(x, y, z, order)),
    solveLeg: (...args) => solveLeg(T, ...args),
  });
  const pose = (T, t) => config.pose(T, ((t % 1) + 1) % 1, helpers(T));

  // One rigged instance (SkinnedMesh): corpses, previews, non-WebGL fallback.
  function createRig(T, material) {
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
    rig.name = config.name + '-squelette';
    D.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : rig).add(bones[i]));
    const mesh = new T.SkinnedMesh(
      geometry,
      material || new T.MeshStandardMaterial({ map: texture, roughness: 0.75, side: T.DoubleSide }),
    );
    mesh.name = config.name + '-meshy';
    mesh.frustumCulled = false;
    mesh.userData.meshyShared = true;
    rig.add(mesh);
    const skeleton = new T.Skeleton(bones, boneInverses);
    rig.updateMatrixWorld(true);
    mesh.bind(skeleton, new T.Matrix4());
    const container = new T.Group();
    container.name = config.name;
    config.presentation(T).decompose(rig.position, rig.quaternion, rig.scale);
    container.add(rig);
    const inverseParent = new T.Quaternion();
    const offset = new T.Vector3();
    const instance = {
      container,
      rig,
      mesh,
      skeleton,
      bones: Object.fromEntries(bones.map((b) => [b.name, b])),
      phase: config.rest,
      pose(t) {
        instance.phase = ((t % 1) + 1) % 1;
        const deltas = pose(T, instance.phase);
        bones.forEach((bone, i) => {
          bone.position.copy(rest[i].p);
          bone.quaternion.copy(rest[i].q);
          const p = deltas[bone.name];
          if (!p) return;
          // local = inverse(parent bind world) * delta(model space) * bind world.
          const parent = D.bones[i].parent;
          if (parent >= 0) inverseParent.copy(bindWorld[parent]).invert();
          else inverseParent.identity();
          if (p.rotation)
            bone.quaternion.copy(inverseParent).multiply(p.rotation).multiply(bindWorld[i]);
          if (p.offset)
            bone.position.add(offset.fromArray(p.offset).applyQuaternion(inverseParent));
        });
        rig.updateMatrixWorld(true);
        skeleton.update();
        return instance;
      },
    };
    // Bounds (hit tests, Box3) of the resting pose, before any parent scale.
    instance.pose(config.rest);
    container.updateMatrixWorld(true);
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return instance;
  }

  // Skin the cycle into frames (positions and normals in presentation space).
  function bake(T, frames = config.frames) {
    const { geometry, boneInverses } = shared(T);
    const instance = createRig(T, new T.MeshBasicMaterial());
    const bones = instance.skeleton.bones;
    const base = geometry.attributes.position.array,
      normal = geometry.attributes.normal.array,
      joints = geometry.attributes.skinIndex.array,
      weights = geometry.attributes.skinWeight.array;
    const count = base.length / 3;
    const positions = new Float32Array(frames * count * 3),
      normals = new Float32Array(frames * count * 3);
    const P = config.presentation(T);
    const skin = bones.map(() => new T.Matrix4());
    const rigInverse = new T.Matrix4();
    const m = new T.Matrix4(),
      n = new T.Matrix3();
    const v = new T.Vector3(),
      w = new T.Vector3(),
      acc = new T.Vector3(),
      nacc = new T.Vector3();
    for (let f = 0; f < frames; f++) {
      instance.pose(f / frames);
      rigInverse.copy(instance.rig.matrixWorld).invert();
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
          nacc.addScaledVector(
            w.fromArray(normal, k * 3).applyMatrix3(n.setFromMatrix4(m)),
            weight,
          );
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

  return {
    name: config.name,
    data: D,
    source: D.source,
    frames: config.frames,
    rest: config.rest,
    boneIndex: (name) => index[name],
    helpers,
    presentation: (T) => config.presentation(T),
    pose,
    geometry: (T) => shared(T).geometry,
    texture: (T) => shared(T).texture,
    createRig,
    bake,
  };
}
