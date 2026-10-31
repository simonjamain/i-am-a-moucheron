import { FLAK, MAP } from './scale.js';
import { fuseRange } from './combat.js';
export function contextKey({ type, seat, turret = false }, key) {
  if (!['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(key)) return null;
  if (type === 'helicopter' && seat === 'pilot' && !turret) return null;
  const shift = key.startsWith('Shift');
  return turret
    ? { range: shift ? FLAK.step : -FLAK.step }
    : type === 'helicopter'
      ? { heliWeapon: shift ? 'copilot' : 'missile' }
      : type === 'tank'
        ? { shell: shift ? 'he' : 'ap' }
        : null;
}
export function rangeReadout(range) {
  return {
    metres: MAP.metres(range),
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
