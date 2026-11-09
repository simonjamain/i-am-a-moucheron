// Binary relay of player motion, server -> browsers, on the lossy channel.
//
// A motion state is encoded once by the server when it is accepted, then the
// same bytes go to every player of the room in shared batches (one batch per
// room and tick, split below the UDP payload size). Browsers -> server motion
// stays JSON (one message per player): the server keeps full precision.
//
// Each object is a presence mask over a fixed schema, the present fields, then
// an optional JSON "rest" for fields the schema does not know or a value its
// codec does not accept. Decoding therefore never loses a field. Precision:
//   vec3 / real (non-integer) : float32
//   quat                      : int16 per component, step 1.5 / 32767
//   num                       : exact (integers int32, others float64)
//   str                       : exact; UUIDs packed on 16 bytes
// JSON semantics apply: undefined fields are absent; NaN decodes as null.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const MAX_STRING = 255;
const MAX_REST = 4096;
const QUAT_SCALE = 1.5 / 32767;

const INPUT = [
  ['x', 'real'],
  ['z', 'real'],
  ['guard', 'bool'],
];
const BODY = [
  ['id', 'num'],
  ['x', 'real'],
  ['z', 'real'],
  ['vx', 'real'],
  ['vz', 'real'],
  ['face', 'real'],
  ['balance', 'real'],
  ['koUntil', 'num'],
  ['hitAt', 'num'],
  ['hitX', 'real'],
  ['hitZ', 'real'],
  ['nextAttack', 'num'],
  ['nextDash', 'num'],
  ['served', 'num'],
  ['queueTicket', 'num'],
  ['input', INPUT],
  ['attack', 'json'],
  ['gone', 'bool'],
  ['y', 'real'],
  ['vy', 'real'],
  ['parachute', 'bool'],
  ['grounded', 'bool'],
];
const GROUND = [
  ['scene', 'str'],
  ['epoch', 'str'],
  ['body', BODY],
];
const SOUL = [
  ['x', 'real'],
  ['z', 'real'],
  ['vx', 'real'],
  ['vz', 'real'],
  ['face', 'real'],
];
export const MOTION_SCHEMA = [
  ['p', 'vec3'],
  ['q', 'quat'],
  ['v', 'vec3'],
  ['hp', 'real'],
  ['type', 'str'],
  ['collective', 'real'],
  ['rotorPower', 'real'],
  ['wing', 'u8'],
  ['engine', 'u8'],
  ['fire', 'bool'],
  ['vehicle', 'str'],
  ['seat', 'str'],
  ['soul', SOUL],
  ['landed', 'bool'],
  ['gas', 'real'],
  ['trailerAngle', 'real'],
  ['omega', 'vec3'],
  ['turret', 'num'],
  ['turretDirection', 'vec3'],
  ['aimPoint', 'vec3'],
  ['ground', GROUND],
];

class Writer {
  constructor() {
    this.bytes = new Uint8Array(256);
    this.view = new DataView(this.bytes.buffer);
    this.length = 0;
  }
  room(n) {
    if (this.length + n <= this.bytes.length) return;
    const next = new Uint8Array(Math.max(this.bytes.length * 2, this.length + n));
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
    this.view = new DataView(next.buffer);
  }
  u8(v) {
    this.room(1);
    this.view.setUint8(this.length++, v);
  }
  u16(v) {
    this.room(2);
    this.view.setUint16(this.length, v);
    this.length += 2;
  }
  u32(v) {
    this.room(4);
    this.view.setUint32(this.length, v);
    this.length += 4;
  }
  i16(v) {
    this.room(2);
    this.view.setInt16(this.length, v);
    this.length += 2;
  }
  i32(v) {
    this.room(4);
    this.view.setInt32(this.length, v);
    this.length += 4;
  }
  f32(v) {
    this.room(4);
    this.view.setFloat32(this.length, v);
    this.length += 4;
  }
  f64(v) {
    this.room(8);
    this.view.setFloat64(this.length, v);
    this.length += 8;
  }
  raw(bytes) {
    this.room(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }
  done() {
    return this.bytes.slice(0, this.length);
  }
}
class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
  }
  take(n) {
    if (this.offset + n > this.bytes.length) throw RangeError('Paquet de mouvement tronqué.');
    const at = this.offset;
    this.offset += n;
    return at;
  }
  u8() {
    return this.view.getUint8(this.take(1));
  }
  u16() {
    return this.view.getUint16(this.take(2));
  }
  u32() {
    return this.view.getUint32(this.take(4));
  }
  i16() {
    return this.view.getInt16(this.take(2));
  }
  i32() {
    return this.view.getInt32(this.take(4));
  }
  f32() {
    return this.view.getFloat32(this.take(4));
  }
  f64() {
    return this.view.getFloat64(this.take(8));
  }
  raw(n) {
    const at = this.take(n);
    return this.bytes.subarray(at, at + n);
  }
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const nanToNull = (v) => (Number.isNaN(v) ? null : v);

function accepts(codec, value) {
  if (Array.isArray(codec)) return value === null || plain(value);
  switch (codec) {
    case 'vec3':
      return finite3(value);
    case 'quat':
      return (
        Array.isArray(value) &&
        value.length === 4 &&
        value.every((n) => Number.isFinite(n) && Math.abs(n) <= 1.5)
      );
    case 'real':
    case 'num':
      return typeof value === 'number' && Number.isFinite(value);
    case 'u8':
      return Number.isInteger(value) && value >= 0 && value <= 255;
    case 'bool':
      return typeof value === 'boolean';
    case 'str':
      return (
        value === null ||
        (typeof value === 'string' &&
          (UUID.test(value) || encoder.encode(value).length <= MAX_STRING))
      );
    case 'json':
      return true;
  }
  return false;
}
function writeString(w, value) {
  if (value === null) return w.u8(0);
  if (UUID.test(value)) {
    w.u8(1);
    const hex = value.replace(/-/g, '');
    for (let i = 0; i < 32; i += 2) w.u8(parseInt(hex.slice(i, i + 2), 16));
    return;
  }
  const bytes = encoder.encode(value);
  w.u8(2);
  w.u8(bytes.length);
  w.raw(bytes);
}
function readString(r) {
  const tag = r.u8();
  if (tag === 0) return null;
  if (tag === 1) {
    const hex = [...r.raw(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  }
  if (tag === 2) return decoder.decode(r.raw(r.u8()));
  throw RangeError('Chaîne de mouvement invalide.');
}
function writeNumber(w, value, exact) {
  if (value === 0 && !Object.is(value, -0)) return w.u8(0);
  if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
    w.u8(1);
    return w.i32(value);
  }
  if (exact) {
    w.u8(3);
    return w.f64(value);
  }
  w.u8(2);
  w.f32(value);
}
function readNumber(r) {
  const tag = r.u8();
  if (tag === 0) return 0;
  if (tag === 1) return r.i32();
  if (tag === 2) return nanToNull(r.f32());
  if (tag === 3) return nanToNull(r.f64());
  throw RangeError('Nombre de mouvement invalide.');
}
function writeJson(w, value) {
  const bytes = encoder.encode(JSON.stringify(value) ?? 'null');
  if (bytes.length > MAX_REST) throw RangeError('Champ de mouvement trop long.');
  w.u16(bytes.length);
  w.raw(bytes);
}
function readJson(r) {
  return JSON.parse(decoder.decode(r.raw(r.u16())));
}
function writeValue(w, codec, value) {
  if (Array.isArray(codec)) {
    if (value === null) return w.u8(0);
    w.u8(1);
    return writeObject(w, codec, value);
  }
  switch (codec) {
    case 'vec3':
      return value.forEach((n) => w.f32(n));
    case 'quat':
      return value.forEach((n) => w.i16(Math.round(n / QUAT_SCALE)));
    case 'real':
      return writeNumber(w, value, false);
    case 'num':
      return writeNumber(w, value, true);
    case 'u8':
      return w.u8(value);
    case 'bool':
      return w.u8(value ? 1 : 0);
    case 'str':
      return writeString(w, value);
    case 'json':
      return writeJson(w, value);
  }
}
function readValue(r, codec, depth) {
  if (Array.isArray(codec)) return r.u8() ? readObject(r, codec, depth + 1) : null;
  switch (codec) {
    case 'vec3':
      return [nanToNull(r.f32()), nanToNull(r.f32()), nanToNull(r.f32())];
    case 'quat':
      return [r.i16(), r.i16(), r.i16(), r.i16()].map((n) => n * QUAT_SCALE);
    case 'real':
    case 'num':
      return readNumber(r);
    case 'u8':
      return r.u8();
    case 'bool':
      return r.u8() === 1;
    case 'str':
      return readString(r);
    case 'json':
      return readJson(r);
  }
  throw RangeError('Schéma de mouvement invalide.');
}
function writeObject(w, schema, object) {
  let mask = 0;
  const known = new Set();
  schema.forEach(([key, codec], i) => {
    known.add(key);
    if (Object.hasOwn(object, key) && object[key] !== undefined && accepts(codec, object[key]))
      mask |= 1 << i;
  });
  w.u32(mask >>> 0);
  schema.forEach(([key, codec], i) => {
    if (mask & (1 << i)) writeValue(w, codec, object[key]);
  });
  const rest = {};
  let extra = false;
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || typeof value === 'function') continue;
    const index = schema.findIndex(([name]) => name === key);
    if (known.has(key) && mask & (1 << index)) continue;
    rest[key] = value;
    extra = true;
  }
  if (extra) {
    w.u8(1);
    writeJson(w, rest);
  } else w.u8(0);
}
function readObject(r, schema, depth = 0) {
  if (depth > 4) throw RangeError('Mouvement trop imbriqué.');
  const mask = r.u32(),
    object = {};
  schema.forEach(([key, codec], i) => {
    if (mask & (1 << i)) object[key] = readValue(r, codec, depth);
  });
  if (mask >>> schema.length) throw RangeError('Masque de mouvement invalide.');
  if (r.u8()) {
    const rest = readJson(r);
    if (!plain(rest)) throw RangeError('Complément de mouvement invalide.');
    for (const [key, value] of Object.entries(rest)) if (key !== '__proto__') object[key] = value;
  }
  return object;
}

export function encodeMotionState(state) {
  const w = new Writer();
  writeObject(w, MOTION_SCHEMA, state);
  return w.done();
}
export function decodeMotionState(bytes) {
  const r = new Reader(bytes);
  const state = readObject(r, MOTION_SCHEMA);
  if (r.offset !== bytes.length) throw RangeError('Mouvement de longueur invalide.');
  return state;
}

// Batch: 'M', version, server time (float64 ms), entry count, then per entry
// the peer ID, its motion sequence, the age of the state in the batch (ms,
// time since the server accepted it) and the encoded state.
export const MOTION_BATCH_VERSION = 1;
export const MOTION_BATCH_BYTES = 1100;
const MAGIC = 0x4d;
export function encodeMotionBatch(time, entries, maxBytes = MOTION_BATCH_BYTES) {
  const chunks = [];
  let w = null,
    count = 0,
    countAt = 0;
  const flush = () => {
    if (!w) return;
    w.view.setUint8(countAt, count);
    chunks.push(w.done());
    w = null;
  };
  for (const entry of entries) {
    const body = new Writer();
    writeString(body, entry.peer);
    writeNumber(body, entry.seq, true);
    body.u16(Math.max(0, Math.min(65535, Math.round(time - entry.at))));
    body.u16(entry.bytes.length);
    body.raw(entry.bytes);
    const piece = body.done();
    if (w && (w.length + piece.length > maxBytes || count === 255)) flush();
    if (!w) {
      w = new Writer();
      w.u8(MAGIC);
      w.u8(MOTION_BATCH_VERSION);
      w.f64(time);
      countAt = w.length;
      w.u8(0);
      count = 0;
    }
    w.raw(piece);
    count++;
  }
  flush();
  return chunks;
}
export function decodeMotionBatch(data) {
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(data.buffer ? data.buffer : data);
  const r = new Reader(bytes);
  if (r.u8() !== MAGIC || r.u8() !== MOTION_BATCH_VERSION)
    throw RangeError('Lot de mouvements inconnu.');
  const time = r.f64(),
    count = r.u8(),
    entries = [];
  for (let i = 0; i < count; i++) {
    const peer = readString(r),
      seq = readNumber(r),
      age = r.u16(),
      state = decodeMotionState(r.raw(r.u16()));
    entries.push({ peer, seq, age, state });
  }
  if (r.offset !== bytes.length) throw RangeError('Lot de mouvements de longueur invalide.');
  return { time, entries };
}
