import { encodeReplyV1 } from './fixtures/udp-reply-v1.mjs';
import { performance } from 'node:perf_hooks';
import { encodeReplyText } from '../src/udp-protocol.js';
import { wavePlan } from '../src/waves.js';
import { Game } from '../server/game.js';
const join = new Game({ now: () => 100000 }).join({ code: 'JSONBENCH', name: 'Benchmark' });
const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
for (const wave of [1, 100, 1000]) {
  const reply = {
    status: 200,
    body: { ...join.snapshot, roster: wavePlan('JSONBENCH', wave, 100000).roster },
  };
  const cached = JSON.stringify(reply);
  for (const mode of ['first-send', 'cached-replay']) {
    const run = (optimized) => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        const text = mode === 'first-send' ? JSON.stringify(reply) : cached;
        if (optimized) encodeReplyText(text, i);
        else encodeReplyV1(JSON.parse(text), i);
      }
      return (performance.now() - start) / 100;
    };
    for (let warmup = 0; warmup < 4; warmup++) {
      run(false);
      run(true);
    }
    const before = [],
      after = [];
    for (let n = 0; n < 12; n++) {
      if (n % 2) {
        after.push(run(true));
        before.push(run(false));
      } else {
        before.push(run(false));
        after.push(run(true));
      }
    }
    console.log(
      JSON.stringify({
        wave,
        population: reply.body.roster.length,
        characters: cached.length,
        mode,
        beforeMs: +median(before).toFixed(4),
        afterMs: +median(after).toFixed(4),
        note: 'CPU encoding only; identical wire bytes; excludes network',
      }),
    );
  }
}
