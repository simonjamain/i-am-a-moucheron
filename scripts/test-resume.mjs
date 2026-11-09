import assert from 'node:assert/strict';
import { Game, PRESENCE_MS, RESUME_MS } from '../server/game.js';

let now = 300000;
const game = new Game({ now: () => now, resumable: true });
const a = game.join({ code: 'RESUME', name: 'Alpha' });
const r = game.rooms.get('RESUME');
const pilot = r.pilots.get(a.id);
const vehicle = [...r.vehicles.values()][0];
// The pilot sits in an aircraft when its connection drops.
pilot.mode = 'flight';
pilot.vehicle_id = vehicle.id;
pilot.seat = 'pilot';
vehicle.seats.set('pilot', pilot.id);
now += 1000;
game.disconnect('RESUME', a.id);
assert.equal(vehicle.seats.get('pilot'), a.id, 'a dropped connection keeps the seat');
assert.equal(game.live(r).length, 1, 'and the pilot stays present');
now += PRESENCE_MS + 5000;
assert.equal(game.live(r).length, 0, 'a silent pilot is hidden after the presence delay');
game.advance(r);
assert.equal(vehicle.seats.get('pilot'), a.id, 'but keeps its seat until RESUME_MS');
const back = game.join({ code: 'RESUME', name: 'Alpha', resumeKey: a.resumeKey, resume: a.id });
assert.equal(back.id, a.id, 'the same pilot is resumed');
assert.equal(back.resumed, true);
assert.equal(back.snapshot.pilots.find((p) => p.id === a.id).vehicle_id, vehicle.id);
assert.equal(r.pilots.size, 1, 'resume never creates another pilot');
assert.throws(
  () => game.join({ code: 'RESUME', resumeKey: 'wrong', resume: a.id }),
  (e) => e.status === 410,
  'a wrong identity key is refused',
);
assert.throws(
  () => game.join({ code: 'RESUME', resumeKey: a.resumeKey, resume: 'nobody' }),
  (e) => e.status === 410,
);
// Without any message for RESUME_MS, the pilot leaves and frees its seat.
game.disconnect('RESUME', a.id);
now += RESUME_MS + 1;
game.advance(r);
assert.equal(r.pilots.has(a.id), false, 'an expired pilot leaves');
assert.equal(vehicle.seats.has('pilot'), false, 'and releases its seat');
assert.throws(
  () => game.join({ code: 'RESUME', resumeKey: a.resumeKey, resume: a.id }),
  (e) => e.status === 410,
  'an expired pilot cannot be resumed',
);
assert.equal(r.pilots.size, 0, 'a refused resume creates nobody');
// A deliberate departure frees the seat at once and cannot be resumed.
const b = game.join({ code: 'RESUME', name: 'Bravo' });
const pb = r.pilots.get(b.id);
pb.mode = 'flight';
pb.vehicle_id = vehicle.id;
pb.seat = 'pilot';
vehicle.seats.set('pilot', pb.id);
game.command('RESUME', b.id, 'leave', {});
assert.equal(vehicle.seats.has('pilot'), false, 'leave releases the seat at once');
assert.equal(r.pilots.has(b.id), false, 'and removes the pilot');
assert.throws(
  () => game.join({ code: 'RESUME', resumeKey: b.resumeKey, resume: b.id }),
  (e) => e.status === 410,
);
// Default games keep the immediate release and refuse resumes.
const strict = new Game({ now: () => now });
const s = strict.join({ code: 'STRICT', name: 'Bravo' });
strict.disconnect('STRICT', s.id);
assert.equal(strict.live(strict.rooms.get('STRICT')).length, 0);
assert.throws(
  () => strict.join({ code: 'STRICT', resumeKey: s.resumeKey, resume: s.id }),
  (e) => e.status === 410,
);
console.log(
  'Resume: same pilot and seat after a drop (hidden after 12 s, kept 30 s), identity check, expiry, leave.',
);
