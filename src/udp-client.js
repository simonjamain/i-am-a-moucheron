import {
  PROTOCOL,
  COMMAND_CHANNEL,
  MOTION_CHANNEL,
  MOTION_OPTIONS,
  ReplyAssembler,
  udpDescription,
  MAX_COMMAND_BYTES,
} from './udp-protocol.js';
import { validMotion } from './network.js';

export class UdpClient {
  constructor({
    Peer = globalThis.RTCPeerConnection,
    fetcher = globalThis.fetch?.bind(globalThis),
    onMotion = () => {},
    onClose = () => {},
    timeout = 20000,
  } = {}) {
    this.Peer = Peer;
    this.fetcher = fetcher;
    this.onMotion = onMotion;
    this.onClose = onClose;
    this.timeout = timeout;
    this.pending = new Map();
    this.assembler = new ReplyAssembler();
    this.seq = 0;
    this.motionSeq = 0;
    this.remoteSeq = new Map();
    this.members = new Set();
    this.freshAt = new Map();
    this.protocol = '';
    this.enabled = !!Peer;
    this.closed = false;
    this.received = 0;
    this.incarnation = 0;
    this.occupation = 0;
    this.mode = 'foot';
  }
  async connect() {
    if (!this.Peer) throw Error('Ce navigateur ne prend pas en charge WebRTC sur UDP.');
    const pc = (this.pc = new this.Peer({ iceServers: [], bundlePolicy: 'max-bundle' }));
    this.commands = pc.createDataChannel(COMMAND_CHANNEL, { ordered: true });
    this.motion = pc.createDataChannel(MOTION_CHANNEL, MOTION_OPTIONS);
    this.commands.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string' || e.data.length > 100000) throw Error('Paquet invalide.');
        const packet = JSON.parse(e.data);
        // Late replies cannot allocate an unbounded assembly buffer.
        if (!this.pending.has(packet.id)) return;
        const reply = this.assembler.receive(packet);
        if (!reply) return;
        const pending = this.pending.get(packet.id);
        if (!pending) return;
        this.pending.delete(packet.id);
        clearTimeout(pending.timer);
        if (reply.status >= 400)
          pending.reject(Object.assign(Error(reply.body.error), { status: reply.status }));
        else pending.resolve(reply.body);
      } catch (e) {
        this.fail(e);
      }
    };
    this.motion.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string' || e.data.length > 4096) return;
        const m = JSON.parse(e.data);
        if (
          m.v !== PROTOCOL ||
          typeof m.peer !== 'string' ||
          !this.members.has(m.peer) ||
          !Number.isSafeInteger(m.seq) ||
          m.seq < 0 ||
          m.seq <= (this.remoteSeq.get(m.peer) ?? -1) ||
          !validMotion(m.state)
        )
          return;
        this.remoteSeq.set(m.peer, m.seq);
        this.freshAt.set(m.peer, performance.now());
        this.received++;
        this.onMotion(m.peer, m.state, performance.now(), m.seq);
      } catch {}
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState))
        this.fail(Error('Connexion UDP interrompue. Rechargez pour rejoindre la partie.'));
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await this.gather(pc);
      const response = await this.fetcher('/rtc/offer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(this.timeout),
        body: JSON.stringify({ v: PROTOCOL, sdp: udpDescription(pc.localDescription.sdp) }),
      });
      const answer = await response.json();
      if (!response.ok) throw Error(answer.error || 'Serveur UDP indisponible.');
      await pc.setRemoteDescription({ type: 'answer', sdp: udpDescription(answer.sdp) });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          clearInterval(poll);
          reject(Error('UDP indisponible sur ce réseau. Aucun transport de secours.'));
        }, this.timeout);
        const poll = setInterval(() => {
          if (this.closed) {
            clearTimeout(timer);
            clearInterval(poll);
            reject(Error('Connexion UDP interrompue.'));
          } else if (this.commands.readyState === 'open' && this.motion.readyState === 'open') {
            clearTimeout(timer);
            clearInterval(poll);
            resolve();
          }
        }, 25);
      });
      await this.measure();
      if (this.protocol !== 'udp') throw Error('Transport UDP non confirmé : connexion refusée.');
    } catch (e) {
      this.stop();
      throw e;
    }
    return this;
  }
  gather(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', check);
      };
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          finish();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        finish();
        reject(Error('Découverte UDP impossible.'));
      }, this.timeout);
      pc.addEventListener('icegatheringstatechange', check);
      check();
    });
  }
  request(path, body) {
    if (this.closed || this.protocol !== 'udp' || this.commands?.readyState !== 'open')
      return Promise.reject(Error('Connexion UDP indisponible.'));
    if (this.pending.size >= 32 || this.commands.bufferedAmount > 256 * 1024)
      return Promise.reject(Object.assign(Error('Connexion saturée.'), { status: 429 }));
    const id = ++this.seq,
      data = JSON.stringify({ v: PROTOCOL, id, path, body });
    if (data.length > MAX_COMMAND_BYTES) return Promise.reject(Error('Commande trop volumineuse.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(Error('Confirmation UDP absente. Rechargez la partie.')),
        this.timeout,
      );
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.commands.send(data);
      } catch (e) {
        this.fail(e);
      }
    });
  }
  observe(snapshot, self) {
    const p = snapshot?.pilots?.find((p) => p.id === self);
    if (p) {
      this.incarnation = p.incarnation;
      this.occupation = p.occupation;
      this.mode = p.mode;
    }
  }
  send(state) {
    if (
      this.protocol !== 'udp' ||
      this.motion?.readyState !== 'open' ||
      this.motion.bufferedAmount > 4096
    )
      return;
    const data = JSON.stringify({
      v: PROTOCOL,
      seq: ++this.motionSeq,
      incarnation: this.incarnation,
      occupation: this.occupation,
      mode: this.mode,
      state,
    });
    if (data.length > 4096) return;
    try {
      this.motion.send(data);
    } catch (e) {
      this.fail(e);
    }
  }
  reconcile(ids) {
    this.members = new Set(ids);
    for (const id of this.freshAt.keys())
      if (!this.members.has(id)) {
        this.freshAt.delete(id);
        this.remoteSeq.delete(id);
      }
  }
  fresh(id) {
    return performance.now() - (this.freshAt.get(id) ?? -Infinity) < 750;
  }
  async measure() {
    if (!this.pc || this.closed) return;
    const report = await this.pc.getStats();
    let pair;
    report.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId)
        pair = report.get(s.selectedCandidatePairId);
    });
    if (!pair)
      report.forEach((s) => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) pair = s;
      });
    const local = pair && report.get(pair.localCandidateId),
      remote = pair && report.get(pair.remoteCandidateId);
    this.protocol =
      local?.protocol?.toLowerCase() === 'udp' && remote?.protocol?.toLowerCase() === 'udp'
        ? 'udp'
        : '';
    if (this.protocol !== 'udp' && this.commands?.readyState === 'open')
      this.fail(Error('UDP non confirmé : connexion arrêtée.'));
  }
  stats() {
    return {
      active: [...this.freshAt.keys()].filter((id) => this.fresh(id)).length,
      total: this.members.size,
      received: this.received,
      udp: this.protocol === 'udp' ? 1 : 0,
      enabled: this.enabled,
      error: this.lastError || '',
    };
  }
  fail(error) {
    if (this.closed) return;
    this.lastError = error.message;
    this.stop();
    this.onClose(error);
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    this.protocol = '';
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error(this.lastError || 'Connexion UDP fermée.'));
    }
    this.pending.clear();
    this.assembler.clear();
    this.commands?.close();
    this.motion?.close();
    this.pc?.close();
  }
}
