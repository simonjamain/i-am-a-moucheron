import assert from 'node:assert/strict';
import { RemoteRounds, MAX_PENDING_ROUNDS } from '../src/remote-rounds.ts';

const rounds = new RemoteRounds();
// First sight only synchronises: no volley from the past.
rounds.observe('a', 40);
assert.deepEqual(rounds.release('a', 1, 0.1), []);
// Each new number leaves once, paced by the interval; the numbers are the shooter's own.
rounds.observe('a', 43);
const out = [];
for (let t = 0; t < 10; t++) out.push(...rounds.release('a', 0.05, 0.1));
assert.deepEqual(out, [41, 42, 43], 'exact count, exact identities, in order');
// Nothing is banked while idle: three rounds after a pause still leave one by one.
for (let t = 0; t < 20; t++) rounds.release('a', 0.05, 0.1);
rounds.observe('a', 46);
assert.deepEqual(rounds.release('a', 0.016, 0.1), [44], 'the first at once');
assert.deepEqual(rounds.release('a', 0.016, 0.1), [], 'the next one waits for the cadence');
// The pace follows the interval: 5 rounds at 0.06 s need about 0.24 s.
rounds.observe('b', 0);
rounds.observe('b', 5);
let elapsed = 0,
  count = 0;
while (count < 5 && elapsed < 2) {
  count += rounds.release('b', 0.01, 0.06).length;
  elapsed += 0.01;
}
assert.equal(count, 5);
assert.ok(elapsed > 0.23 && elapsed < 0.27, 'paced by the interval (' + elapsed + ')');
// A reset counter, or a huge gap, starts over without a burst.
rounds.observe('a', 3);
assert.deepEqual(rounds.release('a', 1, 0.1), []);
rounds.observe('a', 3 + MAX_PENDING_ROUNDS + 10);
assert.deepEqual(rounds.release('a', 1, 0.1), []);
// Missing or invalid counters are ignored; unknown shooters release nothing.
rounds.observe('c', undefined);
rounds.observe('c', -1);
rounds.observe('c', 1.5);
assert.deepEqual(rounds.release('c', 1, 0.1), []);
rounds.forget('a');
assert.deepEqual(rounds.release('a', 1, 0.1), []);
console.log('PASS: remote rounds: exact count and identities, paced, no volley after a reset.');

// Server and wire: the counter and the reported ricochets cross the server unchanged when well
// formed, and are cleaned when not.
const { Game } = await import('../server/game.js');
const { encodeMotionState: encodeMotion, decodeMotionState: decodeMotion } =
  await import('../src/motion-wire.ts');
let now = 900000;
const game = new Game({ now: () => now });
const joined = game.join({ code: 'RNDS', name: 'Tireur' });
const room = game.rooms.get('RNDS');
const pilot = room.pilots.get(joined.id);
const plane = [...room.vehicles.values()].find((v) => v.type === 'fighter');
game.assign(room, pilot, plane, 'pilot', null);
const send = (extra) => {
  now += 60;
  pilot.seen = now;
  game.command('RNDS', joined.id, 'sync', {
    state: { ...plane.state, vehicle: plane.id, seat: 'pilot', fire: true, ...extra },
    mode: 'flight',
  });
  return room.pilots.get(joined.id).state;
};
const skid = [12, 1, 0.1, 0.2, 0.3, 1, 2, 3];
let state = send({ rounds: 12, skids: [skid] });
assert.equal(state.rounds, 12);
assert.deepEqual(state.skids, [skid]);
state = send({ rounds: -3, skids: [[1, 2, 3], skid.map(() => NaN), 'x', ...Array(20).fill(skid)] });
assert.equal(state.rounds, 0, 'a bad counter becomes 0');
assert.equal(state.skids.length, 8, 'malformed entries dropped, at most eight kept');
state = send({ rounds: 1.5, skids: undefined });
assert.equal(state.rounds, 0);
assert.equal(state.skids, undefined);
const wired = decodeMotion(
  encodeMotion({ ...plane.state, fire: true, rounds: 4000, skids: [skid] }),
);
assert.equal(wired.rounds, 4000, 'the counter has a field of its own in the binary relay');
assert.deepEqual(
  wired.skids,
  [skid].map((k) => k.map((v) => v)),
  'skids ride in the rest field',
);
console.log(
  'PASS: server keeps well-formed rounds/skids, drops malformed ones; both survive the wire.',
);
