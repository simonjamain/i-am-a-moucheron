export const neutralPad = () => ({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0,
  fire: false,
  heavy: false,
  dash: false,
  guard: false,
  start: false,
  help: false,
  connected: false,
  label: '',
});
export function deadzone(v, zone = 0.14) {
  v = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return Math.abs(v) <= zone ? 0 : (Math.sign(v) * (Math.abs(v) - zone)) / (1 - zone);
}
export function readPad(pads) {
  const p = Array.from(pads || []).find((p) => p?.connected && p.mapping === 'standard');
  if (!p) return neutralPad();
  const button = (i) => Math.max(0, Math.min(1, Number(p.buttons[i]?.value) || 0));
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
    help: button(8) > 0.5,
  };
}
