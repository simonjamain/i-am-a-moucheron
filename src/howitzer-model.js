import { HOWITZER_DATA as D } from './howitzer-data.js';
import { HOWITZER_LIMITS } from './howitzer-geometry.js';

// Issue #113: the anti-materiel gun is the user-supplied Meshy howitzer, split
// offline into carriage, two wheels, cradle (with the shield) and tube.
// Units are reference metres in the gun's yaw space: origin at the middle of
// the axle on the ground, barrel towards -Z, Y up (the fortification root
// applies MAP.ratio). Traverse pivots the whole gun around the axle middle and
// counter-rotates the wheels; elevation turns the cradle on its trunnion; the
// tube recoils inside the cradle.

const DEG = Math.PI / 180;
export const HOWITZER = Object.freeze({
  wheelDiameter: 1.1, // reference metres, so the gun is ~6.4 m long next to a 1.8 m player
  minPitch: HOWITZER_LIMITS.minPitch,
  maxPitch: HOWITZER_LIMITS.maxPitch,
  traverseRate: 45 * DEG, // rad/s, whole gun
  elevationRate: 30 * DEG, // rad/s, cradle
  recoil: 0.3, // fraction of the tube length
  recoilBack: 0.06, // s to full recoil
  recoilReturn: 0.6, // s back to battery
  jolt: 0.06, // reference metres, carriage pushed back on each shot
  joltTime: 0.3,
});
export const HOWITZER_SCALE = HOWITZER.wheelDiameter / (2 * D.pivots.wheelRadius);

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const view = (b64, Type) => {
  const raw = bytes(b64);
  return new Type(raw.buffer, raw.byteOffset, raw.byteLength / Type.BYTES_PER_ELEMENT);
};
const cache = new WeakMap();
function shared(T) {
  let s = cache.get(T);
  if (s) return s;
  const texture =
    typeof document === 'undefined' ? new T.Texture() : new T.TextureLoader().load(D.texture);
  texture.colorSpace = T.SRGBColorSpace;
  texture.flipY = false;
  const material = new T.MeshStandardMaterial({ map: texture, roughness: 0.8 });
  const geometries = {};
  for (const [name, part] of Object.entries(D.parts)) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(view(part.positions, Float32Array), 3));
    geometry.setAttribute('normal', new T.BufferAttribute(view(part.normals, Float32Array), 3));
    geometry.setAttribute('uv', new T.BufferAttribute(view(part.uvs, Float32Array), 2));
    geometry.setIndex(new T.BufferAttribute(view(part.indices, Uint16Array), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries[name] = geometry;
  }
  s = { material, geometries };
  cache.set(T, s);
  return s;
}

// Model coordinates (barrel -X, axle Z) to yaw space (barrel -Z, axle X).
const { axle, ground } = D.pivots;
export function howitzerPoint(T, p) {
  return new T.Vector3(-p[2], p[1] - ground, p[0] - axle[0]).multiplyScalar(HOWITZER_SCALE);
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const toward = (from, to, step) => from + Math.max(-step, Math.min(step, to - from));

export function createHowitzer(T) {
  const { material, geometries } = shared(T);
  // A pivot group at `pivot` (model coords) whose content keeps model placement.
  function pivotGroup(parent, pivot, parentPivot = null) {
    const group = new T.Group();
    group.position.copy(howitzerPoint(T, pivot));
    if (parentPivot) group.position.sub(howitzerPoint(T, parentPivot));
    parent.add(group);
    return group;
  }
  function part(parent, name, pivot) {
    const frame = new T.Group();
    frame.rotation.y = -Math.PI / 2;
    frame.scale.setScalar(HOWITZER_SCALE);
    frame.position.copy(howitzerPoint(T, [0, 0, 0]));
    if (pivot) frame.position.sub(howitzerPoint(T, pivot));
    const mesh = new T.Mesh(geometries[name], material);
    mesh.name = 'howitzer-' + name;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.meshyShared = true;
    frame.add(mesh);
    parent.add(frame);
    return mesh;
  }
  const yaw = new T.Group();
  yaw.name = 'howitzer';
  const body = new T.Group(); // recoil jolt of the whole carriage
  yaw.add(body);
  part(body, 'carriage');
  const wheels = ['wheelLeft', 'wheelRight'].map((name) => {
    const group = pivotGroup(body, D.pivots[name]);
    part(group, name, D.pivots[name]);
    // Yaw-space +X wheel rolls forward (-Z) when the gun turns left (+yaw).
    return { group, side: Math.sign(group.position.x) };
  });
  const pitch = pivotGroup(body, D.pivots.trunnion);
  part(pitch, 'cradle', D.pivots.trunnion);
  const slide = new T.Group();
  pitch.add(slide);
  part(slide, 'tube', D.pivots.trunnion);
  const muzzle = new T.Object3D();
  muzzle.position.copy(howitzerPoint(T, D.pivots.muzzle)).sub(howitzerPoint(T, D.pivots.trunnion));
  slide.add(muzzle);

  const halfTrack = Math.abs(wheels[0].group.position.x),
    radius = HOWITZER.wheelDiameter / 2,
    recoilLength = HOWITZER.recoil * D.pivots.tubeLength * HOWITZER_SCALE;
  let firedAt = -Infinity,
    clock = 0;
  const state = { yaw: 0, pitch: 0 };
  const local = new T.Vector3(),
    inverse = new T.Quaternion();
  const howitzer = {
    yaw,
    pitch,
    muzzle,
    wheels,
    slide,
    body,
    state,
    // Set the angles directly (placement preview, tests); wheels follow.
    pose(yawAngle, pitchAngle) {
      const turn = wrap(yawAngle - state.yaw);
      for (const w of wheels) w.group.rotation.x -= (w.side * turn * halfTrack) / radius;
      state.yaw = wrap(yawAngle);
      state.pitch = Math.max(HOWITZER.minPitch, Math.min(HOWITZER.maxPitch, pitchAngle));
      yaw.rotation.set(0, state.yaw, 0);
      pitch.rotation.set(state.pitch, 0, 0);
    },
    // Slew toward a world direction at the traverse/elevation rates and return
    // the direction the barrel really points to (world space).
    aim(dt, worldDirection, parentQuaternion = null) {
      local.copy(worldDirection).normalize();
      if (parentQuaternion) local.applyQuaternion(inverse.copy(parentQuaternion).invert());
      const targetYaw = Math.atan2(-local.x, -local.z),
        targetPitch = Math.asin(Math.max(-1, Math.min(1, local.y))),
        step = Math.max(0, dt || 0);
      howitzer.pose(
        state.yaw + toward(0, wrap(targetYaw - state.yaw), HOWITZER.traverseRate * step),
        toward(
          state.pitch,
          Math.max(HOWITZER.minPitch, Math.min(HOWITZER.maxPitch, targetPitch)),
          HOWITZER.elevationRate * step,
        ),
      );
      return howitzer.direction(parentQuaternion);
    },
    direction(parentQuaternion = null) {
      const d = new T.Vector3(
        -Math.sin(state.yaw) * Math.cos(state.pitch),
        Math.sin(state.pitch),
        -Math.cos(state.yaw) * Math.cos(state.pitch),
      );
      return parentQuaternion ? d.applyQuaternion(parentQuaternion) : d;
    },
    fire() {
      firedAt = clock;
    },
    // Recoil: tube back along the bore, then return to battery; carriage jolt.
    tick(dt) {
      clock += Math.max(0, dt || 0);
      const t = clock - firedAt;
      let back = 0;
      if (t >= 0 && t < HOWITZER.recoilBack) back = t / HOWITZER.recoilBack;
      else if (t >= HOWITZER.recoilBack) {
        const u = Math.min(1, (t - HOWITZER.recoilBack) / HOWITZER.recoilReturn);
        back = 1 - (1 - (1 - u) ** 3);
      }
      slide.position.z = back * recoilLength;
      // `body` turns with the gun: its +Z is the carriage's backward direction.
      const jolt = t >= 0 && t < HOWITZER.joltTime ? 1 - t / HOWITZER.joltTime : 0;
      body.position.z = HOWITZER.jolt * jolt;
      return back;
    },
  };
  return howitzer;
}
