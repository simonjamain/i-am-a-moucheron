CREATE TABLE rooms (code TEXT PRIMARY KEY, wave INTEGER NOT NULL DEFAULT 0, started REAL NOT NULL DEFAULT 0, phase TEXT NOT NULL DEFAULT 'prep', fan INTEGER NOT NULL DEFAULT 1, infestation INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE pilots (id TEXT PRIMARY KEY, room TEXT NOT NULL, name TEXT NOT NULL, state TEXT NOT NULL, seen REAL NOT NULL);
--> statement-breakpoint
CREATE INDEX pilots_room ON pilots(room, seen);
--> statement-breakpoint
CREATE TABLE kills (room TEXT NOT NULL, wave INTEGER NOT NULL, enemy INTEGER NOT NULL, pilot TEXT NOT NULL, PRIMARY KEY(room, wave, enemy));
