import { CHARACTER_DATA as D } from './character-data.js';

// Issue #111: the playable character (user-approved Meshy + Mixamo GLB). One
// shared geometry/material/clip set; each player owns its bones, skeleton and
// mixer. Missing animations (pistol aim, sitting, falling) are simple
// procedural poses that orient bones in world space, so they do not depend on
// the Mixamo bones' local axes.

export const CHARACTER_HEIGHT = 1.7; // model metres (feet at y = 0)
export const LEGACY_HEIGHT = 2.46; // procedural humanoid units used by the game
export const CHARACTER_CLIPS = Object.freeze({ idle: 'Idle_12', walk: 'Walking', run: 'Running' });
// Ground speeds (m/s) where the gait switches, and the speed each in-place clip
// was authored for (its playback rate follows the real speed to limit sliding).
export const GAIT = Object.freeze({ walk: 0.35, run: 3, walkClip: 1.4, runClip: 5 });

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const view = (b64, Type) => {
  const raw = bytes(b64);
  return new Type(raw.buffer, raw.byteOffset, raw.byteLength / Type.BYTES_PER_ELEMENT);
};
// Same rule as three.js PropertyBinding.sanitizeNodeName (":" is reserved).
export const boneName = (name) => name.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');

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
  const material = new T.MeshStandardMaterial({ map: texture, roughness: 0.8, side: T.DoubleSide });
  const inverses = view(D.inverseBindMatrices, Float32Array);
  const boneInverses = D.bones.map((_, i) => new T.Matrix4().fromArray(inverses, i * 16));
  const clips = {};
  for (const [name, clip] of Object.entries(D.clips)) {
    const tracks = clip.tracks.map((track) => {
      const times = view(track.times, Float32Array);
      const target = boneName(D.bones[track.bone].name);
      if (track.path === 'rotation') {
        const values = Float32Array.from(view(track.values, Int16Array), (v) => v / 32767);
        return new T.QuaternionKeyframeTrack(target + '.quaternion', times, values);
      }
      return new T.VectorKeyframeTrack(
        target + '.position',
        times,
        view(track.values, Float32Array),
      );
    });
    clips[name] = new T.AnimationClip(name, clip.duration, tracks);
  }
  s = { geometry, material, boneInverses, clips };
  cache.set(T, s);
  return s;
}

// Rotate `bone` (weighted) so that the segment bone → child points along `direction`
// (world space). Independent of the bone's local axes.
function pointBone(T, bone, child, direction, weight) {
  if (!bone || !child || weight <= 0) return;
  bone.updateWorldMatrix(true, true);
  const from = child.getWorldPosition(new T.Vector3()).sub(bone.getWorldPosition(new T.Vector3()));
  if (from.lengthSq() < 1e-12) return;
  const turn = new T.Quaternion().setFromUnitVectors(
    from.normalize(),
    direction.clone().normalize(),
  );
  const world = bone.getWorldQuaternion(new T.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
  const target = parent.multiply(turn.multiply(world));
  bone.quaternion.slerp(target, Math.min(1, weight));
  bone.updateWorldMatrix(false, true);
}

export function createCharacter(T) {
  const { geometry, material, boneInverses, clips } = shared(T);
  const bones = D.bones.map((b) => {
    const bone = new T.Bone();
    bone.name = boneName(b.name);
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.r);
    return bone;
  });
  const container = new T.Group();
  container.name = 'personnage';
  D.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : container).add(bones[i]));
  const mesh = new T.SkinnedMesh(geometry, material);
  mesh.name = 'personnage-meshy';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.meshyShared = true;
  container.add(mesh);
  const skeleton = new T.Skeleton(bones, boneInverses);
  container.updateMatrixWorld(true);
  mesh.bind(skeleton, new T.Matrix4());
  // Bind-pose bounds (hit tests, Box3): compute them before any parent scale.
  skeleton.update();
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  const bone = (n) => byName['mixamorig' + n];
  const mixer = new T.AnimationMixer(container);
  const actions = Object.fromEntries(
    Object.entries(CHARACTER_CLIPS).map(([gait, clip]) => [gait, mixer.clipAction(clips[clip])]),
  );
  for (const action of Object.values(actions)) action.play().setEffectiveWeight(0);
  actions.idle.setEffectiveWeight(1);
  let current = 'idle';
  const v = (x, y, z) => new T.Vector3(x, y, z);
  const character = {
    container,
    mesh,
    skeleton,
    mixer,
    bones: byName,
    gait: () => current,
    // state: { speed (m/s), aim (world Vector3 or null), seated, falling }
    update(dt, state = {}) {
      const speed = state.speed || 0;
      const next =
        state.seated || state.falling
          ? 'idle'
          : speed >= GAIT.run
            ? 'run'
            : speed >= GAIT.walk
              ? 'walk'
              : 'idle';
      if (next !== current) {
        actions[next].reset().setEffectiveWeight(1).fadeIn(0.18);
        actions[current].fadeOut(0.18);
        current = next;
      }
      const authored = current === 'run' ? GAIT.runClip : GAIT.walkClip;
      actions[current].timeScale =
        current === 'idle' ? 1 : Math.max(0.5, Math.min(1.5, speed / authored));
      mixer.update(Math.max(0, Math.min(0.1, dt || 0)));
      container.updateMatrixWorld(true);
      const q = container.getWorldQuaternion(new T.Quaternion());
      const local = (x, y, z) => v(x, y, z).applyQuaternion(q);
      if (state.seated) {
        // Thighs forward, shins down, hands forward on the controls.
        for (const side of ['Left', 'Right']) {
          pointBone(T, bone(side + 'UpLeg'), bone(side + 'Leg'), local(0, -0.25, 1), 1);
          pointBone(T, bone(side + 'Leg'), bone(side + 'Foot'), local(0, -1, 0.15), 1);
          pointBone(
            T,
            bone(side + 'Arm'),
            bone(side + 'ForeArm'),
            local(side === 'Left' ? 0.15 : -0.15, -0.55, 1),
            0.9,
          );
          pointBone(T, bone(side + 'ForeArm'), bone(side + 'Hand'), local(0, -0.1, 1), 0.9);
        }
      } else if (state.falling) {
        // Arms raised and spread, legs slightly apart.
        for (const side of ['Left', 'Right']) {
          const s = side === 'Left' ? 1 : -1;
          pointBone(T, bone(side + 'Arm'), bone(side + 'ForeArm'), local(s * 0.8, 0.8, 0), 1);
          pointBone(T, bone(side + 'ForeArm'), bone(side + 'Hand'), local(s * 0.4, 1, 0), 1);
          pointBone(T, bone(side + 'UpLeg'), bone(side + 'Leg'), local(s * 0.3, -1, -0.15), 1);
        }
      }
      if (state.aim && state.aim.lengthSq() > 1e-12) {
        // Pistol: right arm straight along the aim, left hand supports it.
        const aim = state.aim.clone().normalize();
        pointBone(T, bone('RightArm'), bone('RightForeArm'), aim, 1);
        pointBone(T, bone('RightForeArm'), bone('RightHand'), aim, 1);
        const hand = bone('RightHand').getWorldPosition(new T.Vector3());
        const shoulder = bone('LeftArm').getWorldPosition(new T.Vector3());
        pointBone(T, bone('LeftArm'), bone('LeftForeArm'), hand.clone().sub(shoulder), 0.85);
        pointBone(
          T,
          bone('LeftForeArm'),
          bone('LeftHand'),
          hand.sub(bone('LeftForeArm').getWorldPosition(new T.Vector3())),
          0.85,
        );
      }
    },
  };
  return character;
}
