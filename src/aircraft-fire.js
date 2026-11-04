// Local prediction owns firing; reliable network replies settle ammunition in bounded batches.
// A reply must never create geometry, sound or a second projectile.
export class AircraftFire {
  constructor(
    request,
    scope,
    {
      limit = 512,
      interval = 50,
      maxInFlight = 8,
      session = globalThis.crypto.randomUUID(),
      schedule = (callback, delay) => setTimeout(callback, delay),
      cancel = (timer) => clearTimeout(timer),
      now = () => Date.now(),
    } = {},
  ) {
    this.request = request;
    this.scope = scope;
    this.limit = limit;
    this.interval = interval;
    this.maxInFlight = maxInFlight;
    this.session = session;
    this.schedule = schedule;
    this.cancel = cancel;
    this.now = now;
    this.sequence = 0;
    this.states = new Map();
    this.queue = [];
    this.timer = null;
    this.inFlight = 0;
    this.generation = 0;
  }

  state(vehicle, seat, supplies, weapon = seat) {
    const key = JSON.stringify([vehicle, seat, weapon]);
    let state = this.states.get(key);
    if (!state) {
      state = { vehicle, seat, weapon, ammo: 0, revision: -1, pending: 0, blocked: false };
      this.states.set(key, state);
    }
    if (supplies && supplies.revision >= state.revision) {
      state.ammo = Math.max(0, supplies.ammo?.[weapon] || 0);
      state.revision = supplies.revision;
    }
    return state;
  }

  available(vehicle, seat, supplies, weapon = seat) {
    const state = this.state(vehicle, seat, supplies, weapon);
    return state.blocked ? 0 : Math.max(0, Math.floor(state.ammo - state.pending));
  }

  fire(vehicle, seat, supplies, weapon = seat) {
    if (
      this.scope() == null ||
      this.queue.length >= this.limit ||
      this.available(vehicle, seat, supplies, weapon) < 1
    )
      return false;
    const state = this.state(vehicle, seat, undefined, weapon);
    state.pending++;
    this.queue.push({
      state,
      generation: this.generation,
      shot: this.session + ':' + ++this.sequence,
      sending: false,
      retryAt: 0,
    });
    // Full batches flush immediately; short bursts are coalesced for 50 ms.
    if (this.queue.filter((e) => !e.sending && e.retryAt <= this.now()).length >= 32)
      this.scheduleFlush(0, true);
    else this.scheduleFlush(this.interval);
    return true;
  }

  invalidate() {
    // Already-fired rounds still need settlement, even when leaving the post.
    // Replies never launch anything, including after exit-and-return to a seat.
    this.generation++;
    for (const state of this.states.values()) state.blocked = false;
    void this.flush();
  }

  scheduleFlush(delay, expedite = false) {
    if (this.inFlight >= this.maxInFlight) return;
    const unsent = this.queue.filter((entry) => !entry.sending);
    if (!unsent.length) return;
    const current = this.now();
    const ready = unsent.some((entry) => entry.retryAt <= current);
    const retryDelay = ready ? 0 : Math.max(0, Math.min(...unsent.map((e) => e.retryAt)) - current);
    const wait = Math.max(delay, retryDelay);
    if (this.timer !== null) {
      if (!expedite) return;
      this.cancel(this.timer);
      this.timer = null;
    }
    this.timer = this.schedule(() => {
      this.timer = null;
      void this.flush(false);
    }, wait);
    this.timer?.unref?.();
  }

  async flush(force = true) {
    if (this.inFlight >= this.maxInFlight) return;
    const current = this.now();
    const first = this.queue.find((entry) => !entry.sending && (force || entry.retryAt <= current));
    if (!first) {
      this.scheduleFlush(0);
      return;
    }
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
    const state = first.state;
    const batch = this.queue
      .filter(
        (entry) => !entry.sending && (force || entry.retryAt <= current) && entry.state === state,
      )
      .slice(0, 32);
    const shots = batch.map((entry) => entry.shot);
    for (const entry of batch) entry.sending = true;
    this.inFlight++;
    this.scheduleFlush(this.interval);
    try {
      const result = await this.request({
        vehicle: state.vehicle,
        seat: state.seat,
        ...(state.weapon !== state.seat ? { weapon: state.weapon } : {}),
        shots,
      });
      if (
        result.vehicle !== state.vehicle ||
        result.seat !== state.seat ||
        !Array.isArray(result.shots) ||
        shots.some((shot) => !result.shots.includes(shot))
      )
        throw Error('Incomplete ammunition acknowledgement');
      this.state(state.vehicle, state.seat, result, state.weapon);
      const accepted = new Set(shots);
      this.queue = this.queue.filter((entry) => !accepted.has(entry.shot));
      state.pending -= batch.length;
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        // Definitive refusal: never replay a rejected report or refund rounds.
        const rejected = new Set(shots);
        this.queue = this.queue.filter((entry) => !rejected.has(entry.shot));
        state.pending -= batch.length;
        if (batch.some((entry) => entry.generation === this.generation) && this.scope() != null)
          state.blocked = true;
      } else {
        // Outcome unknown: retry identical IDs, while other slots can progress.
        for (const entry of batch) {
          entry.sending = false;
          entry.retryAt = this.now() + 1000;
        }
      }
    } finally {
      this.inFlight--;
      this.scheduleFlush(0);
    }
  }
}
