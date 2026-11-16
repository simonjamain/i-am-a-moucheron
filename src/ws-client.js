// TCP fallback of the game connection, for networks that block UDP (many
// company networks only let HTTPS out). One WebSocket carries both streams:
// text frames are the reliable commands and their replies, binary frames are
// motion (this page's JSON state upstream, the shared batches downstream).
// Same protocol, session and resume as UdpClient; only the transport differs.
// A lost packet stalls everything behind it on TCP: smoothness is lower than
// over UDP, which the game always tries first.
import { TCP_PATH } from './udp-protocol.js';
import { UdpClient } from './udp-client.js';

const encoder = new TextEncoder();

export class WsClient extends UdpClient {
  constructor({ Socket = globalThis.WebSocket, url, ...options } = {}) {
    super({ ...options, Peer: null });
    this.Socket = Socket;
    this.url =
      url ??
      (globalThis.location?.protocol === 'https:' ? 'wss://' : 'ws://') +
        globalThis.location?.host +
        TCP_PATH;
    this.enabled = !!Socket;
  }
  async connect() {
    if (!this.Socket) throw Error('Ce navigateur ne prend pas en charge WebSocket.');
    const socket = (this.socket = new this.Socket(this.url));
    socket.binaryType = 'arraybuffer';
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Serveur injoignable en TCP.')), this.timeout);
        socket.onopen = () => {
          clearTimeout(timer);
          resolve();
        };
        socket.onerror = socket.onclose = () => {
          clearTimeout(timer);
          reject(Error('Connexion TCP refusée par le serveur.'));
        };
      });
    } catch (e) {
      this.stop();
      throw e;
    }
    this.protocol = 'tcp';
    socket.onmessage = (e) =>
      typeof e.data === 'string' ? this.receiveReply(e.data) : this.receiveBatch(e.data);
    socket.onerror = null;
    socket.onclose = () => this.fail(Error('Connexion TCP fermée par le serveur.'));
    return this;
  }
  ready() {
    return !this.closed && this.protocol === 'tcp' && this.socket?.readyState === 1;
  }
  buffered() {
    return this.socket.bufferedAmount;
  }
  transmit(data) {
    this.socket.send(data);
  }
  // Stale motion is skipped rather than queued behind a congested stream.
  motionReady() {
    return this.ready() && this.socket.bufferedAmount <= 16384;
  }
  transmitMotion(data) {
    this.socket.send(encoder.encode(data));
  }
  async measure() {}
  stop() {
    const open = !this.closed;
    super.stop();
    if (open) this.socket?.close();
  }
}
