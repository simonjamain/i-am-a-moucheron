// Credit counter is independent of purchases. First observation establishes the
// baseline; repeated and out-of-order snapshots can never replay a reward.
export class RewardQueue {
  play: () => void;
  seen: number | null;
  pending: number;
  next: number;
  constructor(play: () => void) {
    this.play = play;
    this.seen = null;
    this.pending = 0;
    this.next = 0;
  }
  observe(count: number, reset = false): void {
    if (!Number.isSafeInteger(count) || count < 0) return;
    if (this.seen === null || reset) {
      this.seen = count;
      this.pending = 0;
      return;
    }
    if (count < this.seen) return;
    this.pending += count - this.seen;
    this.seen = count;
  }
  tick(now: number): void {
    if (this.pending > 0 && now >= this.next) {
      this.pending--;
      this.play();
      this.next = now + 290;
    }
  }
}
