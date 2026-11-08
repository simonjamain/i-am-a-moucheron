import { MAP } from './scale.js';

// Issue #113: dependency-free geometry of the player-scale howitzer, shared by
// the server (shell origin, aim limits) and the client model. Reference metres,
// measured on howitzer-model.js (scripts/test-howitzer.mjs keeps them in sync).
const DEG = Math.PI / 180;
export const HOWITZER_LIMITS = Object.freeze({ minPitch: -5 * DEG, maxPitch: 40 * DEG });
export const HOWITZER_BORE = Object.freeze({
  trunnionUp: 1.2915, // trunnion above the ground, at the station point
  trunnionBack: 0.8292, // trunnion behind the axle middle (gun pivot)
  length: 4.2498, // trunnion to muzzle face, along the bore
  offset: 0.0207, // bore axis above the trunnion axis
});

// World muzzle for a gun standing at `station` and pointing along `direction`.
export function howitzerMuzzle(station, direction) {
  const n = Math.hypot(...direction) || 1,
    d = direction.map((v) => v / n),
    flat = Math.hypot(d[0], d[2]) || 1,
    h = [d[0] / flat, 0, d[2] / flat],
    // Unit vector perpendicular to the bore, in its vertical plane, upwards.
    up = [-h[0] * d[1], flat, -h[2] * d[1]],
    b = HOWITZER_BORE;
  return [station.x, station.y, station.z].map(
    (v, i) =>
      v +
      MAP.metres(
        (i === 1 ? b.trunnionUp : 0) - h[i] * b.trunnionBack + d[i] * b.length + up[i] * b.offset,
      ),
  );
}
export function howitzerPitchAllowed(direction, tolerance = 1 * DEG) {
  const n = Math.hypot(...direction) || 1,
    pitch = Math.asin(Math.max(-1, Math.min(1, direction[1] / n)));
  return (
    pitch >= HOWITZER_LIMITS.minPitch - tolerance && pitch <= HOWITZER_LIMITS.maxPitch + tolerance
  );
}
