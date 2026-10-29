ALTER TABLE pilots ADD COLUMN health INTEGER NOT NULL DEFAULT 100;
--> statement-breakpoint
ALTER TABLE pilots ADD COLUMN incarnation INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE souls ADD COLUMN realm TEXT NOT NULL DEFAULT 'purgatory';
--> statement-breakpoint
ALTER TABLE souls ADD COLUMN enemy_type TEXT NOT NULL DEFAULT 'midge';
--> statement-breakpoint
ALTER TABLE souls ADD COLUMN damage INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN super_state TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN super_revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE health_hits(room TEXT NOT NULL,target TEXT NOT NULL,incarnation INTEGER NOT NULL,shooter TEXT NOT NULL,shot TEXT NOT NULL,amount INTEGER NOT NULL,applied INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room,target,incarnation,shooter,shot));
--> statement-breakpoint
CREATE TABLE seat_requests(id TEXT PRIMARY KEY,room TEXT NOT NULL,vehicle TEXT NOT NULL,requester TEXT NOT NULL,recipient TEXT,from_seat TEXT NOT NULL,to_seat TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'signing',created REAL NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX seat_pending_requester ON seat_requests(requester) WHERE status IN ('signing','offered');

--> statement-breakpoint
UPDATE souls SET enemy_type=CASE name WHEN 'Fourmi' THEN 'ant' WHEN 'Cafard' THEN 'roach' WHEN 'Voltigeur' THEN 'dart' WHEN 'Carapace' THEN 'guard' WHEN 'Bourdon blindé' THEN 'brute' ELSE 'midge' END WHERE kind='enemy';
