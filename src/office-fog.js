// Altitude veil is uniform across the viewport, independent of horizontal
// position and viewing direction. The separate scene fog adds only faint depth.
export const OFFICE_DISTANCE_FOG = 0.018;
export function officeFogOpacity(height, ceiling) {
  const t = Math.max(0, Math.min(1, (height / Math.max(ceiling, 0.001) - 0.4) / 0.6));
  return 0.85 * t * t * (3 - 2 * t);
}
