ALTER TABLE pilots ADD COLUMN mode TEXT NOT NULL DEFAULT 'foot';
--> statement-breakpoint
ALTER TABLE pilots ADD COLUMN bay INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE pilots ADD COLUMN board_paper INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN base_state TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN base_revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE aircraft_slots (room TEXT NOT NULL, bay INTEGER NOT NULL, owner TEXT NOT NULL, claimed REAL NOT NULL, PRIMARY KEY(room,bay));
