import { RAT_DATA as D } from './rat-data.js';
import { defineCreature } from './rigged-creature.js';
import { groundPresentation, REST_PHASES } from './walker-gait.ts';

// Rat enemy: user-supplied Meshy "Low Poly Mouse" with its 27-bone skeleton
// and its own walking clip (scripts/import-rat.py). Unlike the insects, whose
// gaits are procedural, the cycle replays that clip: the import stores each
// bone's model-space rotation and position for its 30 keys, and the pose below
// turns them into the deltas defineCreature expects, interpolating between
// keys. The clip walks in place; the walker batch advances its phase with the
// distance covered, one stride per loop. One fix on top of the clip: at
// lift-off the hind toes point down, well under the planted soles; each is
// turned about the lateral axis just enough to stay above the sole plane
// (RAT_MODEL.sole), so the planted paws can touch the ground.
// The model faces +Z, +X is its left.
export const RAT_MODEL = Object.freeze({
  scale: 3.5, // 1.25 m nose to tail tip -> about 4.4 insect units, like the old rat
  stride: 0.35, // model metres per loop: speed of the planted paws in the clip
  frames: 30, // one baked frame per clip key
  maxRate: 4, // apparent gait rate cap (loops/s)
  raise: -0.02, // insect units: puts the sole plane on the shared foot height
  sink: 0.065, // insect units: lowers the rat 3.5 mm (1 unit = 5.4 cm), it walked in the air; more sinks its paws into the floor
  sole: 0.006, // model metres: lowest point of the planted soles in the clip
  toeDip: 0.2, // insect units: how far the front toes may dip under the lift
  // Insect units backwards: the body (nose to hips) is centred on the proxy,
  // the tail trails behind.
  back: 1.32,
});
// Hit volume in insect units (ellipsoid centre and radii): body and head,
// without the tail or the paws. Lowered by `sink` with the model, and shifted
// a little backwards (-Z).
export const RAT_HIT = Object.freeze({ centre: [0, 0.435, -0.15], radii: [0.72, 0.7, 1.36] });

export const RAT_BONES = Object.freeze({
  root: 'Hips',
  head: 'head',
  tail: ['tail', 'tailstart', 'tail1', 'tail2', 'tail3'],
  // Paw bones (hip to toe), front pair then hind pair, +X first.
  paws: [
    ['frontleg', 'frontleg0', 'frontleg1', 'frontleg2'],
    ['R_frontleg', 'R_frontleg0', 'R_frontleg1', 'R_frontleg2'],
    ['backleg', 'backleg0', 'backleg1', 'backleg2'],
    ['R_backleg', 'R_backleg0', 'R_backleg1', 'R_backleg2'],
  ],
});

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const clipCache = new WeakMap();
// Decoded clip and bind transforms, per three.js instance.
function clip(T) {
  let c = clipCache.get(T);
  if (c) return c;
  const raw = bytes(D.clip.transforms);
  const values = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = D.bones.length;
  const frames = Array.from({ length: D.clip.frames }, (_, f) =>
    D.bones.map((_, i) => {
      const o = (f * n + i) * 7;
      return {
        q: new T.Quaternion(values[o], values[o + 1], values[o + 2], values[o + 3]),
        p: new T.Vector3(values[o + 4], values[o + 5], values[o + 6]),
      };
    }),
  );
  const rawInverse = bytes(D.inverseBindMatrices);
  const inverse = new Float32Array(rawInverse.buffer, rawInverse.byteOffset, n * 16);
  const bind = D.bones.map((_, i) => {
    const m = new T.Matrix4().fromArray(inverse, i * 16).invert();
    return {
      q: new T.Quaternion().setFromRotationMatrix(m),
      p: new T.Vector3().setFromMatrixPosition(m),
    };
  });
  const rest = D.bones.map((b) => new T.Vector3().fromArray(b.t));
  // Toe vertices (dominant weight, bind positions) relative to the toe pivot.
  const rawPositions = bytes(D.positions);
  const positions = new Float32Array(
    rawPositions.buffer,
    rawPositions.byteOffset,
    rawPositions.byteLength / 4,
  );
  const joints = bytes(D.joints);
  const toes = RAT_BONES.paws.slice(2).map((chain) => {
    const i = D.bones.findIndex((b) => b.name === chain[3]);
    const points = [];
    for (let v = 0; v < joints.length / 4; v++)
      if (joints[v * 4] === i)
        points.push(new T.Vector3().fromArray(positions, v * 3).sub(bind[i].p));
    return { index: i, points };
  });
  c = { frames, bind, rest, toes };
  clipCache.set(T, c);
  return c;
}

// Model-space world transforms of every bone at loop phase t, as in the clip
// (key interpolation).
export function ratClipWorld(T, t) {
  const { frames } = clip(T);
  const x = (((t % 1) + 1) % 1) * frames.length;
  const a = Math.floor(x) % frames.length,
    b = (a + 1) % frames.length,
    u = x - Math.floor(x);
  return frames[a].map((k, i) => ({
    q: k.q.clone().slerp(frames[b][i].q, u),
    p: k.p.clone().lerp(frames[b][i].p, u),
  }));
}

// Lowest toe point (model y) for a toe world rotation q and pivot p.
function toeLow(T, toe, bindQ, q, p) {
  const turn = q.clone().multiply(bindQ.clone().invert());
  const v = new T.Vector3();
  let low = Infinity;
  for (const point of toe.points) low = Math.min(low, v.copy(point).applyQuaternion(turn).y + p.y);
  return low;
}
// Smallest turn about the model X axis, in direction `sign`, that lifts a toe
// above the sole plane (angle Infinity when none does).
function liftToe(T, toe, bindQ, w, sign) {
  if (toeLow(T, toe, bindQ, w.q, w.p) >= RAT_MODEL.sole) return { angle: 0, q: w.q };
  const axis = new T.Vector3(sign, 0, 0);
  let best = { angle: Infinity, q: w.q },
    bestLow = -Infinity;
  for (let angle = 0.025; angle <= 2; angle += 0.025) {
    const q = new T.Quaternion().setFromAxisAngle(axis, angle).multiply(w.q);
    const low = toeLow(T, toe, bindQ, q, w.p);
    if (low >= RAT_MODEL.sole) return { angle, q };
    if (low > bestLow) ((bestLow = low), (best = { angle: Infinity, q }));
  }
  return best;
}
// Clip transforms with the toe fix (hind paws): a toe that dips under the sole
// plane turns about the model X axis by the smallest angle that lifts it back,
// always the same way for a given paw (the one needing the least over the
// clip). The front toes whirl too fast during their swing for a smooth fix;
// they keep the clip and dip a little into the ground at lift-off.
export function ratWorld(T, t) {
  const c = clip(T);
  const { bind, toes } = c;
  if (!c.signs)
    c.signs = toes.map((toe) => {
      const worst = (sign) =>
        Math.max(
          ...c.frames.map(
            (frame) => liftToe(T, toe, bind[toe.index].q, frame[toe.index], sign).angle,
          ),
        );
      return worst(1) <= worst(-1) ? 1 : -1;
    });
  const world = ratClipWorld(T, t);
  toes.forEach((toe, k) => {
    const w = world[toe.index];
    w.q = liftToe(T, toe, bind[toe.index].q, w, c.signs[k]).q;
  });
  return world;
}
// Deltas for rigged-creature: the rig sets each bone's local rotation to
// inverse(parent bind) * delta * bind, so the world rotation of a bone is the
// product of its ancestors' deltas times its bind rotation; positions are
// offsets of the local translation expressed in the parent's bind axes.
export function ratWalkPose(T, t) {
  const { bind, rest } = clip(T);
  const world = ratWorld(T, t);
  const total = world.map((w, i) => w.q.clone().multiply(bind[i].q.clone().invert()));
  const pose = {};
  D.bones.forEach((bone, i) => {
    const parent = bone.parent;
    const rotation =
      parent >= 0 ? total[parent].clone().invert().multiply(total[i]) : total[i].clone();
    const local =
      parent >= 0
        ? world[i].p.clone().sub(world[parent].p).applyQuaternion(world[parent].q.clone().invert())
        : world[i].p.clone();
    const offset = local.sub(rest[i]);
    if (parent >= 0) offset.applyQuaternion(bind[parent].q);
    pose[bone.name] = { rotation, offset: offset.toArray() };
  });
  return pose;
}

export const RAT = defineCreature(D, {
  name: 'rat',
  presentation: (T) =>
    new T.Matrix4()
      .makeTranslation(0, RAT_MODEL.raise - RAT_MODEL.sink, RAT_MODEL.back)
      .multiply(groundPresentation(T, RAT_MODEL.scale)),
  pose: ratWalkPose,
  rest: REST_PHASES[0],
  frames: RAT_MODEL.frames,
});
