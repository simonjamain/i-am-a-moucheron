// Ground creatures are simulated by the server; display a short history of
// authoritative poses instead of holding each snapshot until the next sync.
export const GROUND_VISUAL_DELAY_MS = 300;

export class GroundMotionTrack {
  constructor() {
    this.key = null;
    this.frames = [];
  }

  observe(snapshot) {
    const key = [
      snapshot.code,
      snapshot.base?.epoch,
      snapshot.wave,
      snapshot.started,
      snapshot.phase,
    ].join(':');
    if (key !== this.key) {
      this.key = key;
      this.frames = [];
    }
    if (snapshot.phase !== 'combat') return;
    const time = snapshot.sentAt ?? snapshot.now;
    if (!Number.isFinite(time) || (this.frames.length && time <= this.frames.at(-1).time))
      return;
    // Retain the parsed snapshot, not another deep copy of every ground agent.
    this.frames.push({ time, units: snapshot.groundAgents || {} });
    while (
      this.frames.length > 2 &&
      (this.frames.length > 12 || this.frames[1].time < time - 1000)
    )
      this.frames.shift();
  }

  sample(serverNow) {
    const frames = this.frames;
    if (!frames.length) return () => undefined;
    const target = serverNow - GROUND_VISUAL_DELAY_MS;
    if (!Number.isFinite(target) || target <= frames[0].time) {
      const units = frames[0].units;
      return (id) => units[id];
    }
    let next = 1;
    while (next < frames.length && frames[next].time < target) next++;
    if (next === frames.length || frames[next].time === target) {
      const units = frames[Math.min(next, frames.length - 1)].units;
      return (id) => units[id];
    }
    const older = frames[next - 1];
    const newer = frames[next];
    const t = (target - older.time) / (newer.time - older.time);
    return (id) => {
      const a = older.units[id];
      const b = newer.units[id];
      // A newly spawned agent has no earlier pose to blend from. Likewise,
      // don't interpolate across a missing or already-arrived entity.
      if (!a) return b;
      if (!b || a.arrived) return a;
      const p = [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t];
      const dx = a.dir[0] + (b.dir[0] - a.dir[0]) * t;
      const dz = a.dir[1] + (b.dir[1] - a.dir[1]) * t;
      const length = Math.hypot(dx, dz);
      return { p, dir: length > 0 ? [dx / length, dz / length] : b.dir, arrived: false };
    };
  }
}
