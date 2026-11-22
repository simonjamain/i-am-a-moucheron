import { PROTOCOL, MAX_COMMAND_BYTES, encodeReply, encodeReplyText } from '../src/udp-protocol.ts';
import { validMotion } from '../src/network.ts';
import {
  encodeSnapshotForWire,
  MOTION_REFRESH_MS,
  snapshotRosterCore,
  snapshotRosterKey,
} from '../src/snapshot-wire.ts';
import type { WireSnapshot, WireState } from '../src/snapshot-wire.ts';
import type { MotionState } from '../src/network.ts';

/** Room and pilot identifying this connection once joined. */
export interface SessionPlayer {
  code: string;
  id: string;
}
/** Roster metadata of the last snapshot sent with a roster. */
export interface SessionRosterMeta {
  core: string;
  revision: number | undefined;
  total: unknown;
}
/** Accepted motion handed to the room relay. */
export interface SessionRelayEntry {
  peer: string;
  seq: number;
  captured: number | undefined;
  state: MotionState;
}
/** Reply of Game.join() as this session reads it. */
export type SessionJoinReply = {
  id: string;
  resumed?: boolean;
  snapshot: WireSnapshot & { code: string };
  [field: string]: unknown;
};
/** Room state fields this session touches. */
export interface SessionRoom {
  touched: number;
  pilots: { size: number };
}
/** Pilot state fields this session reads or touches. */
export interface SessionPilot {
  id: string;
  incarnation: unknown;
  occupation: unknown;
  mode: unknown;
  vehicle_id: unknown;
  seat: unknown;
  seen: number;
  state: { fire: unknown };
}
/** The part of server/game.js Game used by a session. */
export interface SessionGame {
  join(body: object): SessionJoinReply;
  command(
    code: string,
    id: string,
    path: string,
    body: object,
    options: { rosterKey: string | null; rosterMeta: SessionRosterMeta | null },
  ): SessionCommandReply | null | undefined;
  player(code: string, id: string): { r: SessionRoom; p: SessionPilot };
  sync(
    r: SessionRoom,
    p: SessionPilot,
    body: { mode: unknown; state: unknown; ground: unknown },
  ): unknown;
  disconnect(code: string, id: string): unknown;
}
export interface GameSessionOptions {
  send: (chunk: string) => void;
  relay: (player: SessionPlayer, entry: SessionRelayEntry) => void;
  close?: () => void;
  onJoin?: (player: SessionPlayer) => void;
  now?: () => number;
}
/** Reply of any other command: a room snapshot, or another report (fire). */
export type SessionCommandReply = WireSnapshot & { snapshot?: never };
interface SessionReply {
  status: number;
  body: unknown;
}
type StatusError = Error & { status?: number };

// Session identity comes from its DTLS connection, never from a player ID supplied
// in a command. Old command IDs can never execute again after cache eviction.
export class GameSession {
  game: SessionGame;
  send: (chunk: string) => void;
  relay: (player: SessionPlayer, entry: SessionRelayEntry) => void;
  close: (() => void) | undefined;
  onJoin: ((player: SessionPlayer) => void) | undefined;
  now: () => number;
  replies: Map<number, string>;
  replyBytes: number;
  highWater: number;
  lastSeq: number;
  player: SessionPlayer | null;
  closed: boolean;
  window: number;
  count: number;
  motionCount: number;
  lastAt: number;
  lastRosterKey: string | null;
  lastRosterMeta: SessionRosterMeta | null;
  lastWireSnapshot: WireState | null;
  motionRefreshAt: number;
  constructor(
    game: SessionGame,
    { send, relay, close, onJoin, now = Date.now }: GameSessionOptions = {} as GameSessionOptions,
  ) {
    this.game = game;
    this.send = send;
    this.relay = relay;
    this.close = close;
    this.onJoin = onJoin;
    this.now = now;
    this.replies = new Map();
    this.replyBytes = 0;
    this.highWater = 0;
    this.lastSeq = -1;
    this.player = null;
    this.closed = false;
    this.window = now();
    this.count = 0;
    this.motionCount = 0;
    this.lastAt = now();
    this.lastRosterKey = null;
    this.lastRosterMeta = null;
    this.lastWireSnapshot = null;
    this.motionRefreshAt = -Infinity;
  }
  rate(motion = false): boolean {
    const now = this.now();
    if (now - this.window >= 1000) {
      this.window = now;
      this.count = 0;
      this.motionCount = 0;
    }
    if (motion) return ++this.motionCount <= 60;
    return ++this.count <= 120;
  }
  command(raw: unknown): void {
    if (this.closed) return;
    if (typeof raw !== 'string' || raw.length > MAX_COMMAND_BYTES) {
      this.stop();
      return;
    }
    // A burst above the command rate is refused, not fatal: the command is not
    // executed (its ID stays usable) and the client receives a 429 reply.
    const allowed = this.rate();
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      this.stop();
      return;
    }
    if (
      m.v !== PROTOCOL ||
      !Number.isSafeInteger(m.id) ||
      m.id < 1 ||
      typeof m.path !== 'string' ||
      !m.body ||
      typeof m.body !== 'object'
    ) {
      this.stop();
      return;
    }
    this.lastAt = this.now();
    if (!allowed) {
      this.output({ status: 429, body: { error: 'Trop de commandes ; réessayez.' } }, m.id);
      return;
    }
    if (this.replies.has(m.id)) {
      this.output(this.replies.get(m.id)!, m.id);
      return;
    }
    if (m.id <= this.highWater) {
      this.output(
        { status: 409, body: { error: 'Commande déjà traitée ; résultat expiré.' } },
        m.id,
      );
      return;
    }
    this.highWater = m.id;
    let reply: SessionReply;
    try {
      let body: SessionJoinReply | SessionCommandReply | null | undefined;
      if (m.path === 'join') {
        if (this.player) throw Object.assign(Error('Session déjà ouverte.'), { status: 409 });
        body = this.game.join(m.body);
        this.player = { code: body.snapshot.code, id: body.id };
        // A resumed pilot must not keep an older connection alive.
        if (body.resumed) this.onJoin?.(this.player);
      } else {
        if (!this.player) throw Object.assign(Error('Rejoignez une salle.'), { status: 401 });
        body = this.game.command(this.player.code, this.player.id, m.path, m.body, {
          rosterKey: this.lastRosterKey,
          rosterMeta: this.lastRosterMeta,
        });
      }
      // Only room snapshots share the per-connection baseline. Some replies are
      // not snapshots (aircraft-fire returns its fire report): encoding one as
      // a snapshot patch broke the browser's next decode and closed the link.
      const isSnapshot = m.path === 'join' || Object.hasOwn(body ?? {}, 'rosterRevision');
      if (!isSnapshot) reply = { status: 200, body };
      else {
        // All commands (not only sync) share one roster baseline. Omit it
        // BEFORE snapshot cloning, then compact initial rosters and event deltas.
        const snapshot: WireSnapshot = {
          ...(m.path === 'join' ? body!.snapshot : body),
        };
        // Read roster metadata before encoding: most fields then move into $patch.
        const key = snapshotRosterKey(snapshot),
          meta = {
            core: snapshotRosterCore(snapshot),
            revision: snapshot.rosterRevision,
            total: snapshot.total,
          };
        // Other players' positions in reliable replies: refreshed at 1 Hz only.
        const refresh = this.now() - this.motionRefreshAt >= MOTION_REFRESH_MS;
        if (refresh) this.motionRefreshAt = this.now();
        this.lastWireSnapshot = encodeSnapshotForWire(snapshot, this.lastWireSnapshot, {
          holdMotionOf: refresh ? undefined : this.player?.id,
        });
        if (snapshot.rosterGroups || snapshot.rosterAddGroups) {
          this.lastRosterKey = key;
          this.lastRosterMeta = meta;
        }
        // Do not mutate the domain object or the response retained by a caller.
        reply = {
          status: 200,
          body: m.path === 'join' ? { ...body, snapshot } : snapshot,
        };
      }
    } catch (e) {
      reply = {
        status: (e as StatusError).status || 500,
        body: {
          error: (e as StatusError).status
            ? (e as StatusError).message
            : 'Erreur du serveur de jeu.',
        },
      };
      if (!(e as StatusError).status) console.error(e);
    }
    // Cache JSON strings, not references to mutable domain state.
    const encoded = JSON.stringify(reply);
    this.replies.set(m.id, encoded);
    this.replyBytes += encoded.length;
    while (this.replies.size > 32 || this.replyBytes > 4 * 1024 * 1024) {
      const oldest = this.replies.keys().next().value;
      this.replyBytes -= this.replies.get(oldest!)!.length;
      this.replies.delete(oldest!);
    }
    this.output(encoded, m.id);
  }
  output(value: string | SessionReply, id: number): void {
    try {
      for (const chunk of typeof value === 'string'
        ? encodeReplyText(value, id)
        : encodeReply(value, id))
        this.send(chunk);
    } catch {
      this.stop();
    }
  }
  motion(raw: unknown): void {
    if (
      this.closed ||
      !this.player ||
      typeof raw !== 'string' ||
      raw.length > 4096 ||
      !this.rate(true)
    )
      return;
    try {
      const m = JSON.parse(raw);
      if (
        m.v !== PROTOCOL ||
        !Number.isSafeInteger(m.seq) ||
        m.seq <= this.lastSeq ||
        !validMotion(m.state)
      )
        return;
      const { r, p } = this.game.player(this.player.code, this.player.id);
      if (
        m.incarnation !== p.incarnation ||
        m.occupation !== p.occupation ||
        m.mode !== p.mode ||
        (m.state.vehicle || null) !== p.vehicle_id ||
        (m.state.seat || null) !== p.seat
      )
        return;
      this.lastSeq = m.seq;
      this.lastAt = this.now();
      p.seen = this.now();
      r.touched = this.now();
      this.game.sync(r, p, { mode: p.mode, state: m.state, ground: m.state.ground });
      // Large rooms cannot afford 20 broadcasts/s × every sender × every peer.
      // Process every accepted state but halve only the lossy relay rate at 40+ pilots.
      if (r.pilots.size < 40 || m.seq % 2 === 0)
        this.relay(this.player, {
          peer: p.id,
          seq: m.seq,
          captured: Number.isFinite(m.at) ? m.at : undefined,
          state: { ...m.state, fire: p.state.fire },
        });
    } catch (e) {
      if ((e as StatusError).status === 401) this.stop();
    }
  }
  stop(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.player) this.game.disconnect(this.player.code, this.player.id);
    this.replies.clear();
    this.lastWireSnapshot = null;
    this.lastRosterMeta = null;
    this.close?.();
  }
}
