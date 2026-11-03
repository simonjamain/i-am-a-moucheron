import { groundCommand } from './ground-defense-state.js';
import { distanceToSegment } from './ground-defense.js';

// Fixed, affordable pieces follow the walking character in office metres.
export function groundPlacement({ foot, mode, rotation = 0, anchor, defense, dollars }) {
  if (!foot || !foot.grounded || foot.parachute || foot.y >= 0.025)
    return { error: 'Rejoignez le sol du bureau.' };
  const center = [foot.x + Math.sin(foot.face) * 0.045, foot.z - Math.cos(foot.face) * 0.045];
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
  } else if (mode === 'sugar' || mode === 'fan')
    command = { action: 'build', kind: mode, a: center, angle: rotation };
  else if (anchor && Math.hypot(center[0] - anchor[0], center[1] - anchor[1]) >= 0.002) {
    command = { action: 'build', kind: mode, a: center, b: anchor };
  } else {
    const angle = foot.face + rotation;
    const dx = Math.cos(angle) * 0.06,
      dz = Math.sin(angle) * 0.06;
    command = {
      action: 'build',
      kind: mode,
      a: [center[0] - dx, center[1] - dz],
      b: [center[0] + dx, center[1] + dz],
    };
  }
  try {
    const result = groundCommand(structuredClone(defense), command, [foot.x, foot.z], dollars);
    return { center, command, price: result.price };
  } catch (error) {
    return { center, command, error: error.message };
  }
}
