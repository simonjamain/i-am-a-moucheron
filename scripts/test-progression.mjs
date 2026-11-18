import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { wavePlan, waveBudget, legacyCost } from '../src/waves.js';
assert.deepEqual(
  Array.from({ length: 8 }, (_, i) => waveBudget(i + 1)),
  [8, 10, 14, 18, 24, 30, 38, 46],
);
for (let seed = 0; seed < 40; seed++)
  for (let wave = 1; wave <= 12; wave++) {
    const p = wavePlan('CURVE' + seed, wave, seed);
    assert.equal(
      p.roster.reduce((n, e) => n + legacyCost(e), 0) -
        (p.roster.filter((e) => e.type === 'midge').length / 5) * 4,
      p.budget,
    );
    if (wave === 1) {
      const ants = p.roster.filter((e) => e.type === 'ant').length;
      const midges = p.roster.filter((e) => e.type === 'midge').length;
      assert.ok(ants >= 2, 'all waves guarantee two ants');
      assert.equal(ants + midges / 5, p.budget, 'first wave uses its full budget');
      assert.ok(p.roster.every((e) => ['ant', 'midge'].includes(e.type)));
      assert.ok(Math.max(...p.roster.map((e) => e.spawn + e.duration)) > 100);
    }
    if (seed < 4 && [1, 2, 3, 4, 8].includes(wave)) {
      for (const [source, group] of Map.groupBy(p.roster, (e) => e.sourceId)) {
        const start = Math.floor(source / 4) * 2.4 + (source % 4) * 0.35;
        for (const [member, enemy] of group.entries())
          assert.ok(
            Math.abs(enemy.spawn - start - (enemy.type === 'midge' ? member * 0.07 : 0)) < 1e-8,
            'group spacing stays identical for every wave',
          );
      }
    }
    for (const [type, unlock] of Object.entries({
      ant: 1,
      roach: 3,
      guard: 5,
      brute: 8,
    })) {
      const count = p.roster.filter((e) => e.type === type).length;
      if (wave < unlock) assert.equal(count, 0);
      if (type !== 'ant') assert.ok(count <= 1 + Math.floor(Math.max(0, wave - unlock) / 3));
    }
    assert.ok(
      p.roster.filter((e) => legacyCost(e) > 1).reduce((n, e) => n + legacyCost(e), 0) <=
        Math.floor(p.budget * 0.4),
    );
  }
assert.ok(
  new Set(
    Array.from(
      { length: 40 },
      (_, seed) => wavePlan('CURVE' + seed, 1, seed).roster.filter((e) => e.type === 'ant').length,
    ),
  ).size > 1,
  'first-wave compositions vary with the seed',
);
console.log('PASS: seeded first-wave variety and uniform group spacing, later elite caps.');
