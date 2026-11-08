// Server cost of reliable `sync` replies in a crowded room: N players, E enemies.
// CPU-only (no WebRTC, no WAN, no browser): Game + GameSession + wire encoding.
// Usage: node scripts/benchmark-room-sync.mjs [players enemies] ...
import { performance } from 'node:perf_hooks';
import { Game, SNAPSHOT_SHARE_MS } from '../server/game.js';
import { GameSession } from '../server/session.js';
import { PROTOCOL } from '../src/udp-protocol.js';

const args = process.argv.slice(2).map(Number);
const cases = args.length
  ? args.reduce((list, n, i) => (i % 2 ? list : [...list, [n, args[i + 1]]]), [])
  : [
      [2, 300],
      [10, 900],
      [30, 900],
      [50, 900],
    ];
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [players, enemies] of cases) {
  // Simulated clock: each player syncs 4 times per second, evenly spread, as
  // in a real room; players move every 250 ms. CPU time is measured for real.
  let clock = 1_000_000;
  const now = () => clock;
  const game = new Game({ now, snapshotShareMs: SNAPSHOT_SHARE_MS });
  const ids = [];
  for (let i = 0; i < players; i++) ids.push(game.join({ code: 'BENCH', name: 'P' + i }).id);
  const r = game.rooms.get('BENCH');
  game.command('BENCH', ids[0], 'start', {});
  r.next_wave_at = clock - 1;
  game.advance(r);
  // Inflate the real first-wave roster to E enemies, a third killed, some damaged.
  const base = r.plan.roster;
  r.plan = {
    ...r.plan,
    roster: Array.from({ length: enemies }, (_, i) => ({ ...base[i % base.length], id: 'b' + i })),
  };
  r.rosterRevision++;
  for (let i = 0; i < enemies; i += 3) r.kills.add(i);
  for (let i = 1; i < enemies; i += 7) r.enemyDamage[i] = 3;
  let bytes = 0,
    seq = 1;
  const sessions = ids.map((id) => {
    const s = new GameSession(game, {
      now,
      send: (d) => (bytes += d.length),
      relay() {},
      close() {},
    });
    s.player = { code: 'BENCH', id };
    return s;
  });
  const state = r.pilots.get(ids[0]).state;
  const sync = (s) =>
    s.command(
      JSON.stringify({
        v: PROTOCOL,
        id: seq++,
        path: 'sync',
        body: { id: s.player.id, mode: 'foot', state, signalSince: 0, damageSince: 0, vacant: [] },
      }),
    );
  for (const s of sessions) sync(s); // first reply carries the full roster
  const firstKB = bytes / players / 1024;
  const samples = [];
  bytes = 0;
  // Every player moves between rounds, as motion reports do in a real game:
  // pilot states and on-foot bodies change for everyone.
  const move = (round) => {
    for (const p of r.pilots.values())
      p.state = { ...p.state, p: [round * 0.01, 1 + round * 0.01, -round * 0.02], q: [0, 0, 0, 1] };
    for (const body of r.base.bodies || []) {
      body.x += 0.01;
      body.z -= 0.01;
      body.vx = 0.3;
    }
  };
  for (let round = 0; round < 12; round++) {
    move(round + 1);
    let spent = 0;
    for (const s of sessions) {
      clock += 250 / players;
      const start = performance.now();
      sync(s);
      spent += performance.now() - start;
    }
    samples.push(spent / players);
  }
  const ms = median(samples);
  console.log(
    JSON.stringify({
      players,
      enemies,
      msPerSync: +ms.toFixed(3),
      firstSyncKB: +firstKB.toFixed(1),
      steadySyncKB: +(bytes / 12 / players / 1024).toFixed(1),
      serverCorePercentAt4Hz: +((ms * players * 4) / 10).toFixed(1),
    }),
  );
}
