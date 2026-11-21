export interface PendingShot<Scope> {
  scope: Scope;
  at: number;
  index: number;
}
export interface AutomaticFireStep {
  cooldown: number;
  shots: number;
}

export class GunSalvos<Scope = unknown> {
  pending: PendingShot<Scope>[];
  constructor() {
    this.pending = [];
  }
  enqueue(scope: Scope, now: number, count = 6): boolean {
    if (this.pending.length + count > 128) return false;
    for (let i = 0; i < count; i++) this.pending.push({ scope, at: now + i * 2, index: i });
    return true;
  }
  update(scope: Scope, now: number, fire: (index: number) => void): void {
    const due = this.pending;
    this.pending = [];
    for (const shot of due) {
      if (shot.scope !== scope) continue;
      if (shot.at <= now) fire(shot.index);
      else this.pending.push(shot);
    }
  }
  clear(): void {
    this.pending = [];
  }
}

// Catch up rounds due inside a slow frame instead of tying cadence to FPS.
// Bound the work after a stall or extreme room tuning; do not replay a hidden tab.
export function advanceAutomaticFire(
  cooldown: number,
  dt: number,
  interval: number,
  shooting: boolean,
  maxShots = 8,
): AutomaticFireStep {
  const remaining = cooldown - Math.max(0, dt);
  if (!shooting) return { cooldown: Math.max(0, remaining), shots: 0 };
  if (!(interval > 0) || !Number.isFinite(interval)) return { cooldown: 0, shots: 0 };
  if (remaining > 0) return { cooldown: remaining, shots: 0 };
  const shots = Math.min(maxShots, Math.floor(-remaining / interval) + 1);
  return { cooldown: Math.max(0, remaining + shots * interval), shots };
}
