import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { localDB } from './local-db.mjs';
import { ENEMY_TYPES, wavePlan } from '../src/waves.js';
import { blastDamage } from '../src/combat.js';
const DB = localDB();
async function call(path, data) {
  const r = await worker.fetch(
    new Request('https://test/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  return body;
}
const a = await call('join', { name: 'Alpha', code: 'BACKLOG' }),
  b = await call('join', { name: 'Bravo', code: 'BACKLOG' });
assert.deepEqual(Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.hp])), {
  ant: 100,
  roach: 300,
  midge: 100,
  dart: 200,
  guard: 400,
  brute: 800,
});
assert.equal(blastDamage(0, 10), 80);
assert.equal(blastDamage(10, 10), 20);
assert.equal(blastDamage(10.01, 10), 0);
await DB.prepare("UPDATE rooms SET phase='combat',wave=1,started=? WHERE code='BACKLOG'")
  .bind(Date.now())
  .run();
let s = await call('hit', { id: a.id, wave: 1, enemy: 0, amount: 75, shot: 'first' });
assert.equal(s.enemyDamage[0], 75);
assert.ok(!s.kills.includes(0));
s = await call('hit', { id: a.id, wave: 1, enemy: 0, amount: 75, shot: 'second' });
assert.ok(s.kills.includes(0));
s = await call('hit', { id: a.id, wave: 1, enemy: 0, amount: 75, shot: 'second' });
assert.equal(s.enemyDamage[0], 150);
for (let i = 0; i < 9; i++)
  s = await call('friendly-hit', { id: a.id, target: b.id, incarnation: 0, shot: 'p' + i });
assert.equal(s.pilots.find((p) => p.id === b.id).health, 10);
s = await call('friendly-hit', { id: a.id, target: b.id, incarnation: 0, shot: 'p8' });
assert.equal(s.pilots.find((p) => p.id === b.id).health, 10);
s = await call('friendly-hit', { id: a.id, target: b.id, incarnation: 0, shot: 'p9' });
let bp = s.pilots.find((p) => p.id === b.id);
assert.equal(bp.life, 'dead');
assert.equal(bp.health, 100);
assert.equal(bp.incarnation, 1);
assert.equal(s.dollars, 0);
s = await call('death', { id: a.id, incarnation: 0 });
for (let i = 0; i < 10; i++)
  s = await call('friendly-hit', { id: a.id, target: b.id, incarnation: 1, shot: 's' + i });
bp = s.pilots.find((p) => p.id === b.id);
assert.equal(bp.state.realm, 'super');
assert.equal(bp.health, 100);
assert.equal(s.superSouls.length, 1);
assert.ok(!s.superSouls.some((x) => x.kind === 'enemy'));
s = await call('death', { id: b.id, incarnation: 2 });
bp = s.pilots.find((p) => p.id === b.id);
assert.equal(bp.state.realm, 'super');
assert.equal(bp.incarnation, 3);
// Delayed duplicate death must not reset another life.
s = await call('death', { id: b.id, incarnation: 2 });
assert.equal(s.pilots.find((p) => p.id === b.id).incarnation, 3);
async function signAtDesk(id, realm, count) {
  let s = await call('sync', { id, state: a.state });
  for (let form = 1; form <= count; form++) {
    const arena = realm === 'super' ? s.superArena : s.arena;
    const body = arena.bodies.find((b) => b.entity === id);
    body.x = 0;
    body.z = 1.1;
    body.vx = body.vz = 0;
    const { bodyMotion } = await import('../src/purgatory-physics.js');
    s = await call('sign', {
      id,
      form,
      signature: true,
      ground: {
        epoch: arena.epoch,
        body: bodyMotion(body),
        npcs: arena.bodies
          .filter((x) => x.kind === 'enemy')
          .map((x) => bodyMotion({ ...x, x: 5, z: 30 })),
      },
    });
  }
  return s;
}
s = await signAtDesk(b.id, 'super', 5);
bp = s.pilots.find((p) => p.id === b.id);
assert.equal(bp.life, 'dead');
assert.notEqual(bp.state.realm, 'super');
assert.equal(bp.health, 100);
assert.equal(s.souls.find((p) => p.entity === b.id).paper, 0);
// Move the other player aside so the physical desk is accessible.
let arena = s.arena;
let other = arena.bodies.find((x) => x.entity === a.id);
other.x = 5;
const { bodyMotion } = await import('../src/purgatory-physics.js');
await call('sync', {
  id: a.id,
  state: a.state,
  ground: {
    epoch: arena.epoch,
    body: bodyMotion(other),
    npcs: arena.bodies
      .filter((x) => x.kind === 'enemy')
      .map((x) => bodyMotion({ ...x, x: 5, z: 30 })),
  },
});
s = await signAtDesk(b.id, 'purgatory', 3);
bp = s.pilots.find((p) => p.id === b.id);
assert.equal(bp.life, 'alive');
assert.equal(bp.health, 100);
// Ten pistol rounds release an ordinary soul, with only one shared reward.
let soul = s.souls.find((x) => x.kind === 'enemy');
assert.ok(soul);
for (let i = 0; i < 9; i++)
  s = await call('soul-hit', { id: a.id, soul: soul.id, shot: 'npc' + i });
assert.ok(s.souls.some((x) => x.id === soul.id));
s = await call('soul-hit', { id: a.id, soul: soul.id, shot: 'npc9' });
assert.ok(!s.souls.some((x) => x.id === soul.id));
assert.equal(s.dollars, 1);
s = await call('soul-hit', { id: a.id, soul: soul.id, shot: 'npc9' });
assert.equal(s.dollars, 1);
console.log(
  'PASS: damage scale, pistol, duplicate impacts/deaths, isolated worlds, five then three signatures, full resurrection, permanent soul release.',
);
// Direct shells consume their only impact; no splash reaches the neighbour.
const { shellImpact } = await import('../src/combat.js');
for (const hp of [100, 300, 800]) {
  const hit = shellImpact({ id: 0 }, 0, 100);
  assert.equal(hit.kind, 'direct');
  assert.equal(hit.damage, 200);
  assert.equal(Math.max(0, hp - hit.damage), Math.max(0, hp - 200));
}
assert.equal(shellImpact({ wall: true }, 10, 100).kind, 'inert');
assert.equal(shellImpact({ wall: true }, 100, 100).kind, 'blast');
// Host service racing the final pistol hit shares the reward ledger.
await DB.prepare(
  "INSERT INTO souls(room,kind,entity,name,place,enemy_type,damage) VALUES('BACKLOG','enemy','race','Bourdon blindé',99,'brute',790)",
).run();
s = await call('sync', { id: a.id, state: a.state });
soul = s.souls.find((x) => x.entity === 'race');
assert.equal(soul.hp, 10);
const report = {
  epoch: s.arena.epoch,
  body: bodyMotion(s.arena.bodies.find((x) => x.entity === a.id)),
  npcs: s.arena.bodies
    .filter((x) => x.kind === 'enemy')
    .map((x) => bodyMotion({ ...x, gone: x.id === soul.id })),
};
await Promise.all([
  call('soul-hit', { id: a.id, soul: soul.id, shot: 'race-last' }),
  call('sync', { id: a.id, state: a.state, ground: report }),
]);
s = await call('sync', { id: a.id, state: a.state });
assert.equal(s.dollars, 2);
assert.ok(!s.souls.some((x) => x.id === soul.id));
console.log(
  'PASS: direct/safe/obstacle shell classification, normal PV for a resistant soul and service/shot reward race.',
);
