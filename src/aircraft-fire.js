// Local prediction owns firing; HTTP only settles ammunition in bounded batches.
// A reply must never create geometry, sound or a second projectile.
export class AircraftFire {
  constructor(
    request,
    scope,
    {
      limit = 128,
      interval = 250,
      session = globalThis.crypto.randomUUID(),
      schedule = (callback, delay) => setTimeout(callback, delay),
      cancel = (timer) => clearTimeout(timer),
    } = {},
  ) {
    this.request = request;
    this.scope = scope;
    this.limit = limit;
    this.interval = interval;
    this.session = session;
    this.schedule = schedule;
    this.cancel = cancel;
    this.sequence = 0;
    this.states = new Map();
    this.queue = [];
    this.timer = null;
    this.inFlight = false;
    this.generation = 0;
  }

  state(vehicle, seat, supplies) {
    const key = JSON.stringify([vehicle, seat]);
    let state = this.states.get(key);
    if (!state) {
      state = { vehicle, seat, ammo: 0, revision: -1, pending: 0, blocked: false };
      this.states.set(key, state);
    }
    if (supplies && supplies.revision >= state.revision) {
      state.ammo = Math.max(0, supplies.ammo?.[seat] || 0);
      state.revision = supplies.revision;
    }
    return state;
  }

  available(vehicle, seat, supplies) {
    const state = this.state(vehicle, seat, supplies);
    return state.blocked ? 0 : Math.max(0, Math.floor(state.ammo - state.pending));
  }

  fire(vehicle, seat, supplies) {
    if (
      this.scope() == null ||
      this.queue.length >= this.limit ||
      this.available(vehicle, seat, supplies) < 1
    )
      return false;
    const state = this.state(vehicle, seat);
    state.pending++;
    this.queue.push({
      state,
      generation: this.generation,
      shot: this.session + ':' + ++this.sequence,
    });
    this.scheduleFlush(this.interval);
    return true;
  }

  invalidate() {
    // Already-fired rounds still need settlement, even when leaving the post.
    // Replies never launch anything, including after exit-and-return to a seat.
    this.generation++;
    for (const state of this.states.values()) state.blocked = false;
    void this.flush();
  }

  scheduleFlush(delay) {
    if (this.timer !== null || this.inFlight || !this.queue.length) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.flush();
    }, delay);
    this.timer?.unref?.();
  }

  async flush() {
    if (this.inFlight || !this.queue.length) return;
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    const state = this.queue[0].state;
    const batch = this.queue.filter((entry) => entry.state === state).slice(0, 32);
    const shots = batch.map((entry) => entry.shot);
    this.inFlight = true;
    let retry = false;
    try {
      const result = await this.request({ vehicle: state.vehicle, seat: state.seat, shots });
      if (
        result.vehicle !== state.vehicle ||
        result.seat !== state.seat ||
        !Array.isArray(result.shots) ||
        shots.some((shot) => !result.shots.includes(shot))
      )
        throw Error('Incomplete ammunition acknowledgement');
      this.state(state.vehicle, state.seat, result);
      const accepted = new Set(shots);
      this.queue = this.queue.filter((entry) => !accepted.has(entry.shot));
      state.pending -= batch.length;
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        // Definitive rejection (e.g. post left before the report arrived).
        // Stop prediction for this occupation; never blindly refund shots.
        const rejected = new Set(shots);
        this.queue = this.queue.filter((entry) => !rejected.has(entry.shot));
        state.pending -= batch.length;
        if (batch.some((entry) => entry.generation === this.generation) && this.scope() != null)
          state.blocked = true;
      } else retry = true; // Unknown outcome: retry the same IDs, never spend twice.
    } finally {
      this.inFlight = false;
      this.scheduleFlush(retry ? 1000 : this.interval);
    }
  }
}
