// Pointer ownership is explicit: UI/escape releases it; only a new user gesture
// (canvas click, joining, closing a panel) may request it again. Desktop-first:
// mouse and keyboard only, no touch mode.
import type { PadState } from './input.ts';

/** The canvas and document subsets used (tests pass plain objects). */
export interface FocusCanvas {
  requestPointerLock?: () => unknown;
  focus?: (options?: FocusOptions) => void;
}
export interface FocusDocument {
  pointerLockElement: unknown;
  addEventListener(type: 'pointerlockchange', listener: () => void): void;
  exitPointerLock(): void;
}
export interface ControlFocusOptions {
  canvas: FocusCanvas;
  document: FocusDocument;
  onChange?: (active: boolean) => void;
  onError?: (error: unknown) => void;
  allowed?: () => boolean;
}
export class ControlFocus {
  canvas: FocusCanvas;
  document: FocusDocument;
  onChange: (active: boolean) => void;
  onError: (error: unknown) => void;
  active: boolean;
  allowed: () => boolean;
  wanted: boolean;
  pending: boolean;
  constructor({
    canvas,
    document,
    onChange = () => {},
    onError = () => {},
    allowed = () => true,
  }: ControlFocusOptions) {
    this.canvas = canvas;
    this.document = document;
    this.onChange = onChange;
    this.onError = onError;
    this.active = false;
    this.allowed = allowed;
    this.wanted = false;
    this.pending = false;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (locked && (!this.wanted || !this.allowed())) {
        this.release();
        return;
      }
      this.active = locked;
      if (!locked) this.wanted = false;
      if (this.active) canvas.focus?.({ preventScroll: true });
      onChange(this.active);
    });
  }
  async capture(): Promise<void> {
    if (this.active || this.pending || !this.allowed()) return;
    this.wanted = true;
    this.pending = true;
    try {
      if (!this.canvas.requestPointerLock) throw Error('Pointer Lock unavailable');
      await this.canvas.requestPointerLock();
    } catch (error) {
      this.active = false;
      this.wanted = false;
      this.onChange(false);
      this.onError(error);
    } finally {
      this.pending = false;
    }
  }
  release(): void {
    this.wanted = false;
    this.active = false;
    this.onChange(false);
    if (this.document.pointerLockElement === this.canvas) this.document.exitPointerLock();
  }
}
export function gameKey(event: { key?: string; code: string }): string {
  const key = event.key?.toLowerCase();
  return key && /^[a-z]$/.test(key) ? 'Key' + key.toUpperCase() : event.code;
}
/** Pressed keys by `KeyboardEvent.code` (see gameKey). */
export type KeyMap = Partial<Record<string, boolean>>;
export interface FlightInput {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  fire: boolean;
}
export function flightInput(
  keys: KeyMap,
  pad: Pick<PadState, 'pitch' | 'roll' | 'yaw' | 'throttle' | 'fire'>,
  active = true,
): FlightInput {
  if (!active) return { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false };
  const axis = (positive: boolean, negative: boolean, analog = 0): number =>
    Math.max(-1, Math.min(1, Number(positive) - Number(negative) + analog));
  return {
    pitch: axis(
      !!(keys.ArrowDown || keys.KeyS),
      !!(keys.ArrowUp || keys.KeyZ || keys.KeyW),
      pad.pitch,
    ),
    roll: axis(!!(keys.ArrowLeft || keys.KeyQ), !!(keys.ArrowRight || keys.KeyD), pad.roll),
    yaw: axis(!!keys.KeyE, !!keys.KeyA, pad.yaw),
    throttle: axis(
      !!(keys.ShiftLeft || keys.ShiftRight),
      !!(keys.ControlLeft || keys.ControlRight),
      pad.throttle,
    ),
    fire: pad.fire,
  };
}
// Manual keyboard or gamepad input overrides the mouse instructor on its axis.
// On release the mouse takes over that axis again.
type Steering = Pick<FlightInput, 'pitch' | 'roll' | 'yaw'>;
export function airplaneSteering(assisted: Steering, manual: Steering): Steering {
  return {
    pitch: manual.pitch !== 0 ? manual.pitch : assisted.pitch,
    roll: manual.roll !== 0 ? manual.roll : assisted.roll,
    yaw: manual.yaw !== 0 ? manual.yaw : assisted.yaw,
  };
}
// A mouse count turns the view by a fixed angle, so a zoomed (narrower) view
// would show it as a bigger jump on screen. Scale the angle by the field of
// view so one count moves the same number of pixels zoomed or not.
export const BASE_FOV = 62;
export function lookScale(fov: number, base = BASE_FOV): number {
  if (!(fov > 0) || !(base > 0)) return 1;
  const radians = (degrees: number): number => (degrees * Math.PI) / 360;
  return Math.min(1, Math.tan(radians(fov)) / Math.tan(radians(base)));
}
export function lookDelta(
  look: { yaw: number; pitch: number },
  dx: number,
  dy: number,
  scale = 1,
): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  look.yaw -= Math.max(-250, Math.min(250, dx)) * 0.003 * scale;
  look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - dy * 0.003 * scale));
}

export function equipmentExitAction({
  key,
  repeat,
  vehicle,
  turret = -1,
  dead = false,
  formOpen = false,
}: {
  key: string;
  repeat?: boolean;
  vehicle?: unknown;
  turret?: number;
  dead?: boolean;
  formOpen?: boolean;
}): 'vehicle-exit' | 'turret' | null {
  if (key !== 'KeyF' || repeat || dead || formOpen) return null;
  return vehicle ? 'vehicle-exit' : turret >= 0 ? 'turret' : null;
}

export function equipmentEnterAllowed({
  onFoot,
  vehicle,
  turret = -1,
  dead = false,
}: {
  onFoot?: unknown;
  vehicle?: unknown;
  turret?: number;
  dead?: boolean;
}): boolean {
  return !!onFoot && !vehicle && turret < 0 && !dead;
}
