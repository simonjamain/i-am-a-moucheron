import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function localDB(path = ':memory:') {
  let transaction = Promise.resolve();
  const db = new DatabaseSync(path);
  db.exec(
    readFileSync('drizzle/0000_flight.sql', 'utf8')
      .replaceAll('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ')
      .replaceAll('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS '),
  );
  if (
    !db
      .prepare('PRAGMA table_info(pilots)')
      .all()
      .some((c) => c.name === 'life')
  )
    db.exec(readFileSync('drizzle/0001_purgatory.sql', 'utf8'));
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='signals'").get())
    db.exec(readFileSync('drizzle/0002_signals.sql', 'utf8'));
  if (
    !db
      .prepare('PRAGMA table_info(rooms)')
      .all()
      .some((c) => c.name === 'purgatory')
  )
    db.exec(readFileSync('drizzle/0003_physical_purgatory.sql', 'utf8'));
  if (
    !db
      .prepare('PRAGMA table_info(pilots)')
      .all()
      .some((c) => c.name === 'mode')
  )
    db.exec(readFileSync('drizzle/0004_boarding.sql', 'utf8'));
  if (
    !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='aircraft_slots'").get()
  )
    db.exec(
      'CREATE TABLE aircraft_slots (room TEXT NOT NULL,bay INTEGER NOT NULL,owner TEXT NOT NULL,claimed REAL NOT NULL,PRIMARY KEY(room,bay))',
    );
  if (
    !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='turret_seats'").get()
  )
    db.exec(readFileSync('drizzle/0005_sorties.sql', 'utf8'));
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'").get())
    db.exec(readFileSync('drizzle/0006_fleet_scale.sql', 'utf8'));
  if (
    !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='enemy_damage'").get()
  )
    db.exec(readFileSync('drizzle/0007_enemy_damage.sql', 'utf8'));
  if (
    !db
      .prepare('PRAGMA table_info(rooms)')
      .all()
      .some((c) => c.name === 'dollars')
  )
    db.exec(readFileSync('drizzle/0008_economy.sql', 'utf8'));
  if (
    !db
      .prepare('PRAGMA table_info(pilots)')
      .all()
      .some((c) => c.name === 'health')
  )
    db.exec(readFileSync('drizzle/0009_player_worlds.sql', 'utf8'));
  if (
    !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wave_rewards'").get()
  )
    db.exec(readFileSync('drizzle/0010_wave_rewards.sql', 'utf8'));
  if (
    !db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicle_supplies'")
      .get()
  )
    db.exec(readFileSync('drizzle/0011_logistics_contracts.sql', 'utf8'));
  return {
    prepare(sql) {
      const p = {
        args: [],
        bind(...a) {
          this.args = a;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...this.args) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...this.args) };
        },
        async run() {
          const r = db.prepare(sql).run(...this.args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
      };
      return p;
    },
    async batch(statements) {
      const work = transaction.then(async () => {
        db.exec('BEGIN');
        try {
          const r = [];
          for (const s of statements) r.push(await s.run());
          db.exec('COMMIT');
          return r;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      });
      transaction = work.catch(() => {});
      return work;
    },
  };
}
