// Essai de partie contre un serveur déjà lancé, typiquement l'image Docker construite.
//
//   node scripts/smoke-image.ts http://127.0.0.1:3000
//
// Deux pairs WebRTC natifs (node-datachannel) négocient en HTTP, ouvrent les canaux de
// commandes et de mouvement en UDP, rejoignent la même salle, démarrent la partie et se
// voient bouger. `/healthz` seul ne prouve ni le module natif du runtime de l'image, ni
// la plage UDP publiée, ni l'adresse annoncée : ce script les traverse. Il ne prouve pas
// le WAN, le navigateur ni le rendu (docs/operations.md#limites-de-validation).
import assert from 'node:assert/strict';
import { PeerConnection, cleanup, type DataChannel } from 'node-datachannel';
import { decodeMotionBatch } from '../src/motion-wire.ts';
import { ReplyAssembler, PROTOCOL, COMMAND_CHANNEL, MOTION_CHANNEL } from '../src/udp-protocol.ts';

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ROOM = 'SMOKE';
// Contre un serveur local (conteneur à ports publiés), le client n'annonce que la boucle
// locale : le conteneur ne peut alors pas le joindre par le pont Docker, et seule la
// plage UDP publiée avec l'adresse annoncée (UDP_ADVERTISE_ADDRESS) mène à la partie.
const host = new URL(base).hostname;
const bindAddress = host === '127.0.0.1' || host === 'localhost' ? '127.0.0.1' : undefined;

interface Reply {
  status: number;
  body: any;
}

async function until(test: () => boolean, what: string, ms = 10000): Promise<void> {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > ms) throw Error('timeout: ' + what);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function peer(label: string) {
  const pc = new PeerConnection(label, {
    iceServers: [],
    enableIceTcp: false,
    ...(bindAddress ? { bindAddress } : {}),
  });
  const commands: DataChannel = pc.createDataChannel(COMMAND_CHANNEL, { unordered: false });
  const motion: DataChannel = pc.createDataChannel(MOTION_CHANNEL, {
    unordered: true,
    maxRetransmits: 0,
  });
  const assembler = new ReplyAssembler();
  const replies = new Map<number, Reply>();
  const peers: unknown[] = [];
  commands.onMessage((raw) => {
    const packet = JSON.parse(String(raw));
    const value = assembler.receive(packet);
    if (value) replies.set(packet.id, value as Reply);
  });
  motion.onMessage((raw) => {
    if (typeof raw === 'string') return;
    for (const entry of decodeMotionBatch(raw as Buffer).entries) peers.push(entry.peer);
  });
  await until(() => pc.gatheringState() === 'complete', label + ' ICE gathering');
  const response = await fetch(base + '/rtc/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ v: PROTOCOL, sdp: pc.localDescription()?.sdp }),
  });
  const answer = await response.json();
  assert.equal(response.status, 200, label + ' offer: ' + JSON.stringify(answer));
  pc.setRemoteDescription(answer.sdp, 'answer' as any);
  await until(() => commands.isOpen() && motion.isOpen(), label + ' data channels open');
  const selected = pc.getSelectedCandidatePair();
  assert.equal(selected?.local.transportType.toLowerCase(), 'udp', label + ' plays over UDP');
  let seq = 0;
  const request = async (path: string, body: object = {}): Promise<Reply> => {
    const id = ++seq;
    commands.sendMessage(JSON.stringify({ v: PROTOCOL, id, path, body }));
    await until(() => replies.has(id), label + ' reply to ' + path);
    return replies.get(id)!;
  };
  return {
    pc,
    motion,
    peers,
    request,
    remote: selected?.remote.address + ':' + selected?.remote.port,
  };
}

const clients: PeerConnection[] = [];
try {
  const health = await (await fetch(base + '/healthz')).json();
  assert.deepEqual([health.ok, health.storage, health.transport], [true, 'ram', 'webrtc-udp']);
  assert.equal((await fetch(base + '/api/join', { method: 'POST' })).status, 410);
  assert.match(await (await fetch(base + '/')).text(), /MOUCHERON_UDP=true/, 'game page served');

  const a = await peer('Alpha');
  clients.push(a.pc);
  const b = await peer('Bravo');
  clients.push(b.pc);
  const aj = await a.request('join', { code: ROOM, name: 'Alpha' });
  const bj = await b.request('join', { code: ROOM, name: 'Bravo' });
  assert.equal(aj.status, 200, JSON.stringify(aj.body));
  assert.equal(bj.status, 200, JSON.stringify(bj.body));
  const started = await a.request('start');
  assert.equal(started.status, 200);
  assert.equal(started.body.mission_started, 1, 'mission started');
  // Mouvement d'Alpha relayé à Bravo par le canal non fiable (lot binaire partagé).
  let motionSeq = 0;
  const send = () =>
    a.motion.sendMessage(
      JSON.stringify({
        v: PROTOCOL,
        seq: ++motionSeq,
        incarnation: 0,
        occupation: 0,
        mode: 'foot',
        state: aj.body.state,
      }),
    );
  const pump = setInterval(send, 50);
  try {
    await until(() => b.peers.includes(aj.body.id), 'Alpha motion relayed to Bravo');
  } finally {
    clearInterval(pump);
  }
  const synced = await b.request('sync', { mode: 'foot', state: bj.body.state });
  assert.equal(synced.status, 200);
  console.log(
    `Image smoke: 2 WebRTC peers over UDP (${a.remote}, ${b.remote}), joined ${ROOM}, mission started, motion relayed.`,
  );
} finally {
  for (const pc of clients) pc.close();
  cleanup();
}
