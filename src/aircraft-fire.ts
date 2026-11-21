// Local prediction owns firing; reliable network replies settle ammunition in bounded batches.
// A reply must never create geometry, sound or a second projectile.
/** Server ammunition view of one vehicle (rounds per weapon, monotonic revision). */
export interface Supplies {
  revision: number;
  ammo?: Partial<Record<string, number>>;
}
export interface FireRequest {
  vehicle: string;
  seat: string;
  weapon?: string;
  shots: string[];
}
export interface FireReply extends Supplies {
  vehicle: string;
  seat: string;
  shots: string[];
}
interface WeaponState {
  vehicle: string;
  seat: string;
  weapon: string;
  ammo: number;
  revision: number;
  pending: number;
  blocked: boolean;
}
interface QueuedShot {
  state: WeaponState;
  generation: number;
  shot: string;
  sending: boolean;
  retryAt: number;
}
type Timer = ReturnType<typeof setTimeout> | { unref?: () => unknown } | number;
export interface AircraftFireOptions {
  limit?: number;
  interval?: number;
  maxInFlight?: number;
  session?: string;
  schedule?: (callback: () => void, delay: number) => Timer;
  cancel?: (timer: Timer) => void;
  now?: () => number;
}
export class AircraftFire {
  request: (body: FireRequest) => Promise<FireReply>;
  scope: () => unknown;
  limit: number;
  interval: number;
  maxInFlight: number;
  session: string;
  schedule: (callback: () => void, delay: number) => Timer;
  cancel: (timer: Timer) => void;
  now: () => number;
  sequence: number;
  states: Map<string, WeaponState>;
  queue: QueuedShot[];
  timer: Timer | null;
  inFlight: number;
  generation: number;
  constructor(
    request: (body: FireRequest) => Promise<FireReply>,
    scope: () => unknown,
    {
      limit = 512,
      interval = 50,
      maxInFlight = 8,
      session = globalThis.crypto.randomUUID(),
      schedule = (callback, delay) => setTimeout(callback, delay),
      cancel = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      now = () => Date.now(),
    }: AircraftFireOptions = {},
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

  state(
    vehicle: string,
    seat: string,
    supplies: Supplies | null | undefined,
    weapon: string = seat,
  ): WeaponState {
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

  available(
    vehicle: string,
    seat: string,
    supplies: Supplies | null | undefined,
    weapon: string = seat,
  ): number {
    const state = this.state(vehicle, seat, supplies, weapon);
    return state.blocked ? 0 : Math.max(0, Math.floor(state.ammo - state.pending));
  }

  fire(
    vehicle: string,
    seat: string,
    supplies: Supplies | null | undefined,
    weapon: string = seat,
  ): boolean {
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

  invalidate(): void {
    // Already-fired rounds still need settlement, even when leaving the post.
    // Replies never launch anything, including after exit-and-return to a seat.
    this.generation++;
    for (const state of this.states.values()) state.blocked = false;
    void this.flush();
  }

  scheduleFlush(delay: number, expedite = false): void {
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
    (this.timer as { unref?: () => unknown } | null)?.unref?.();
  }

  async flush(force = true): Promise<void> {
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
    } catch (caught) {
      const error = caught as { status?: number };
      if (
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
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
