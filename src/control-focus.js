// Pointer ownership is explicit: UI/escape releases it; only a new user gesture
// (canvas click, joining, closing a panel) may request it again.
export class ControlFocus {
  constructor({
    canvas,
    document,
    onChange = () => {},
    onError = () => {},
    touch = false,
    allowed = () => true,
  }) {
    this.canvas = canvas;
    this.document = document;
    this.onChange = onChange;
    this.onError = onError;
    this.touch = touch;
    this.active = touch;
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
  async capture() {
    if (this.active || this.pending || !this.allowed()) return;
    this.wanted = true;
    if (this.touch) {
      this.active = true;
      this.onChange(true);
      return;
    }
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
  release() {
    this.wanted = false;
    this.active = false;
    this.onChange(false);
    if (this.document.pointerLockElement === this.canvas) this.document.exitPointerLock();
  }
}
export function gameKey(event) {
  const key = event.key?.toLowerCase();
  return key && /^[a-z]$/.test(key) ? 'Key' + key.toUpperCase() : event.code;
}
export function flightInput(keys, pad, active = true) {
  if (!active) return { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false };
  const axis = (positive, negative, analog = 0) =>
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
    fire: !!keys.Space || pad.fire,
  };
}
export function lookDelta(look, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  look.yaw -= Math.max(-250, Math.min(250, dx)) * 0.003;
  look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - dy * 0.003));
}

export function equipmentExitAction({
  key,
  repeat,
  vehicle,
  turret = -1,
  dead = false,
  formOpen = false,
}) {
  if (key !== 'KeyF' || repeat || dead || formOpen) return null;
  return vehicle ? 'vehicle-exit' : turret >= 0 ? 'turret' : null;
}

export function equipmentEnterAllowed({ onFoot, vehicle, turret = -1, dead = false }) {
  return !!onFoot && !vehicle && turret < 0 && !dead;
}
