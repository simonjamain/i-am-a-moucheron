import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { wavePlan, waveBudget } from '../src/waves.js';
import { SHOP, shopPrice, waveStipend } from '../src/equipment.js';
import worker from '../worker/index.js';
import { localDB } from './local-db.mjs';
assert.deepEqual(
  Array.from({ length: 8 }, (_, i) => waveBudget(i + 1)),
  [8, 10, 14, 18, 24, 30, 38, 46],
);
for (let seed = 0; seed < 40; seed++)
  for (let wave = 1; wave <= 12; wave++) {
    const p = wavePlan('CURVE' + seed, wave, seed);
    assert.equal(
      p.roster.reduce((n, e) => n + e.cost, 0) -
        (p.roster.filter((e) => e.type === 'midge').length / 5) * 4,
      p.budget,
    );
    if (wave === 1) {
      assert.equal(p.roster.length, 24);
      assert.equal(p.roster.filter((e) => e.type === 'midge').length, 20);
      assert.equal(p.roster.filter((e) => e.type === 'ant').length, 4);
      assert.ok(Math.max(...p.roster.map((e) => e.spawn + e.duration)) > 100);
    }
    for (const [type, unlock] of Object.entries({
      ant: 1,
      dart: 4,
      roach: 6,
      guard: 8,
      brute: 12,
    })) {
      const count = p.roster.filter((e) => e.type === type).length;
      if (wave < unlock) assert.equal(count, 0);
      if (type !== 'ant') assert.ok(count <= 1 + Math.floor(Math.max(0, wave - unlock) / 3));
    }
    assert.ok(
      p.roster.filter((e) => e.cost > 1).reduce((n, e) => n + e.cost, 0) <=
        Math.floor(p.budget * 0.4),
    );
  }
// With zero Saint-Pierre income, wave stipends alone fund a useful purchase
// after each of the first twelve clears. Better interception adds real choice.
let cash = 0,
  installed = 0;
const upgrades = {};
const choices = [
  'dca',
  'engine',
  'weapons',
  'dca',
  'dca',
  'engine',
  'dca',
  'interceptor',
  'dca',
  'weapons',
  'engine',
  'dca',
];
for (let wave = 1; wave <= 12; wave++) {
  cash += waveStipend(wave);
  const key = choices[wave - 1],
    cost = shopPrice(key, upgrades, installed);
  assert.ok(cash >= cost, `wave ${wave}: ${cash} cannot buy ${key} at ${cost}`);
  cash -= cost;
  if (key === 'dca') installed++;
  else upgrades[key] = (upgrades[key] || 0) + 1;
}
const DB = localDB();
let now = Date.now();
const realNow = Date.now;
Date.now = () => now;
async function api(path, data) {
  const r = await worker.fetch(
    new Request('https://test/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  return { status: r.status, body: await r.json() };
}
const a = (await api('join', { name: 'A', code: 'PROGRESS' })).body,
  b = (await api('join', { name: 'B', code: 'PROGRESS' })).body;
await DB.prepare("UPDATE rooms SET phase='combat',wave=1,started=? WHERE code='PROGRESS'")
  .bind(now)
  .run();
for (let enemy = 0; enemy < 24; enemy++) {
  const r = await api('hit', { id: a.id, wave: 1, enemy, shot: 'clear' + enemy, amount: 800 });
  assert.equal(r.status, 200);
}
let s = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(s.phase, 'prep');
assert.equal(s.dollars, 4);
assert.equal(s.rewardCount, 4);
await Promise.all([
  api('sync', { id: a.id, state: a.state }),
  api('sync', { id: b.id, state: b.state }),
]);
s = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(s.dollars, 4);
assert.equal(s.rewardCount, 4);
// End-of-wave income and NPC release are separate, both counted for audio.
let buy = await api('buy', { id: a.id, item: 'engine', request: 'engine-cheap' });
assert.equal(buy.status, 200);
assert.equal(buy.body.dollars, 0);
assert.equal(buy.body.upgrades.engine, 1);
await DB.prepare("UPDATE rooms SET dollars=8 WHERE code='PROGRESS'").run();
assert.equal(
  (await api('buy', { id: a.id, item: 'engine', request: 'engine-expensive' })).status,
  409,
);
await DB.prepare("UPDATE rooms SET dollars=9 WHERE code='PROGRESS'").run();
assert.equal(
  (await api('buy', { id: a.id, item: 'engine', request: 'outdated-price', expectedPrice: 4 }))
    .status,
  409,
);
buy = await api('buy', { id: a.id, item: 'engine', request: 'engine-level-two' });
assert.equal(buy.status, 200);
assert.equal(buy.body.dollars, 0);
assert.equal(
  (await api('buy', { id: a.id, item: 'engine', request: 'engine-level-two' })).status,
  200,
);
// A fully missed extended wave reaches its shared arrival deadline and pays a consolation stipend;
// a lost wave never pays one. Neither branch needs real waiting.
await DB.prepare(
  "UPDATE rooms SET phase='combat',wave=2,started=?,infestation=19 WHERE code='PROGRESS'",
)
  .bind(now - 2000000)
  .run();
s = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(s.phase, 'lost');
assert.equal(s.dollars, 0);
assert.equal(s.rewardCount, 4);
await api('reset', { id: a.id });
s = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(s.rewardCount, 0);
assert.equal(s.dollars, 0);
await DB.prepare("UPDATE rooms SET phase='combat',wave=1,started=? WHERE code='PROGRESS'")
  .bind(now)
  .run();
// Leave eight enemies to arrive, below defeat; a completely missed 24-enemy
// first wave now correctly exceeds the unchanged infestation limit.
for (let enemy = 8; enemy < 24; enemy++)
  await api('hit', { id: a.id, wave: 1, enemy, shot: 'partial' + enemy, amount: 800 });
now += 2000000;
s = (await api('sync', { id: a.id, state: a.state })).body;
assert.equal(s.phase, 'prep');
assert.equal(s.infestation, 8);
assert.equal(s.dollars, 4);
Date.now = realNow;
console.log(
  'PASS: gentle seeded waves, extended mixed first wave, later elite caps, twelve affordable purchase rounds, exact-once completion stipends, tier pricing, failure and reset.',
);
