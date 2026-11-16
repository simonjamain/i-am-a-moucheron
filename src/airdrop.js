// Castor volant airdrops (shared by the server and the client preview). Every
// Castor construction except the LEGO wall is dropped straight below the
// helicopter, turned like it, and falls like the other purchases dropped in
// flight (delivery.js) before it is built on the first surface below (floor or
// furniture).
export const AIRDROP_KINDS = Object.freeze([
  'sugar',
  'sticky',
  'fan',
  'sentry',
  'bunker',
  'antitank',
]);
export const AIRDROP_TAPE = 0.1; // one 10 cm piece of tape per drop
// Structures higher than this stand on furniture: floor walkers ignore them.
export const FLOOR_LEVEL = 0.01;
export const onFloor = (structure) => !((structure?.y || 0) > FLOOR_LEVEL);
export const levelOf = (structure) => structure?.y || 0;

// Heading (rotation about +Y) of a vehicle quaternion whose nose points -Z.
export function headingOf(q) {
  const [x, y, z, w] = q;
  const fx = -2 * (x * z + w * y),
    fz = -(1 - 2 * (x * x + y * y));
  return Math.atan2(-fx, -fz);
}

// Top of the highest solid under (x, z) that is not above `fromY`; 0 = floor.
export function airdropSurface(solids, x, z, fromY) {
  let top = 0;
  for (const box of solids || []) {
    const max = box.max,
      min = box.min;
    if (!max || !min || max.y > fromY + 1e-6 || max.y <= top) continue;
    if (x < min.x || x > max.x || z < min.z || z > max.z) continue;
    top = max.y;
  }
  return top;
}

// Build command of a drop: centred under the helicopter, along its heading.
// Fans blow where the nose points.
export function airdropCommand(kind, { x, z, yaw }) {
  if (kind === 'sticky') {
    const half = AIRDROP_TAPE / 2,
      dx = -Math.sin(yaw) * half,
      dz = -Math.cos(yaw) * half;
    return { action: 'build', kind, a: [x + dx, z + dz], b: [x - dx, z - dz] };
  }
  const angle = kind === 'fan' ? yaw + Math.PI : yaw;
  return {
    action: 'build',
    kind,
    a: [x, z],
    angle: Math.atan2(Math.sin(angle), Math.cos(angle)),
  };
}

// Vertical view (V): eye height above the landing surface, in metres. Close
// enough to read a 5 mm figure's equipment; the wheel zooms out to 80 cm.
export const AIR_VIEW_HEIGHT = 0.12;
export const AIR_VIEW_MIN_HEIGHT = 0.05;
export const AIR_VIEW_MAX_HEIGHT = 0.8;
export function zoomAirView(height, delta) {
  return Math.max(
    AIR_VIEW_MIN_HEIGHT,
    Math.min(AIR_VIEW_MAX_HEIGHT, height * Math.exp(Math.sign(delta) * 0.15)),
  );
}
