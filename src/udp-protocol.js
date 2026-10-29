export const PROTOCOL = 1;
export const COMMAND_CHANNEL = 'commands-v1';
export const MOTION_CHANNEL = 'motion-v2';
export const MOTION_OPTIONS = { ordered: false, maxRetransmits: 0 };
export const MAX_COMMAND_BYTES = 131072;
export const CHUNK_BYTES = 12000;
export const MAX_REPLY_BYTES = 4 * 1024 * 1024;

// Chunk large snapshots below browser/native SCTP message size limits.
export function encodeReply(value, id) {
  const text = JSON.stringify(value);
  if (text.length > MAX_REPLY_BYTES) throw Error('État de salle trop volumineux.');
  const count = Math.ceil(text.length / CHUNK_BYTES) || 1;
  return Array.from({ length: count }, (_, part) =>
    JSON.stringify({
      v: PROTOCOL,
      id,
      part,
      count,
      data: text.slice(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES),
    }),
  );
}
export class ReplyAssembler {
  constructor() {
    this.messages = new Map();
  }
  receive(packet) {
    if (
      !packet ||
      packet.v !== PROTOCOL ||
      !Number.isSafeInteger(packet.id) ||
      !Number.isInteger(packet.count) ||
      packet.count < 1 ||
      packet.count > Math.ceil(MAX_REPLY_BYTES / CHUNK_BYTES) ||
      !Number.isInteger(packet.part) ||
      packet.part < 0 ||
      packet.part >= packet.count ||
      typeof packet.data !== 'string' ||
      packet.data.length > CHUNK_BYTES
    )
      throw Error('Réponse réseau invalide.');
    let m = this.messages.get(packet.id);
    if (!m) {
      if (this.messages.size >= 32) throw Error('Trop de réponses incomplètes.');
      this.messages.set(packet.id, (m = { count: packet.count, parts: new Map(), size: 0 }));
    }
    if (m.count !== packet.count) throw Error('Réponse réseau incohérente.');
    if (!m.parts.has(packet.part)) {
      m.parts.set(packet.part, packet.data);
      m.size += packet.data.length;
    }
    if (m.size > MAX_REPLY_BYTES) throw Error('Réponse réseau trop volumineuse.');
    if (m.parts.size !== m.count) return null;
    this.messages.delete(packet.id);
    return JSON.parse(Array.from({ length: m.count }, (_, i) => m.parts.get(i)).join(''));
  }
  clear() {
    this.messages.clear();
  }
}
export function udpCandidate(candidate) {
  const text = typeof candidate === 'string' ? candidate : candidate?.candidate;
  return typeof text === 'string' && /^candidate:\S+\s+\d+\s+udp\s/i.test(text.trim());
}
export function udpDescription(sdp) {
  return (
    typeof sdp === 'string' &&
    sdp
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('a=candidate:') || udpCandidate(line.slice(2)))
      .join('\r\n')
  );
}
