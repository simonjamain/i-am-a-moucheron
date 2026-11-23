// TCP fallback of the game connection, for networks that block UDP (many
// company networks only let HTTPS out). One WebSocket carries both streams:
// text frames are the reliable commands and their replies, binary frames are
// motion (this page's JSON state upstream, the shared batches downstream).
// Same protocol, session and resume as UdpClient; only the transport differs.
// A lost packet stalls everything behind it on TCP: smoothness is lower than
// over UDP, which the game always tries first.
import { TCP_PATH } from './udp-protocol.ts';
import { UdpClient } from './udp-client.ts';
import type { UdpClientOptions } from './udp-client.ts';

const encoder = new TextEncoder();

export interface WsClientOptions extends Omit<UdpClientOptions, 'Peer'> {
  /** WebSocket constructor (the `ws` package in Node tests). */
  Socket?: typeof WebSocket;
  url?: string;
}

export class WsClient extends UdpClient {
  Socket: typeof WebSocket | undefined;
  url: string;
  socket?: WebSocket;
  constructor({ Socket = globalThis.WebSocket, url, ...options }: WsClientOptions = {}) {
    super({ ...options, Peer: null });
    this.Socket = Socket;
    this.url =
      url ??
      (globalThis.location?.protocol === 'https:' ? 'wss://' : 'ws://') +
        globalThis.location?.host +
        TCP_PATH;
    this.enabled = !!Socket;
  }
  override async connect(): Promise<this> {
    if (!this.Socket) throw Error('Ce navigateur ne prend pas en charge WebSocket.');
    const socket = (this.socket = new this.Socket(this.url));
    socket.binaryType = 'arraybuffer';
    try {
      await new Promise<void>((resolve, reject) => {
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
  override ready(): boolean {
    return !this.closed && this.protocol === 'tcp' && this.socket?.readyState === 1;
  }
  override buffered(): number {
    return this.socket!.bufferedAmount;
  }
  override transmit(data: string): void {
    this.socket!.send(data);
  }
  // Stale motion is skipped rather than queued behind a congested stream.
  override motionReady(): boolean {
    return this.ready() && this.socket!.bufferedAmount <= 16384;
  }
  override transmitMotion(data: string): void {
    this.socket!.send(encoder.encode(data));
  }
  override async measure(): Promise<void> {}
  override stop(): void {
    const open = !this.closed;
    super.stop();
    if (open) this.socket?.close();
  }
}
