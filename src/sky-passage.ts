// The passage between the office and Saint Pierre's sky (docs/purgatory-sky.md).
// Both lie in one world (src/arena-frame.ts): climbing through the office's cloud
// layer past the former flight ceiling leads into the purgatory's blue sky, where
// Saint Pierre's cloud floats about 150 real metres higher; diving back under the
// sky floor leads back into the office's clouds, at the point one came up through
// (or above the base when one never came up from the office).
import { OFFICE_CEILING, PURGATORY_FRAME } from './arena-frame.ts';
import { ACTOR_UNIT, MAP } from './scale.ts';
import type { Collider } from './oriented-collider.ts';
import { officeFogOpacity } from './office-fog.ts';

/** Altitude of the sky's floor (office metres): the office's former flight ceiling. */
export const SKY_FLOOR = OFFICE_CEILING;
/** Height of the white passage above the sky floor (about 60 real metres). */
export const SKY_PASSAGE = MAP.metres(60);
/** Height below the sky floor where the office clouds turn fully white. */
export const CLOUD_WHITEOUT = MAP.metres(150);
/** Margin kept inside the room's walls when a flight comes back down (office metres). */
export const ENTRY_MARGIN = 0.3;

export interface FlightBounds {
  x: number;
  z: number;
}
export interface PlanarPoint {
  x: number;
  z: number;
}
export interface WorldPoint extends PlanarPoint {
  y: number;
}

/** True in Saint Pierre's sky (above the office's cloud layer). */
export function inSky(y: number): boolean {
  return y >= SKY_FLOOR;
}
/**
 * Out of the flight space: under the sky, beyond the room's bounds. The sky has
 * no limit, neither upward nor sideways (the former ceiling no longer destroys).
 */
export function outOfFlight(p: WorldPoint, bounds: FlightBounds): boolean {
  return !inSky(p.y) && (Math.abs(p.x) > bounds.x || Math.abs(p.z) > bounds.z);
}
/** The point of the room under a position, kept inside the walls. */
export function roomEntry(p: PlanarPoint, bounds: FlightBounds): PlanarPoint {
  const clamp = (v: number, limit: number) =>
    Math.max(-limit + ENTRY_MARGIN, Math.min(limit - ENTRY_MARGIN, v));
  return { x: clamp(p.x, bounds.x), z: clamp(p.z, bounds.z) };
}

export interface Passage {
  /** Where the flight came up from the office (null: it never did). */
  entry: PlanarPoint | null;
  /** The position was moved (back to the entry, or above the base). */
  moved: boolean;
  /** Which way the sky floor was crossed, if it was. */
  crossed: 'up' | 'down' | null;
}
/**
 * One step of a flight (aircraft or falling walker): from the previous height to
 * `p` (mutated). Going up through the sky floor records the room point below;
 * coming down moves the flight back over that point (or over `fallback`, the
 * base, when it has none), just under the sky floor, its speed unchanged.
 */
export function skyPassage(
  previousY: number,
  p: WorldPoint,
  entry: PlanarPoint | null,
  bounds: FlightBounds,
  fallback: PlanarPoint,
): Passage {
  if (!inSky(previousY) && inSky(p.y))
    return { entry: roomEntry(p, bounds), moved: false, crossed: 'up' };
  if (inSky(previousY) && !inSky(p.y)) {
    const back = roomEntry(entry ?? fallback, bounds);
    p.x = back.x;
    p.z = back.z;
    p.y = Math.min(p.y, SKY_FLOOR - 1e-4);
    return { entry: null, moved: true, crossed: 'down' };
  }
  return { entry, moved: false, crossed: null };
}

/**
 * Whiteness of the view at a camera height: the office's haze (officeFogOpacity),
 * thickening to full white at the sky floor, then clearing above it into the blue.
 */
export function passageWhiteness(y: number): number {
  const smooth = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };
  if (inSky(y)) return 1 - smooth((y - SKY_FLOOR) / SKY_PASSAGE);
  const haze = officeFogOpacity(y);
  return haze + (1 - haze) * smooth(1 - (SKY_FLOOR - y) / CLOUD_WHITEOUT);
}

/** Nothing is built on Saint Pierre's cloud, nor anywhere in the sky. */
export function buildableAltitude(y: number): boolean {
  return !inSky(y);
}

/**
 * Saint Pierre's cloud in its arena's units (x, z; `bottom` under its floor), drawn by
 * src/purgatory-scene.ts (CLOUD_FLOOR) and solid for walkers and aircraft.
 */
export const PURGATORY_CLOUD = Object.freeze({
  minX: -16,
  maxX: 16,
  minZ: -11,
  maxZ: 96,
  bottom: -7,
});
/** Saint Pierre's counter in arena units: the four desks in a row. */
export const PURGATORY_COUNTER = Object.freeze({
  min: [-3.2, 0, -1.8] as const,
  max: [6.3, 1.05, -0.7] as const,
});
/**
 * The purgatory's solids in the world (office metres): the cloud, whose top keeps a
 * walker's feet at the cloud's height (src/sortie.ts stands bodies 0.05 actor unit
 * above a support), and the counter. Shared by the client (walkers, aircraft, shots,
 * camera) and the server (vacant aircraft, src/parked-host.ts).
 */
export function purgatorySolids(): Collider[] {
  const F = PURGATORY_FRAME,
    u = F.unit,
    C = PURGATORY_CLOUD,
    K = PURGATORY_COUNTER;
  const at = (x: number, y: number, z: number) => ({
    x: F.originX + x * u,
    y: F.originY + y * u,
    z: F.originZ + z * u,
  });
  return [
    { min: at(K.min[0], K.min[1], K.min[2]), max: at(K.max[0], K.max[1], K.max[2]) },
    {
      min: at(C.minX, C.bottom, C.minZ),
      max: { ...at(C.maxX, 0, C.maxZ), y: F.originY - 0.05 * ACTOR_UNIT },
    },
  ];
}

/** The purgatory's cloud seen from the sky floor: its floor stands this much higher. */
export const CLOUD_ABOVE_SKY_FLOOR = PURGATORY_FRAME.originY - SKY_FLOOR;
