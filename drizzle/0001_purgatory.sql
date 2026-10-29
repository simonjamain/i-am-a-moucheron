ALTER TABLE pilots ADD COLUMN life TEXT NOT NULL DEFAULT 'alive';
--> statement-breakpoint
CREATE TABLE souls (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, kind TEXT NOT NULL, entity TEXT NOT NULL, name TEXT NOT NULL, place INTEGER NOT NULL, hp INTEGER NOT NULL DEFAULT 3, stunned_until REAL NOT NULL DEFAULT 0, last_punch REAL NOT NULL DEFAULT 0, ready_at REAL NOT NULL DEFAULT 0, paper INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'waiting');
--> statement-breakpoint
CREATE INDEX souls_queue ON souls(room,status,place);
