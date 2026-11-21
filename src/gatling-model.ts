import { MODEL_DATA } from './meshy-gatling-data.js';
import { texturedMeshyParts } from './meshy-texture.ts';
import { GATLING } from './ground-sentry.ts';
import type * as THREE from 'three';
import type { Three } from './types.ts';

// Gatling auto-turret: one Meshy atlas split into three rigid pieces (fixed
// tripod, yaw head, tilting bundle base, spinning barrel bundle). See docs/gatling-turret.md.
export const GATLING_MIN_ELEVATION = (-10 * Math.PI) / 180;
export const GATLING_MAX_ELEVATION = (50 * Math.PI) / 180;
// 1 source unit = 21 mm: 16 mm tall, 8 mm barrels (the Castor gun is ~9 mm).
export const GATLING_SCALE = 0.021;
const ROTOR = MODEL_DATA.rotor;
const PIVOT = MODEL_DATA.parts.find((p) => p.part === 'rotor')!.pivot as [number, number, number];
// Height of the barrel axis above the ground, in office metres.
export const GATLING_MUZZLE_HEIGHT = PIVOT[1] * GATLING_SCALE;
// One shot per barrel per turn: the bundle turns at rate / barrels revolutions/s.
export const GATLING_MAX_SPIN = (2 * Math.PI * (1000 / GATLING.intervalMs)) / ROTOR.barrels;
const SPIN_UP_SECONDS = 0.35;
const SPIN_DOWN_SECONDS = 1.1;

export interface SpinState {
  angle: number;
  speed: number;
}

// Rotor inertia: winds up while firing, coasts down afterwards.
export function stepGatlingSpin(state: SpinState, dt: number, firing: boolean): SpinState {
  const step = Math.max(0, Math.min(0.25, dt));
  const target = firing ? GATLING_MAX_SPIN : 0;
  const tau = firing ? SPIN_UP_SECONDS : SPIN_DOWN_SECONDS;
  state.speed += (target - state.speed) * (1 - Math.exp(-step / tau));
  if (state.speed < 1e-3 && !firing) state.speed = 0;
  state.angle = (state.angle + state.speed * step) % (2 * Math.PI);
  return state;
}

// The barrel nearest the top of the bundle is the one that fires.
export function firingBarrel(
  angle: number,
  tips: readonly (readonly number[])[] = ROTOR.tips,
): number {
  let best = 0;
  let height = -Infinity;
  tips.forEach(([x, y], index) => {
    const h = Math.hypot(x, y) * Math.sin(Math.atan2(y, x) + angle);
    if (h > height) {
      height = h;
      best = index;
    }
  });
  return best;
}

interface PartResource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

function addPart(T: Three, resource: PartResource, parent: THREE.Object3D, name: string) {
  const mesh = new T.Mesh(resource.geometry, resource.material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.meshyShared = true;
  parent.add(mesh);
  return mesh;
}

export interface GatlingModel {
  group: THREE.Group;
  yaw: THREE.Group;
  pitch: THREE.Group;
  spin: THREE.Group;
  barrels: THREE.Group[];
  lens: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  muzzle: THREE.Group;
  kind: 'gatling';
  spinState: SpinState;
}

export function createGatlingModel(T: Three): GatlingModel {
  const resources = Object.fromEntries(
    texturedMeshyParts(T, MODEL_DATA).map((r) => [r.part.part, r]),
  ) as Record<string, PartResource>;
  const group = new T.Group();
  group.name = 'gatling';
  group.scale.setScalar(GATLING_SCALE);
  addPart(T, resources.socle, group, 'socle-fixe');

  // Yaw about the vertical axis through the origin (the tripod centre).
  const yaw = new T.Group();
  yaw.name = 'rotation-horizontale';
  group.add(yaw);
  addPart(T, resources.tete, yaw, 'tete-gatling');

  // Elevation pivot: centre of the housing opening, on the barrel axis.
  const pitch = new T.Group();
  pitch.name = 'elevation-canon';
  pitch.position.set(...PIVOT);
  yaw.add(pitch);
  // The circular base of the bundle (rear plate and front rim) tilts with the barrels.
  addPart(T, resources.anneau, pitch, 'anneau-faisceau');
  // The spin group turns every barrel and both collars about the bundle axis (local Z).
  const spin = new T.Group();
  spin.name = 'rotation-barillet';
  pitch.add(spin);
  addPart(T, resources.rotor, spin, 'faisceau-canons');
  const muzzle = new T.Group();
  muzzle.name = 'bouche-canon';
  muzzle.position.set(0, 0, ROTOR.tipZ);
  pitch.add(muzzle);
  // Real tips of the six barrels, carried by the spinning group.
  const barrels = ROTOR.tips.map(([x, y]: number[], index: number) => {
    const tip = new T.Group();
    tip.name = 'bouche-barillet-' + index;
    tip.position.set(x, y, ROTOR.tipZ);
    spin.add(tip);
    return tip;
  });

  // Ammo status light on the back of the radar housing; the atlas stays untouched.
  const led = new T.Mesh(
    new T.SphereGeometry(0.012, 6, 4),
    new T.MeshBasicMaterial({ color: '#1ecbd9' }),
  );
  led.name = 'temoin-munitions';
  led.position.set(0, 0.7, 0.168);
  yaw.add(led);
  return {
    group,
    yaw,
    pitch,
    spin,
    barrels,
    lens: led,
    muzzle,
    kind: 'gatling',
    spinState: { angle: 0, speed: 0 },
  };
}
