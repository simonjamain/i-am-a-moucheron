/**
 * The rounds another player fires, as their motion reports them. Each shooter counts the rounds
 * they fire (`rounds` in their motion state); a viewer turns each new number into one tracer, paced
 * by the weapon's interval, and gives it that number as its identity. So the count is exact, and a
 * ricochet the shooter reports against a moving surface (`skids`) names the very round it concerns.
 * See docs/projectiles.md.
 */

/** More than this many unseen rounds at once means the counter was reset or we missed a lot. */
export const MAX_PENDING_ROUNDS = 60;

interface Shooter {
  /** Last counter value seen. */
  seen: number;
  /** Round numbers waiting for their turn. */
  pending: number[];
  /** Seconds until the next round may leave. */
  cooldown: number;
}

export class RemoteRounds {
  private shooters = new Map<string, Shooter>();

  /** Reads the shooter's counter: new numbers join the queue. The first sight only syncs. */
  observe(shooter: string, counter: number | undefined): void {
    if (!Number.isInteger(counter) || (counter as number) < 0) return;
    const rounds = counter as number,
      entry = this.shooters.get(shooter);
    if (!entry) {
      this.shooters.set(shooter, { seen: rounds, pending: [], cooldown: 0 });
      return;
    }
    const delta = rounds - entry.seen;
    if (delta < 0 || delta > MAX_PENDING_ROUNDS) {
      // Reset (new life, new vehicle) or a long silence: start over, no volley from the past.
      entry.pending = [];
      entry.cooldown = 0;
    } else for (let n = entry.seen + 1; n <= rounds; n++) entry.pending.push(n);
    entry.seen = rounds;
  }

  /** Round numbers that leave the barrel during `dt` seconds, one per `interval`. */
  release(shooter: string, dt: number, interval: number): number[] {
    const entry = this.shooters.get(shooter);
    if (!entry) return [];
    entry.cooldown -= dt;
    const out: number[] = [];
    while (entry.pending.length && entry.cooldown <= 0) {
      out.push(entry.pending.shift() as number);
      entry.cooldown += Math.max(1e-3, interval);
    }
    // Idle time is not banked: after a pause the next round leaves at once, not several.
    if (!entry.pending.length && entry.cooldown < 0) entry.cooldown = 0;
    return out;
  }

  forget(shooter: string): void {
    this.shooters.delete(shooter);
  }
}
