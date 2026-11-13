import { GROUND_BOUNDS, groundCommand } from './ground-defense-state.js';
import { distanceToSegment } from './ground-defense.js';
import { airdropCommand } from './airdrop.js';

// Castor volant: every drop is centred straight below the helicopter and turned
// like it; repair/remove target the construction closest to that point.
export const AIRDROP_TARGET_RANGE = 0.1;
export function airdropPlacement({ builder, mode, defense, dollars }) {
  const { x, z, yaw, landingY } = builder || {};
  if (![x, z, yaw, landingY].every(Number.isFinite)) return { error: 'Position inconnue.' };
  const center = [x, z];
  if (mode === 'barricade') return { center, error: 'Le Castor volant ne largue pas de mur LEGO.' };
  let command,
    target = null;
  if (mode === 'repair' || mode === 'remove') {
    target = (defense?.structures || [])
      .map((s) => ({
        s,
        d: s.position
          ? Math.hypot(x - s.position[0], z - s.position[1])
          : distanceToSegment(center, s.a, s.b),
      }))
      .filter(({ d }) => d < AIRDROP_TARGET_RANGE)
      .sort((a, b) => a.d - b.d)[0]?.s;
    if (!target) return { center, error: 'Survolez une construction (10 cm).' };
    command = { action: mode, id: target.id };
  } else command = airdropCommand(mode, { x, z, yaw });
  try {
    const result = groundCommand(structuredClone(defense), command, center, dollars, Date.now(), {
      castor: true,
      y: landingY,
    });
    return { center, command, price: result.price, landingY, target };
  } catch (error) {
    return { center, command, landingY, target, error: error.message };
  }
}

// Preview commands use the camera target, never the walking direction.
export function groundPlacement({
  foot,
  mode,
  rotation = 0,
  anchor,
  defense,
  dollars,
  aim,
  castor = false,
}) {
  if (!foot || !foot.grounded || foot.parachute || foot.y >= 0.025)
    return { error: 'Rejoignez le sol du bureau.' };
  if (
    !aim ||
    ![aim.x, aim.y, aim.z].every(Number.isFinite) ||
    Math.abs(aim.y) > 0.0003 ||
    aim.x < GROUND_BOUNDS[0] ||
    aim.x > GROUND_BOUNDS[2] ||
    aim.z < GROUND_BOUNDS[1] ||
    aim.z > GROUND_BOUNDS[3]
  )
    return { error: 'Visez une surface proche au sol.' };
  const center = [aim.x, aim.z];
  if (['barricade', 'sticky'].includes(mode)) {
    if (!anchor) return { center, startOnly: true };
    if (Math.hypot(center[0] - anchor[0], center[1] - anchor[1]) < 0.002)
      return { center, error: 'Visez la fin du mur, à distance du début.' };
  }
  let command;
  if (mode === 'repair' || mode === 'remove') {
    const target = (defense?.structures || [])
      .map((s) => ({
        s,
        d: s.position
          ? Math.hypot(center[0] - s.position[0], center[1] - s.position[1])
          : distanceToSegment(center, s.a, s.b),
      }))
      .filter(({ d }) => d < 0.035)
      .sort((a, b) => a.d - b.d)[0]?.s;
    if (!target) return { center, error: 'Visez une construction proche devant vous.' };
    command = { action: mode, id: target.id };
  } else if (['sugar', 'fan', 'sentry', 'bunker', 'antitank'].includes(mode))
    command = { action: 'build', kind: mode, a: center, angle: rotation };
  else
    command =
      mode === 'barricade'
        ? { action: 'build', kind: mode, a: anchor, b: center }
        : { action: 'build', kind: mode, a: center, b: anchor };

  try {
    const result = groundCommand(
      structuredClone(defense),
      command,
      [foot.x, foot.z],
      dollars,
      Date.now(),
      {
        castor,
      },
    );
    return { center, command, price: result.price };
  } catch (error) {
    return { center, command, error: error.message };
  }
}
