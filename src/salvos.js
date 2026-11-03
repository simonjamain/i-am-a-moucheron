export class GunSalvos {
  constructor() {
    this.pending = [];
  }
  enqueue(scope, now, count = 6) {
    if (this.pending.length + count > 128) return false;
    for (let i = 0; i < count; i++) this.pending.push({ scope, at: now + i * 2, index: i });
    return true;
  }
  update(scope, now, fire) {
    const due = this.pending;
    this.pending = [];
    for (const shot of due) {
      if (shot.scope !== scope) continue;
      if (shot.at <= now) fire(shot.index);
      else this.pending.push(shot);
    }
  }
  clear() {
    this.pending = [];
  }
}

// Catch up rounds due inside a slow frame instead of tying cadence to FPS.
// Bound the work after a stall or extreme room tuning; do not replay a hidden tab.
export function advanceAutomaticFire(cooldown, dt, interval, shooting, maxShots = 8) {
  const remaining = cooldown - Math.max(0, dt);
  if (!shooting) return { cooldown: Math.max(0, remaining), shots: 0 };
  if (!(interval > 0) || !Number.isFinite(interval)) return { cooldown: 0, shots: 0 };
  if (remaining > 0) return { cooldown: remaining, shots: 0 };
  const shots = Math.min(maxShots, Math.floor(-remaining / interval) + 1);
  return { cooldown: Math.max(0, remaining + shots * interval), shots };
}
