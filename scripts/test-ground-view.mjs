import assert from 'node:assert/strict';
import { Game, groundAgentsView } from '../server/game.js';

// Clients only draw ground insects: they receive position, heading and arrival,
// rounded, while the server keeps its full steering memory.
const unit = {
  id: 'g1',
  p: [-4.009093115203903, 2.590709601245814],
  dir: [0.7165515858370834, -0.6975341029902128],
  tasted: ['sugar'],
  baitId: 'b2',
  eatingUntil: 12.5,
  stuckUntil: 3,
  stickyInside: ['t1'],
  arrived: false,
  attackId: null,
};
const view = groundAgentsView({ g1: unit, g2: { ...unit, arrived: true } });
assert.deepEqual(Object.keys(view.g1), ['p', 'dir'], 'steering memory stays on the server');
assert.equal(view.g2.arrived, true, 'arrival is kept');
for (let i = 0; i < 2; i++) {
  assert.ok(Math.abs(view.g1.p[i] - unit.p[i]) <= 5e-7, 'position within 1e-6');
  assert.ok(Math.abs(view.g1.dir[i] - unit.dir[i]) <= 5e-5, 'heading within 1e-4');
}
assert.ok(JSON.stringify(view.g1).length < JSON.stringify(unit).length / 3, 'much smaller');
assert.equal(unit.tasted.length, 1, 'the domain unit is not modified');

// In a real room, sync replies carry the view; the domain keeps everything.
let now = 100000;
const game = new Game({ now: () => now });
const { id } = game.join({ code: 'GVIEW', name: 'Alpha' });
const r = game.rooms.get('GVIEW');
game.command('GVIEW', id, 'start', {});
r.next_wave_at = now - 1;
const state = r.pilots.get(id).state;
let reply;
for (let step = 0; step < 400 && !Object.keys(reply?.groundAgents || {}).length; step++) {
  now += 250;
  reply = game.command('GVIEW', id, 'sync', { state, mode: 'foot' });
}
const ids = Object.keys(reply.groundAgents);
assert.ok(ids.length > 0, 'ground insects appear during a wave');
for (const agent of ids) {
  const sent = reply.groundAgents[agent],
    domain = r.groundAgents[agent];
  assert.ok(!('tasted' in sent) && !('stuckUntil' in sent));
  assert.ok(Array.isArray(domain.tasted), 'the server keeps steering memory');
  assert.ok(Math.abs(sent.p[0] - domain.p[0]) <= 5e-7);
}
console.log('Ground view: p/dir/arrived only, 1e-6 position, domain state untouched.');
