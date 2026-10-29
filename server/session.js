import { PROTOCOL, MAX_COMMAND_BYTES, encodeReply } from '../src/udp-protocol.js';
import { validMotion } from '../src/network.js';

// Session identity comes from its DTLS connection, never from a player ID supplied
// in a command. Old command IDs can never execute again after cache eviction.
export class GameSession {
  constructor(game, { send, relay, close, now = Date.now } = {}) {
    this.game = game;
    this.send = send;
    this.relay = relay;
    this.close = close;
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
  }
  rate(motion = false) {
    const now = this.now();
    if (now - this.window >= 1000) {
      this.window = now;
      this.count = 0;
      this.motionCount = 0;
    }
    if (motion) return ++this.motionCount <= 60;
    return ++this.count <= 120;
  }
  command(raw) {
    if (this.closed) return;
    if (typeof raw !== 'string' || raw.length > MAX_COMMAND_BYTES || !this.rate()) {
      this.stop();
      return;
    }
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
    if (this.replies.has(m.id)) {
      this.output(this.replies.get(m.id), m.id);
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
    let reply;
    try {
      let body;
      if (m.path === 'join') {
        if (this.player) throw Object.assign(Error('Session déjà ouverte.'), { status: 409 });
        body = this.game.join(m.body);
        this.player = { code: body.snapshot.code, id: body.id };
      } else {
        if (!this.player) throw Object.assign(Error('Rejoignez une salle.'), { status: 401 });
        body = this.game.command(this.player.code, this.player.id, m.path, m.body);
      }
      reply = { status: 200, body };
    } catch (e) {
      reply = {
        status: e.status || 500,
        body: { error: e.status ? e.message : 'Erreur du serveur de jeu.' },
      };
      if (!e.status) console.error(e);
    }
    // Cache JSON strings, not references to mutable domain state.
    const encoded = JSON.stringify(reply);
    this.replies.set(m.id, encoded);
    this.replyBytes += encoded.length;
    while (this.replies.size > 32 || this.replyBytes > 4 * 1024 * 1024) {
      const oldest = this.replies.keys().next().value;
      this.replyBytes -= this.replies.get(oldest).length;
      this.replies.delete(oldest);
    }
    this.output(encoded, m.id);
  }
  output(value, id) {
    try {
      for (const chunk of encodeReply(typeof value === 'string' ? JSON.parse(value) : value, id))
        this.send(chunk);
    } catch {
      this.stop();
    }
  }
  motion(raw) {
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
      this.relay(
        this.player,
        JSON.stringify({
          v: PROTOCOL,
          peer: p.id,
          seq: m.seq,
          state: { ...m.state, fire: p.state.fire },
        }),
      );
    } catch (e) {
      if (e.status === 401) this.stop();
    }
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    if (this.player) this.game.disconnect(this.player.code, this.player.id);
    this.replies.clear();
    this.close?.();
  }
}
