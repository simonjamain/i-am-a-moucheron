import { FLAK } from './scale.js';
import { fuseRange } from './combat.js';
export function contextKey({ type, seat, turret = false }, key) {
  if (!['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(key)) return null;
  if (type === 'helicopter' && seat === 'pilot' && !turret) return null;
  const shift = key.startsWith('Shift');
  return turret
    ? { fuse: shift ? 1 : -1 }
    : type === 'helicopter'
      ? { heliWeapon: shift ? 'copilot' : 'missile' }
      : type === 'tank'
        ? { shell: shift ? 'he' : 'ap' }
        : null;
}
// Fixed DCA fuse: Shift/Ctrl held sweeps the distance continuously; releasing
// stops at once, both held cancel out. Full 100–1200 m span in about 3 s.
export const FUSE_RATE = 360;
export function advanceFuse(range, keys, dt) {
  const direction =
    (keys.ShiftLeft || keys.ShiftRight ? 1 : 0) - (keys.ControlLeft || keys.ControlRight ? 1 : 0);
  if (!direction || !(dt > 0)) return fuseRange(range);
  return fuseRange(range + direction * FUSE_RATE * Math.min(dt, 0.1));
}
export function rangeReadout(range) {
  return {
    metres: fuseRange(range),
    fraction: (fuseRange(range) - FLAK.minRange) / (FLAK.maxRange - FLAK.minRange),
  };
}
export class HoldZoom {
  constructor() {
    this.held = false;
    this.scope = null;
  }
  press(scope) {
    this.held = !!scope;
    this.scope = scope;
  }
  reset() {
    this.held = false;
    this.scope = null;
  }
  fov(scope) {
    if (scope !== this.scope) this.reset();
    return this.held ? 28 : 62;
  }
}
