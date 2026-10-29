import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { PeerConnection } from 'node-datachannel';
import { ASSETS, BUILD_VERSION, OFFICE_SOLIDS } from '../worker/assets.js';
import { Game } from './game.js';
import { GameSession } from './session.js';
import { COMMAND_CHANNEL, MOTION_CHANNEL, PROTOCOL, udpDescription } from '../src/udp-protocol.js';

export function createGameServer({
  Peer = PeerConnection,
  game = new Game({ solids: OFFICE_SOLIDS }),
  portBegin = 41000,
  portEnd = 41099,
  advertiseAddress = '',
  bindAddress = '',
  iceServers = [],
  maxConnections = 128,
  offerTimeout = 20000,
} = {}) {
  if (
    !Number.isInteger(portBegin) ||
    !Number.isInteger(portEnd) ||
    portBegin < 1024 ||
    portEnd > 65535 ||
    portBegin > portEnd
  )
    throw Error('Plage de ports UDP invalide.');
  if (advertiseAddress && !/^[a-fA-F0-9:.]+$/.test(advertiseAddress))
    throw Error('UDP_ADVERTISE_ADDRESS doit être une adresse IP.');
  const connections = new Set();
  let negotiating = 0;
  const json = (res, status, value) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
  };
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
        });
      if (path.startsWith('/api/'))
        return json(res, 410, {
          error: 'Ce serveur accepte les actions de jeu uniquement sur UDP.',
        });
      if (path === '/rtc/offer') {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST requis.' });
        // Works behind a TLS proxy without trusting arbitrary forwarded hosts.
        const origin = req.headers.origin;
        if (
          origin &&
          (!['http:', 'https:'].includes(new URL(origin).protocol) ||
            new URL(origin).host !== req.headers.host)
        )
          return json(res, 403, { error: 'Origine refusée.' });
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
            enableIceUdpMux: false,
            portRangeBegin: portBegin,
            portRangeEnd: portEnd,
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
          c.session = new GameSession(game, {
            send: (data) => {
              const bytes = Buffer.byteLength(data);
              if (!c.commands?.isOpen() || !udp() || c.queuedBytes + bytes > 8 * 1024 * 1024)
                throw Error('Canal fiable saturé.');
              c.queue.push(data);
              c.queuedBytes += bytes;
              drain();
            },
            relay: (player, data) => {
              for (const target of connections)
                if (
                  target !== c &&
                  target.session.player?.code === player.code &&
                  target.motion?.isOpen() &&
                  target.motion.bufferedAmount() < 4096
                )
                  try {
                    target.motion.sendMessage(data);
                  } catch {}
            },
            close,
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
          pc.onStateChange((state) => {
            if (['failed', 'closed', 'disconnected'].includes(state)) close();
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
          if (advertiseAddress)
            sdp = sdp.replace(
              /^(a=candidate:\S+\s+\d+\s+UDP\s+\d+\s+)\S+/gim,
              '$1' + advertiseAddress,
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
      const versioned = path.match(/^\/assets\/([a-f0-9]{12})(\/[^/]+\.js)$/);
      if (path.startsWith('/assets/') && (!versioned || versioned[1] !== BUILD_VERSION))
        return json(res, 410, { error: 'Rechargez la page.' });
      const asset = versioned ? versioned[2] : path;
      if (!Object.hasOwn(ASSETS, asset)) return json(res, 404, { error: 'Introuvable.' });
      // Same content-addressed modules as Sites; only this entry opts into UDP.
      const data =
        asset === '/'
          ? ASSETS[asset].replace('<head>', '<head><script>globalThis.MOUCHERON_UDP=true;</script>')
          : ASSETS[asset];
      res.writeHead(200, {
        'content-type':
          asset === '/' ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8',
        'cache-control': versioned ? 'public,max-age=31536000,immutable' : 'no-cache',
        'x-game-version': BUILD_VERSION,
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      if (!res.headersSent) json(res, 400, { error: 'Requête invalide.' });
      else res.end();
    }
  });
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
  return {
    server,
    game,
    connections,
    close: async () => {
      clearInterval(tick);
      for (const c of [...connections]) c.close();
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
    advertiseAddress: process.env.UDP_ADVERTISE_ADDRESS || '',
    bindAddress: process.env.UDP_BIND_ADDRESS || '',
    iceServers: process.env.STUN_SERVER ? [process.env.STUN_SERVER] : [],
  });
  app.server.listen(port, host, () =>
    console.log('i am a moucheron — RAM / WebRTC UDP — HTTP ' + port),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => app.close().then(() => process.exit(0)));
}
