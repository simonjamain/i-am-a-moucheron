import { FLAK } from './scale.ts';
import { fuseRange } from './combat.ts';

/**
 * Context-key action: Shift / Ctrl held sweep the fixed DCA's fuse (the post's
 * continuous setting). The H2 copilot's missile is on Space and the tank's shell
 * on R (docs/controls.md): Shift / Ctrl choose no weapon any more.
 */
export type ContextAction = { fuse: 1 | -1 };
/** Held-key map (KeyboardEvent.code → pressed). */
export type HeldKeys = Readonly<Record<string, boolean | undefined>>;
export function contextKey(
  { turret = false }: { type?: string; seat?: string; turret?: boolean },
  key: string,
): ContextAction | null {
  if (!turret || !['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(key))
    return null;
  return { fuse: key.startsWith('Shift') ? 1 : -1 };
}
// Fixed DCA fuse: Shift/Ctrl held sweeps the distance continuously; releasing
// stops at once, both held cancel out. Full 100–1200 m span in about 3 s.
export const FUSE_RATE = 360;
export function advanceFuse(range: number, keys: HeldKeys, dt: number): number {
  const direction =
    (keys.ShiftLeft || keys.ShiftRight ? 1 : 0) - (keys.ControlLeft || keys.ControlRight ? 1 : 0);
  if (!direction || !(dt > 0)) return fuseRange(range);
  return fuseRange(range + direction * FUSE_RATE * Math.min(dt, 0.1));
}
export function rangeReadout(range: number): { metres: number; fraction: number } {
  return {
    metres: fuseRange(range),
    fraction: (fuseRange(range) - FLAK.minRange) / (FLAK.maxRange - FLAK.minRange),
  };
}
export class HoldZoom {
  held: boolean;
  scope: unknown;
  constructor() {
    this.held = false;
    this.scope = null;
  }
  press(scope: unknown): void {
    this.held = !!scope;
    this.scope = scope;
  }
  reset(): void {
    this.held = false;
    this.scope = null;
  }
  fov(scope: unknown): number {
    if (scope !== this.scope) this.reset();
    return this.held ? 28 : 62;
  }
}
