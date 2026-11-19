/** Normalised gamepad state; axes in [-1, 1], triggers/throttle in [-1, 1]. */
export interface PadState {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  fire: boolean;
  heavy: boolean;
  dash: boolean;
  guard: boolean;
  start: boolean;
  connected: boolean;
  label: string;
}
/** The subset of the Gamepad API read here (tests pass plain objects). */
export interface PadLike {
  connected: boolean;
  mapping: string;
  id?: string;
  axes: readonly number[];
  buttons: readonly ({ value: number } | undefined)[];
}
export const neutralPad = (): PadState => ({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0,
  fire: false,
  heavy: false,
  dash: false,
  guard: false,
  start: false,
  connected: false,
  label: '',
});
export function deadzone(v: number | undefined, zone = 0.14): number {
  const x = Number.isFinite(v) ? Math.max(-1, Math.min(1, v as number)) : 0;
  return Math.abs(x) <= zone ? 0 : (Math.sign(x) * (Math.abs(x) - zone)) / (1 - zone);
}
export function readPad(
  pads: Iterable<PadLike | null> | ArrayLike<PadLike | null> | null | undefined,
): PadState {
  const p = Array.from(pads || []).find((p) => p?.connected && p.mapping === 'standard');
  if (!p) return neutralPad();
  const button = (i: number): number => Math.max(0, Math.min(1, Number(p.buttons[i]?.value) || 0));
  return {
    connected: true,
    label: p.id || 'Manette',
    roll: deadzone(p.axes[0]) === 0 ? 0 : -deadzone(p.axes[0]),
    pitch: deadzone(p.axes[1]),
    yaw: deadzone(p.axes[2]) || button(5) - button(4),
    throttle: button(7) - button(6),
    fire: button(0) > 0.5,
    heavy: button(3) > 0.5,
    dash: button(1) > 0.5,
    guard: button(4) > 0.5,
    start: button(9) > 0.5,
  };
}
