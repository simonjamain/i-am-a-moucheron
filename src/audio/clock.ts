// Default timers: scheduling on setInterval (keeps running in background tabs),
// spatial updates on requestAnimationFrame when the platform has it.
import type { AudioTimers } from './types.ts';

export function defaultTimers(): AudioTimers {
  const g = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: () => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const timers: AudioTimers = {
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  };
  if (g.requestAnimationFrame && g.cancelAnimationFrame) {
    const request = g.requestAnimationFrame.bind(g),
      cancel = g.cancelAnimationFrame.bind(g);
    timers.requestFrame = (callback) => request(callback);
    timers.cancelFrame = (handle) => cancel(handle as number);
  }
  return timers;
}

/** Calls `callback` at every frame until the returned function is called. */
export function frameLoop(timers: AudioTimers, callback: () => void): () => void {
  const request = timers.requestFrame,
    cancel = timers.cancelFrame;
  if (!request || !cancel) return () => {};
  let handle: unknown,
    running = true;
  const frame = () => {
    if (!running) return;
    handle = request(frame);
    callback();
  };
  handle = request(frame);
  return () => {
    running = false;
    cancel(handle);
  };
}
