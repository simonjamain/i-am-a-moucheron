import assert from 'node:assert/strict';
import { Game, CONTACT_FRAME_MS } from '../server/game.js';
import { swarmFrame } from '../src/waves.js';
import { airField } from '../src/air-current.js';

// Vehicle contacts reuse enemy positions for at most CONTACT_FRAME_MS, then
// recompute them; roster changes and clock regressions always recompute.
let now = 200000;
const game = new Game({ now: () => now });
const { id } = game.join({ code: 'FRAMES', name: 'Alpha' });
const r = game.rooms.get('FRAMES');
game.command('FRAMES', id, 'start', {});
r.next_wave_at = now - 1;
game.advance(r);
assert.equal(r.phase, 'combat');
const plan = game.plan(r);
const first = game.contactFrames(r, plan, now);
const exact = swarmFrame(
  plan.roster,
  (now - r.started) / 1000,
  r.groundAgents,
  airField(r.groundDefense, now),
);
assert.deepEqual(first, exact, 'cached positions equal a direct swarm computation');
now += CONTACT_FRAME_MS - 1;
assert.equal(game.contactFrames(r, plan, now), first, 'positions are reused inside the window');
now += 1;
assert.notEqual(
  game.contactFrames(r, plan, now),
  first,
  'positions are recomputed after the window',
);
const second = game.contactFrames(r, plan, now);
r.rosterRevision++;
assert.notEqual(game.contactFrames(r, plan, now), second, 'a roster revision recomputes');
const third = game.contactFrames(r, plan, now);
assert.notEqual(game.contactFrames(r, plan, now - 1), third, 'a clock going back recomputes');

// A vehicle sweeping through an enemy is still hit when positions come from the cache.
now += 5000;
const live = game.contactFrames(r, plan, now);
const target = live.findIndex((f, i) => f && !r.kills.has(i));
assert.ok(target >= 0, 'an enemy is flying');
const v = [...r.vehicles.values()][0];
const p = live[target].p;
v.contactWave = r.wave;
v.contactPosition = [p[0] - 1, p[1], p[2]];
v.contacts = [];
v.state = { ...v.state, p: [p[0] + 1, p[1], p[2]], hp: 100 };
now += CONTACT_FRAME_MS / 2;
game.vehicleContacts(r, now);
assert.ok(v.contacts.includes(target), 'the swept vehicle segment still reaches the cached enemy');
assert.ok(v.state.hp < 100, 'the contact still damages the vehicle');
console.log('Contact frames: cache ≤ ' + CONTACT_FRAME_MS + ' ms, invalidation, swept contacts OK');
