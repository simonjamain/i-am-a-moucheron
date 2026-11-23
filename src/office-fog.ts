// Uniform horizontal layer, kept at its original altitude when the flight limit
// rises. Integrating along each view ray makes it visible from below and inside.
import type { Three } from './types.ts';

export const OFFICE_DISTANCE_FOG = 0.018;
/** Haze colour; also the scene background, seen only above the closed room's walls. */
export const OFFICE_HAZE = '#ffffff';
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
  T.ShaderChunk.fog_pars_vertex += '\n#ifdef USE_FOG\nvarying vec3 vOfficeFogPosition;\n#endif';
  T.ShaderChunk.fog_vertex += `
#ifdef USE_FOG
  vOfficeFogPosition = cameraPosition + vec3(
    dot(viewMatrix[0].xyz, mvPosition.xyz),
    dot(viewMatrix[1].xyz, mvPosition.xyz),
    dot(viewMatrix[2].xyz, mvPosition.xyz));
#endif`;
  T.ShaderChunk.fog_pars_fragment += '\n#ifdef USE_FOG\nvarying vec3 vOfficeFogPosition;\n#endif';
  const start = cloudTop * FOG_START_RATIO,
    thickness = cloudTop - start;
  installed.set(T, { start, thickness });
  T.ShaderChunk.fog_fragment = T.ShaderChunk.fog_fragment.replace(
    'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
    `
    float fogStart = ${start.toFixed(7)};
    float fogThickness = ${thickness.toFixed(7)};
    float fogA = max(0.0, cameraPosition.y - fogStart);
    float fogB = max(0.0, vOfficeFogPosition.y - fogStart);
    float fogDY = vOfficeFogPosition.y - cameraPosition.y;
    float fogAverage = abs(fogDY) < 0.000001 ? fogA / fogThickness : (fogB*fogB - fogA*fogA) / (2.0 * fogThickness * fogDY);
    float fogDistance = length(vOfficeFogPosition - cameraPosition);
    float fogFactor = 1.0 - exp(-max(0.0, fogAverage) * fogDistance * 9.0 - fogDensity*fogDensity*vFogDepth*vFogDepth);`,
  );
}
