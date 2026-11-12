import { CHARACTER_DATA as COWBOY } from './character-data.js';
import { DEFAULT_APPEARANCE, appearanceId } from './character-appearances.js';

// Issue #111: the playable character (user-approved Meshy + Mixamo GLB). One
// shared geometry/material/clip set per appearance; each player owns its bones,
// skeleton and mixer. Missing animations (pistol aim, sitting, falling, and the
// idle of an export without one) are simple procedural poses that orient bones
// in world space, so they do not depend on the Mixamo bones' local axes.
// The default appearance is bundled; the others load on demand (loadCharacter).

export const CHARACTER_HEIGHT = 1.7; // model metres (feet at y = 0), every appearance
export const LEGACY_HEIGHT = 2.46; // procedural humanoid units used by the game
// Clip names of the default (cowboy) export; the other imports name clips by gait.
export const CHARACTER_CLIPS = Object.freeze({ idle: 'Idle_12', walk: 'Walking', run: 'Running' });
// Ground speeds (m/s) where the gait switches, and the speed each in-place clip
// was authored for (its playback rate follows the real speed to limit sliding).
export const GAIT = Object.freeze({ walk: 0.35, run: 3, walkClip: 1.4, runClip: 5 });

// Literal specifiers so scripts/assemble.mjs can version and check them.
const LOADERS = {
  frontier: () => import('./character-frontier-data.js'),
  'sky-pilot': () => import('./character-sky-pilot-data.js'),
  toby: () => import('./character-toby-data.js'),
  sunny: () => import('./character-sunny-data.js'),
  aviator: () => import('./character-aviator-data.js'),
  signaler: () => import('./character-signaler-data.js'),
  operator: () => import('./character-operator-data.js'),
};
const DATA = new Map([[DEFAULT_APPEARANCE, COWBOY]]);
const pending = new Map();
// Resolves once the appearance can be created synchronously (createCharacter).
export function loadCharacter(id) {
  id = appearanceId(id);
  if (DATA.has(id)) return Promise.resolve(id);
  if (!pending.has(id))
    pending.set(
      id,
      LOADERS[id]().then(
        (module) => (DATA.set(id, module.CHARACTER_DATA), id),
        (error) => {
          pending.delete(id);
          throw error;
        },
      ),
    );
  return pending.get(id);
}
export const characterLoaded = (id) => DATA.has(appearanceId(id));
// The appearance actually drawn now: the requested one once loaded (loading is
// started here), the default meanwhile.
export function availableAppearance(id) {
  id = appearanceId(id);
  if (DATA.has(id)) return id;
  loadCharacter(id).catch(() => {});
  return DEFAULT_APPEARANCE;
}

// Visual heading: the walker's facing (`face`) snaps to the input direction,
// the model turns toward it with an exponential approach along the shortest arc
// (time constant 1 / TURN_RATE s, about 0.25 s for a half turn).
export const TURN_RATE = 12;
export function turnToward(current, target, dt, rate = TURN_RATE) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-rate * Math.max(0, dt || 0)));
}

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const view = (b64, Type) => {
  const raw = bytes(b64);
  return new Type(raw.buffer, raw.byteOffset, raw.byteLength / Type.BYTES_PER_ELEMENT);
};
// Same rule as three.js PropertyBinding.sanitizeNodeName (":" is reserved).
export const boneName = (name) => name.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');

const cache = new WeakMap();
function shared(T, id) {
  let byId = cache.get(T);
  if (!byId) cache.set(T, (byId = new Map()));
  let s = byId.get(id);
  if (s) return s;
  const D = DATA.get(id);
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
  // Gait → clip: the default export keeps its Mixamo names, the others are
  // imported under their gait. Without an idle clip, a one-key bind pose stands
  // in (arms are then lowered procedurally, see update()).
  const gaits = {};
  for (const gait of ['idle', 'walk', 'run'])
    gaits[gait] = clips[id === DEFAULT_APPEARANCE ? CHARACTER_CLIPS[gait] : gait];
  const restPose = !gaits.idle;
  if (restPose)
    gaits.idle = new T.AnimationClip(
      'rest',
      1,
      D.bones.map(
        (b) =>
          new T.QuaternionKeyframeTrack(boneName(b.name) + '.quaternion', [0], Array.from(b.r)),
      ),
    );
  // Bind-pose height (feet at y = 0): every appearance is drawn CHARACTER_HEIGHT tall.
  const pos = geometry.getAttribute('position');
  let top = 0;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  s = { data: D, geometry, material, boneInverses, gaits, restPose, scale: CHARACTER_HEIGHT / top };
  byId.set(id, s);
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

export function createCharacter(T, appearance = DEFAULT_APPEARANCE) {
  const id = DATA.has(appearanceId(appearance)) ? appearanceId(appearance) : DEFAULT_APPEARANCE;
  const { data: D, geometry, material, boneInverses, gaits, restPose, scale } = shared(T, id);
  const bones = D.bones.map((b) => {
    const bone = new T.Bone();
    bone.name = boneName(b.name);
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.r);
    return bone;
  });
  const container = new T.Group(),
    root = new T.Group();
  container.name = 'personnage';
  container.add(root);
  root.scale.setScalar(scale);
  D.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : root).add(bones[i]));
  const mesh = new T.SkinnedMesh(geometry, material);
  mesh.name = 'personnage-meshy';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.meshyShared = true;
  root.add(mesh);
  const skeleton = new T.Skeleton(bones, boneInverses);
  container.updateMatrixWorld(true);
  mesh.bind(skeleton, new T.Matrix4());
  // Bind-pose bounds (hit tests, Box3): compute them before any parent scale,
  // with the bind inverse refreshed for the normalising root scale.
  container.updateMatrixWorld(true);
  skeleton.update();
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  const bone = (n) => byName['mixamorig' + n];
  const mixer = new T.AnimationMixer(container);
  const actions = Object.fromEntries(
    Object.entries(gaits).map(([gait, clip]) => [gait, mixer.clipAction(clip)]),
  );
  for (const action of Object.values(actions)) action.play().setEffectiveWeight(0);
  actions.idle.setEffectiveWeight(1);
  let current = 'idle';
  const v = (x, y, z) => new T.Vector3(x, y, z);
  const character = {
    appearance: id,
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
      } else if (restPose && actions.idle.getEffectiveWeight() > 0) {
        // Export without an idle clip: arms down along the body from the bind pose.
        const w = actions.idle.getEffectiveWeight();
        for (const side of ['Left', 'Right']) {
          const s = side === 'Left' ? 1 : -1;
          pointBone(T, bone(side + 'Arm'), bone(side + 'ForeArm'), local(s * 0.18, -1, 0), w);
          pointBone(T, bone(side + 'ForeArm'), bone(side + 'Hand'), local(s * 0.08, -1, 0.12), w);
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
