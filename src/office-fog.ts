// Uniform horizontal layer, kept at its original altitude when the flight limit
// rises. Integrating along each view ray makes it visible from below and inside.
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

/** Flight bounds: half extents x/z and ceiling height, office metres. */
export interface FogBounds {
  x: number;
  z: number;
  ceiling: number;
}
export const OFFICE_DISTANCE_FOG = 0.018;
/** Altitude where the haze begins: air routes stay below it (test-layouts). */
export const OFFICE_FOG_START = 2.2125;
/** Top of the cloud layer: the top of the office walls (layouts.ts WALL_HEIGHT). */
export const OFFICE_CLOUD_TOP = 2.7;
export const FOG_START_RATIO = OFFICE_FOG_START / OFFICE_CLOUD_TOP;
export function officeFogOpacity(height: number, cloudTop: number = OFFICE_CLOUD_TOP): number {
  const t = Math.max(
    0,
    Math.min(1, (height / Math.max(cloudTop, 0.001) - FOG_START_RATIO) / (1 - FOG_START_RATIO)),
  );
  return 0.65 * t * t * (3 - 2 * t);
}
export function fogOpticalDepth(
  fromY: number,
  toY: number,
  distance: number,
  cloudTop: number = OFFICE_CLOUD_TOP,
): number {
  const start = cloudTop * FOG_START_RATIO,
    thickness = cloudTop - start;
  const primitive = (y: number) => Math.max(0, y - start) ** 2 / (2 * thickness);
  const average =
    Math.abs(toY - fromY) < 1e-6
      ? Math.max(0, fromY - start) / thickness
      : (primitive(toY) - primitive(fromY)) / (toY - fromY);
  return Math.max(0, distance) * average * 9;
}
const installed = new WeakMap<Three, { start: number; thickness: number }>();
/** Cloud layer installed in this Three (start and thickness, metres), if any. */
export const officeFogLayer = (T: Three): { start: number; thickness: number } | null =>
  installed.get(T) ?? null;
export function installOfficeFog(T: Three, cloudTop: number = OFFICE_CLOUD_TOP): void {
  if (installed.has(T)) return;
  const start = cloudTop * FOG_START_RATIO,
    thickness = cloudTop - start;
  installed.set(T, { start, thickness });
}

/**
 * Give `scene` (whose `fog` is a FogExp2) the cloud layer: the optical depth of the haze
 * integrated along each view ray, added to the usual exponential-squared distance fog.
 * Written as the scene's fog node, evaluated per fragment from its world position.
 */
export function applyOfficeFog(T: Three, scene: THREE.Scene): void {
  const layer = installed.get(T),
    fog = scene.fog as THREE.FogExp2 | null;
  if (!layer || !fog?.isFogExp2) return;
  const {
    reference,
    positionWorld,
    positionView,
    cameraPosition,
    float,
    select,
    abs,
    max,
    length,
    exp,
    fog: fogEffect,
  } = (T as unknown as { TSL: Record<string, any> }).TSL; // eslint-disable-line @typescript-eslint/no-explicit-any
  const density = reference('density', 'float', fog),
    color = reference('color', 'color', fog);
  const a = max(0, cameraPosition.y.sub(layer.start)),
    b = max(0, positionWorld.y.sub(layer.start)),
    dy = positionWorld.y.sub(cameraPosition.y);
  const average = select(
    abs(dy).lessThan(0.000001),
    a.div(layer.thickness),
    b
      .mul(b)
      .sub(a.mul(a))
      .div(dy.mul(2 * layer.thickness)),
  );
  const viewZ = positionView.z.negate();
  const optical = max(0, average)
    .mul(length(positionWorld.sub(cameraPosition)))
    .mul(9)
    .add(density.mul(density).mul(viewZ).mul(viewZ));
  scene.fogNode = fogEffect(color, float(1).sub(exp(optical.negate())));
}

// The clear scene background does not run material fog shaders. Enclose its
// rays on every side, including the open south, with a non-solid backdrop.
// Keep the chase camera inside the atmosphere even near the flight bounds.
export function officeFogCeiling(T: Three, bounds: FogBounds): THREE.Mesh {
  const margin = 0.25,
    width = (bounds.x + margin) * 2,
    depth = (bounds.z + margin) * 2,
    height = bounds.ceiling + margin,
    material = new T.MeshBasicMaterial({ color: '#829f91', side: T.DoubleSide, fog: true }),
    geometry = new T.BoxGeometry(width, height, depth);
  // Leave the bottom open: this is atmosphere, never a floor or a collider.
  const indices = Array.from(geometry.index!.array),
    bottom = geometry.groups[3]; // BoxGeometry face order: +X, −X, +Y, −Y, +Z, −Z.
  geometry.setIndex(indices.filter((_, i) => i < bottom.start || i >= bottom.start + bottom.count));
  geometry.clearGroups();
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'office-fog-ceiling';
  mesh.position.y = height / 2;
  mesh.userData.projectileSolid = false;
  return mesh;
}
