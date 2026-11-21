import { pilotFireInterval } from './fleet.ts';
import { FIXED_DCA_AMMO } from './ground-ammo.ts';
import { FLAK, MAP } from './scale.ts';
import type { Vec3, XYZ } from './types.ts';

// The Spitfire fires one round per gun every 60 ms.
export const RAPID_DCA_GUN_INTERVAL = pilotFireInterval('spitfire');
// Damage of one round of the high-rate DCA (the Spitfire's guns do 75).
export const RAPID_DCA_DAMAGE = 62;
export const FIXED_DCA = Object.freeze({
  dca: { ammo: FIXED_DCA_AMMO, interval: FLAK.interval, clearance: 2.6, height: 3.2 },
  dcaRapid: { ammo: 1000, interval: RAPID_DCA_GUN_INTERVAL / 4, clearance: 2.6, height: 3.4 },
  dcaHeavy: { ammo: FIXED_DCA_AMMO, interval: 1, clearance: 4, height: 4.5 },
});
export type FixedDcaKind = keyof typeof FIXED_DCA;
export const isFixedDca = (kind: unknown): kind is FixedDcaKind =>
  Object.hasOwn(FIXED_DCA, kind as PropertyKey);

// These offsets are in reference metres, from the reviewed GLB import.
// Pitch pivot relative to the yaw axis, then the mouth relative to that pivot.
const heavyPivot = [0, 2.115981, 0.7705];
const heavyMouth = [-0.0134, -0.136915, -4.021537];

export function heavyDcaMuzzle(station: XYZ, direction: readonly number[]): Vec3 {
  const [dx, dy, dz] = direction;
  const pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  const yaw = Math.atan2(-dx, -dz);
  const [x, y, z] = heavyMouth;
  const height = heavyPivot[1] + y * Math.cos(pitch) - z * Math.sin(pitch);
  const depth = heavyPivot[2] + y * Math.sin(pitch) + z * Math.cos(pitch);
  return [
    station.x + MAP.metres(x * Math.cos(yaw) + depth * Math.sin(yaw)),
    station.y + MAP.metres(height),
    station.z + MAP.metres(depth * Math.cos(yaw) - x * Math.sin(yaw)),
  ];
}
