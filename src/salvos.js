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
