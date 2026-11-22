import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { PeerConnection } from 'node-datachannel';
import { WebSocketServer } from 'ws';
import { ASSETS, BUILD_VERSION, GAME_VERSION } from './assets.js';
import { Game, SNAPSHOT_SHARE_MS } from './game.js';
import { GameSession } from './session.ts';
import { StatsLedger } from './stats.ts';
import { STATS_PAGE } from './stats-page.ts';
import { encodeMotionBatch, encodeMotionState } from '../src/motion-wire.ts';

// Shared motion batches: flush period and per-receiver congestion limit.
export const MOTION_FLUSH_MS = 50;
const MOTION_BUFFER_LIMIT = 64 * 1024;
import {
  COMMAND_CHANNEL,
  DISCONNECT_GRACE_MS,
  MAX_COMMAND_BYTES,
  MOTION_CHANNEL,
  TCP_PATH,
  PROTOCOL,
  udpDescription,
} from '../src/udp-protocol.ts';

export function createGameServer({
  Peer = PeerConnection,
  game = new Game({
    snapshotShareMs: SNAPSHOT_SHARE_MS,
    resumable: true,
    stats: new StatsLedger({ version: GAME_VERSION, file: process.env.STATS_FILE || null }),
  }),
  statsToken = process.env.STATS_TOKEN || '',
  portBegin = 41000,
  portEnd = 41099,
  // Single shared UDP port for every connection (ICE UDP mux): 0 = port range.
  muxPort = 0,
  advertiseAddress = '',
  // Public UDP port announced to browsers when the port is remapped (Docker).
  advertisePort = 0,
  bindAddress = '',
  // WebSocket (TCP) fallback for networks that block UDP. Same session and
  // protocol; only the transport differs.
  tcpFallback = true,
  iceServers = [],
  maxConnections = 128,
  offerTimeout = 20000,
  disconnectGrace = DISCONNECT_GRACE_MS,
} = {}) {
  if (muxPort && (!Number.isInteger(muxPort) || muxPort < 1 || muxPort > 65535))
    throw Error('UDP_MUX_PORT invalide.');
  if (
    advertisePort &&
    (!Number.isInteger(advertisePort) || advertisePort < 1 || advertisePort > 65535)
  )
    throw Error('UDP_ADVERTISE_PORT invalide.');
  if (
    !muxPort &&
    (!Number.isInteger(portBegin) ||
      !Number.isInteger(portEnd) ||
      portBegin < 1024 ||
      portEnd > 65535 ||
      portBegin > portEnd)
  )
    throw Error('Plage de ports UDP invalide.');
  if (advertiseAddress && !/^[a-fA-F0-9:.]+$/.test(advertiseAddress))
    throw Error('UDP_ADVERTISE_ADDRESS doit être une adresse IP.');
  const connections = new Set();
  // Room code -> pilot ID -> latest accepted motion not yet flushed.
  const roomMotion = new Map();
  let negotiating = 0;
  const json = (res, status, value) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  // Works behind a TLS proxy without trusting arbitrary forwarded hosts.
  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      const url = new URL(origin);
      return ['http:', 'https:'].includes(url.protocol) && url.host === req.headers.host;
    } catch {
      return false;
    }
  };
  // Game session of connection `c` (UDP or TCP): `send` writes one reliable
  // reply packet; motion goes through the shared batches (c.sendMotion).
  const openSession = (c, send) =>
    new GameSession(game, {
      send,
      // Accepted motion is encoded once, then flushed with the room's
      // other updates in shared binary batches (see flushMotion()).
      relay: (player, entry) => {
        let pending = roomMotion.get(player.code);
        if (!pending) roomMotion.set(player.code, (pending = new Map()));
        pending.set(entry.peer, {
          peer: entry.peer,
          seq: entry.seq,
          captured: entry.captured,
          at: Date.now(),
          bytes: encodeMotionState(entry.state),
        });
      },
      close: c.close,
      onJoin: (player) => {
        for (const other of [...connections])
          if (
            other !== c &&
            other.session?.player?.code === player.code &&
            other.session.player.id === player.id
          )
            other.close();
      },
    });
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/healthz')
        return json(res, 200, {
          ok: true,
          transport: 'webrtc-udp',
          storage: 'ram',
          rooms: game.rooms.size,
          connections: connections.size,
          tcpFallback: tcpFallback,
          tcpConnections: [...connections].filter((c) => c.transport === 'tcp').length,
        });
      if (path === '/stats' || path === '/stats.json') {
        // Optional shared secret (STATS_TOKEN): the figures hold no player name.
        const query = new URL(req.url, 'http://localhost').searchParams;
        const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
        if (statsToken && query.get('token') !== statsToken && bearer !== statsToken)
          return json(res, 401, { error: 'Jeton de statistiques requis.' });
        if (path === '/stats') {
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          });
          return res.end(STATS_PAGE);
        }
        const version = Number(query.get('version'));
        return json(
          res,
          200,
          game.stats.report({
            ...(Number.isFinite(version) && version > 0 ? { version } : {}),
            n: /^\d+-\d+$/.test(query.get('n') || '') ? query.get('n') : 'all',
            wave: /^\d+-\d+$/.test(query.get('wave') || '') ? query.get('wave') : 'all',
          }),
        );
      }
      if (path.startsWith('/api/'))
        return json(res, 410, {
          error: 'Ce serveur accepte les actions de jeu uniquement sur UDP.',
        });
      if (path === '/rtc/offer') {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST requis.' });
        if (!sameOrigin(req)) return json(res, 403, { error: 'Origine refusée.' });
        if (connections.size >= maxConnections || negotiating >= 16)
          return json(res, 503, { error: 'Serveur UDP complet.' });
        negotiating++;
        let connection;
        try {
          let raw = '';
          for await (const part of req) {
            raw += part;
            if (raw.length > 64000) {
              json(res, 413, { error: 'Offre trop volumineuse.' });
              return;
            }
          }
          const b = JSON.parse(raw);
          if (
            b.v !== PROTOCOL ||
            typeof b.sdp !== 'string' ||
            b.sdp.length > 60000 ||
            !b.sdp.includes('m=application')
          )
            return json(res, 400, { error: 'Offre WebRTC invalide.' });
          const pc = new Peer('moucheron-' + Date.now(), {
            iceServers,
            enableIceTcp: false,
            enableIceUdpMux: !!muxPort,
            portRangeBegin: muxPort || portBegin,
            portRangeEnd: muxPort || portEnd,
            ...(bindAddress ? { bindAddress } : {}),
          });
          connection = {
            pc,
            commands: null,
            motion: null,
            session: null,
            created: Date.now(),
            queue: [],
            queuedBytes: 0,
          };
          connections.add(connection);
          const c = connection;
          const close = () => {
            if (!connections.delete(c)) return;
            clearTimeout(c.connectTimer);
            clearTimeout(c.answerTimer);
            clearTimeout(c.graceTimer);
            clearInterval(c.pump);
            c.rejectAnswer?.(Error('Connexion UDP fermée pendant la négociation.'));
            c.session.stop();
            c.queue = [];
            pc.close();
          };
          c.close = close;
          const udp = () => {
            const pair = pc.getSelectedCandidatePair();
            return (
              pair?.local.transportType.toLowerCase() === 'udp' &&
              pair?.remote.transportType.toLowerCase() === 'udp'
            );
          };
          c.sendMotion = (chunks) => {
            if (c.motion?.isOpen() && c.motion.bufferedAmount() < MOTION_BUFFER_LIMIT)
              for (const chunk of chunks) c.motion.sendMessageBinary(Buffer.from(chunk));
          };
          c.session = openSession(c, (data) => {
            const bytes = Buffer.byteLength(data);
            if (!c.commands?.isOpen() || !udp() || c.queuedBytes + bytes > 8 * 1024 * 1024)
              throw Error('Canal fiable saturé.');
            c.queue.push(data);
            c.queuedBytes += bytes;
            drain();
          });
          function drain() {
            while (c.queue.length && c.commands?.isOpen() && c.commands.bufferedAmount() < 65536) {
              const data = c.queue.shift();
              c.queuedBytes -= Buffer.byteLength(data);
              if (!c.commands.sendMessage(data)) {
                close();
                break;
              }
            }
          }
          c.pump = setInterval(() => {
            try {
              drain();
            } catch {
              close();
            }
          }, 10);
          c.pump.unref();
          c.connectTimer = setTimeout(close, offerTimeout);
          c.connectTimer.unref();
          pc.onDataChannel((dc) => {
            const label = dc.getLabel();
            if (label !== COMMAND_CHANNEL && label !== MOTION_CHANNEL) {
              dc.close();
              return;
            }
            const key = label === COMMAND_CHANNEL ? 'commands' : 'motion';
            if (c[key]) {
              close();
              return;
            }
            c[key] = dc;
            dc.onOpen(() => {
              if (!udp()) {
                close();
                return;
              }
              if (c.commands?.isOpen() && c.motion?.isOpen()) clearTimeout(c.connectTimer);
            });
            dc.onMessage((raw) => {
              if (!udp()) {
                close();
                return;
              }
              const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
              if (key === 'commands') c.session.command(text);
              else c.session.motion(text);
            });
            dc.onClosed(close);
            dc.onError(close);
          });
          // 'disconnected' often recovers (consent checks, network switch):
          // close only on failure, or after a disconnection outlasting the grace.
          pc.onStateChange((state) => {
            c.peerState = state;
            if (state === 'disconnected') {
              c.graceTimer ??= setTimeout(() => {
                c.graceTimer = null;
                if (c.peerState === 'disconnected') close();
              }, disconnectGrace);
              c.graceTimer.unref?.();
              return;
            }
            clearTimeout(c.graceTimer);
            c.graceTimer = null;
            if (['failed', 'closed'].includes(state)) close();
          });
          const answer = await new Promise((resolve, reject) => {
            c.rejectAnswer = reject;
            const timer = setTimeout(() => reject(Error('Découverte UDP expirée.')), offerTimeout);
            c.answerTimer = timer;
            pc.onGatheringStateChange((state) => {
              if (state === 'complete') {
                clearTimeout(timer);
                c.rejectAnswer = null;
                resolve(pc.localDescription());
              }
            });
            pc.setRemoteDescription(udpDescription(b.sdp), 'offer');
          });
          if (!answer?.sdp) throw Error('Réponse WebRTC absente.');
          let sdp = udpDescription(answer.sdp);
          if (!/^a=candidate:\S+\s+\d+\s+UDP\s/im.test(sdp))
            throw Error('Aucune interface UDP disponible sur le serveur.');
          if (advertiseAddress || advertisePort)
            sdp = sdp.replace(
              /^(a=candidate:\S+\s+\d+\s+UDP\s+\d+\s+)(\S+)(\s+)(\d+)/gim,
              (_, head, address, space, port) =>
                head + (advertiseAddress || address) + space + (advertisePort || port),
            );
          json(res, 200, { v: PROTOCOL, sdp });
        } catch (e) {
          connection?.close();
          if (!res.headersSent)
            json(res, 400, { error: 'Connexion UDP impossible : ' + e.message });
        } finally {
          negotiating--;
        }
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return json(res, 405, { error: 'GET requis.' });
      const versioned = path.match(/^\/assets\/([a-f0-9]{12})(\/(?:[a-z0-9-]+\/)?[^/]+\.js)$/);
      if (path.startsWith('/assets/') && (!versioned || versioned[1] !== BUILD_VERSION))
        return json(res, 410, { error: 'Rechargez la page.' });
      const asset = versioned ? versioned[2] : path;
      if (!Object.hasOwn(ASSETS, asset)) return json(res, 404, { error: 'Introuvable.' });
      // Content-addressed modules; only the entry page opts into UDP.
      const data =
        asset === '/'
          ? ASSETS[asset].replace('<head>', '<head><script>globalThis.MOUCHERON_UDP=true;</script>')
          : ASSETS[asset];
      res.writeHead(200, {
        'content-type':
          asset === '/' || asset.endsWith('.html')
            ? 'text/html; charset=utf-8'
            : 'application/javascript; charset=utf-8',
        'cache-control': versioned ? 'public,max-age=31536000,immutable' : 'no-cache',
        'x-game-version': BUILD_VERSION,
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      if (!res.headersSent) json(res, 400, { error: 'Requête invalide.' });
      else res.end();
    }
  });
  // Every MOTION_FLUSH_MS, each room's new motion goes to all its players as
  // the same binary chunks (a player skips its own entry). A congested
  // receiver misses this tick instead of queuing stale motion.
  const flushMotion = () => {
    const now = Date.now();
    for (const [code, pending] of roomMotion) {
      if (!pending.size) {
        roomMotion.delete(code);
        continue;
      }
      const chunks = encodeMotionBatch(now, [...pending.values()]);
      pending.clear();
      for (const target of connections)
        if (target.session?.player?.code === code)
          try {
            target.sendMotion(chunks);
          } catch {}
    }
  };
  // TCP fallback: one WebSocket carries both streams. Text frames are reliable
  // commands and their replies; binary frames are motion (the browser's own
  // JSON state upstream, the shared batches downstream).
  const sockets = tcpFallback
    ? new WebSocketServer({ noServer: true, maxPayload: MAX_COMMAND_BYTES + 1024 })
    : null;
  server.on('upgrade', (req, socket, head) => {
    const refuse = (status) => {
      socket.end('HTTP/1.1 ' + status + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    };
    let path;
    try {
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return refuse('400 Bad Request');
    }
    if (!sockets || path !== TCP_PATH) return refuse('404 Not Found');
    if (!sameOrigin(req)) return refuse('403 Forbidden');
    if (connections.size >= maxConnections) return refuse('503 Service Unavailable');
    sockets.handleUpgrade(req, socket, head, (ws) => {
      const c = { ws, transport: 'tcp', session: null, created: Date.now() };
      c.close = () => {
        if (!connections.delete(c)) return;
        c.session.stop();
        ws.terminate();
      };
      c.sendMotion = (chunks) => {
        if (ws.readyState === ws.OPEN && ws.bufferedAmount < MOTION_BUFFER_LIMIT)
          for (const chunk of chunks) ws.send(chunk, { binary: true });
      };
      c.session = openSession(c, (data) => {
        if (ws.readyState !== ws.OPEN || ws.bufferedAmount > 8 * 1024 * 1024)
          throw Error('Canal fiable saturé.');
        ws.send(data);
      });
      connections.add(c);
      ws.on('message', (data, binary) => {
        const text = Buffer.isBuffer(data)
          ? data.toString('utf8')
          : Buffer.concat(data).toString('utf8');
        if (binary) c.session.motion(text);
        else c.session.command(text);
      });
      ws.on('close', c.close);
      ws.on('error', c.close);
    });
  });
  const motionTimer = setInterval(flushMotion, MOTION_FLUSH_MS);
  motionTimer.unref();
  const tick = setInterval(() => {
    const rooms = new Set();
    for (const c of connections) {
      try {
        if (Date.now() - c.session.lastAt > 15000) c.close();
        else if (c.session.player) rooms.add(c.session.player.code);
      } catch {
        c.close();
      }
    }
    for (const code of rooms) {
      const r = game.rooms.get(code);
      if (r) game.advance(r);
    }
    game.sweep();
  }, 250);
  tick.unref();
  // Statistics reach STATS_FILE (when set) every 30 s and when the server stops.
  const statsTimer = setInterval(() => game.stats.save(), 30_000);
  statsTimer.unref();
  return {
    server,
    game,
    connections,
    flushMotion,
    close: async () => {
      clearInterval(tick);
      clearInterval(motionTimer);
      clearInterval(statsTimer);
      game.stats.save(true);
      for (const c of [...connections]) c.close();
      sockets?.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const port = Number(process.env.PORT || argument('--port', 3000));
  const host = process.env.HOST || argument('--host', '0.0.0.0');
  const app = createGameServer({
    portBegin: Number(process.env.UDP_PORT_BEGIN || 41000),
    portEnd: Number(process.env.UDP_PORT_END || 41099),
    muxPort: Number(process.env.UDP_MUX_PORT || 0),
    advertiseAddress: process.env.UDP_ADVERTISE_ADDRESS || '',
    advertisePort: Number(process.env.UDP_ADVERTISE_PORT || 0),
    bindAddress: process.env.UDP_BIND_ADDRESS || '',
    iceServers: process.env.STUN_SERVER ? [process.env.STUN_SERVER] : [],
    tcpFallback: process.env.TCP_FALLBACK !== '0',
  });
  app.server.listen(port, host, () =>
    console.log('i am a moucheron — RAM / WebRTC UDP — HTTP ' + port),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => app.close().then(() => process.exit(0)));
}
